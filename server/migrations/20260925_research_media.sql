-- R2 private media. Apply after research_versions; no storage bucket is created here.
BEGIN;
ALTER TABLE public.research_access_grants
  ADD COLUMN max_storage_bytes bigint NOT NULL DEFAULT 1073741824 CHECK (max_storage_bytes BETWEEN 1 AND 1099511627776),
  ADD COLUMN max_transcription_seconds bigint NOT NULL DEFAULT 3600 CHECK (max_transcription_seconds BETWEEN 1 AND 100000000);

CREATE TABLE public.research_source_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  upload_key text NOT NULL UNIQUE,
  object_key text NOT NULL UNIQUE,
  declared_size_bytes bigint NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 104857600),
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes BETWEEN 0 AND 209715200),
  verified_size_bytes bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  verified_mime text,
  duration_seconds integer,
  transcription_seconds_reserved integer NOT NULL DEFAULT 0 CHECK (transcription_seconds_reserved BETWEEN 0 AND 7200),
  auto_summary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (status IN ('awaiting_upload','ready','processing','completed','failed','canceled','expired','deleting','deleted')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('ready','processing','completed','failed') AND verified_size_bytes IS NOT NULL AND sha256 IS NOT NULL AND verified_mime IS NOT NULL AND duration_seconds IS NOT NULL)
    OR status IN ('awaiting_upload','canceled','expired','deleting','deleted'))
);
CREATE INDEX research_assets_interview ON public.research_source_assets(interview_id,created_at DESC);
CREATE INDEX research_assets_expiry ON public.research_source_assets(expires_at) WHERE status='awaiting_upload';
CREATE INDEX research_assets_retention ON public.research_source_assets(retention_until) WHERE status IN ('completed','failed','canceled');
ALTER TABLE public.research_source_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_source_assets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_source_assets TO service_role;

ALTER TABLE public.research_analysis_jobs DROP CONSTRAINT research_analysis_jobs_kind_check;
ALTER TABLE public.research_analysis_jobs ADD CONSTRAINT research_analysis_jobs_kind_check
  CHECK (kind IN ('interview_summary','study_synthesis','media_transcription'));
ALTER TABLE public.research_analysis_jobs DROP CONSTRAINT research_analysis_jobs_check;
ALTER TABLE public.research_analysis_jobs ADD CONSTRAINT research_analysis_jobs_check
  CHECK ((kind='study_synthesis')=(interview_id IS NULL));
ALTER TABLE public.research_analysis_jobs DROP CONSTRAINT research_analysis_jobs_status_check;
ALTER TABLE public.research_analysis_jobs ADD CONSTRAINT research_analysis_jobs_status_check
  CHECK (status IN ('queued','running','completed','stale','failed','canceled'));

CREATE FUNCTION public.research_begin_upload(p_user_id uuid,p_interview_id uuid,p_size_bytes bigint,p_auto_summary boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.interviews; s public.research_studies; owner_uuid uuid; grant_limit bigint; used bigint; a public.research_source_assets; new_id uuid;
BEGIN
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 104857600 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id IS NOT NULL AND research_archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  owner_uuid := public.research_require_write(p_user_id,i.workspace_id);
  SELECT * INTO s FROM public.research_studies WHERE id=i.study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT max_storage_bytes INTO grant_limit FROM public.research_access_grants WHERE user_id=owner_uuid;
  SELECT coalesce(sum(asset_row.reserved_bytes),0) INTO used FROM public.research_source_assets asset_row JOIN public.workspaces w ON w.id=asset_row.workspace_id
    WHERE w.owner_id=owner_uuid AND asset_row.status<>'deleted';
  IF used+2*p_size_bytes>grant_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  new_id := gen_random_uuid();
  INSERT INTO public.research_source_assets(id,workspace_id,study_id,interview_id,requested_by,upload_key,object_key,declared_size_bytes,reserved_bytes,auto_summary)
    VALUES(new_id,i.workspace_id,i.study_id,i.id,p_user_id,i.workspace_id::text || '/' || i.id::text || '/incoming/' || new_id::text,
      i.workspace_id::text || '/' || i.id::text || '/sealed/' || new_id::text,p_size_bytes,2*p_size_bytes,coalesce(p_auto_summary,false)) RETURNING * INTO a;
  RETURN to_jsonb(a);
END $$;

CREATE FUNCTION public.research_finalize_upload(p_user_id uuid,p_asset_id uuid,p_size_bytes bigint,p_sha256 text,p_mime text,p_duration_seconds integer,p_auto_summary boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.research_source_assets; i public.interviews; s public.research_studies; owner_uuid uuid; seconds_limit bigint; seconds_used bigint; j public.research_analysis_jobs;
BEGIN
  SELECT * INTO a FROM public.research_source_assets WHERE id=p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  owner_uuid := public.research_require_write(p_user_id,a.workspace_id);
  SELECT * INTO a FROM public.research_source_assets WHERE id=p_asset_id FOR UPDATE;
  IF a.status IN ('ready','processing','completed','failed') THEN
    SELECT * INTO j FROM public.research_analysis_jobs WHERE kind='media_transcription' AND settings->>'asset_id'=a.id::text ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('asset',to_jsonb(a),'job',to_jsonb(j));
  END IF;
  IF a.status<>'awaiting_upload' OR a.expires_at<=now() THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND a.declared_size_bytes OR p_sha256 !~ '^[0-9a-f]{64}$'
    OR p_mime NOT IN ('audio/mpeg','audio/mp4','audio/wav','audio/webm','video/mp4') OR p_duration_seconds NOT BETWEEN 1 AND 7200
    THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO i FROM public.interviews WHERE id=a.interview_id AND research_archived_at IS NULL FOR UPDATE;
  SELECT * INTO s FROM public.research_studies WHERE id=a.study_id AND archived_at IS NULL;
  IF i.id IS NULL OR s.id IS NULL OR i.study_id<>s.id THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT max_transcription_seconds INTO seconds_limit FROM public.research_access_grants WHERE user_id=owner_uuid;
  SELECT coalesce(sum(asset_row.transcription_seconds_reserved),0) INTO seconds_used FROM public.research_source_assets asset_row JOIN public.workspaces w ON w.id=asset_row.workspace_id
    WHERE w.owner_id=owner_uuid;
  IF seconds_used+p_duration_seconds>seconds_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  UPDATE public.research_source_assets SET status='ready',verified_size_bytes=p_size_bytes,sha256=p_sha256,verified_mime=p_mime,
    duration_seconds=p_duration_seconds,transcription_seconds_reserved=p_duration_seconds,auto_summary=coalesce(p_auto_summary,a.auto_summary),
    retention_until=now()+interval '30 days',updated_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.research_analysis_jobs(workspace_id,study_id,interview_id,requested_by,kind,study_revision,context_revision,study_version_id,
    transcript_revision,transcript_version_id,summary_revision,settings,pipeline_version)
    VALUES(a.workspace_id,s.id,i.id,p_user_id,'media_transcription',s.revision,s.context_revision,s.current_version_id,
      i.transcript_revision,i.current_transcript_version_id,i.summary_revision,jsonb_build_object('asset_id',a.id,'auto_summary',a.auto_summary),'research-media-v1') RETURNING * INTO j;
  RETURN jsonb_build_object('asset',to_jsonb(a),'job',to_jsonb(j));
END $$;

CREATE FUNCTION public.research_cancel_upload(p_user_id uuid,p_asset_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.research_source_assets;
BEGIN
  SELECT * INTO a FROM public.research_source_assets WHERE id=p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,a.workspace_id);
  UPDATE public.research_analysis_jobs SET status='canceled',claim_token=NULL,lease_until=NULL,updated_at=now()
    WHERE kind='media_transcription' AND settings->>'asset_id'=a.id::text AND status IN ('queued','running');
  SELECT * INTO a FROM public.research_source_assets WHERE id=p_asset_id FOR UPDATE;
  IF a.status IN ('canceled','expired','deleted') THEN RETURN to_jsonb(a); END IF;
  IF a.status='completed' THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  UPDATE public.research_source_assets SET status='canceled',
    transcription_seconds_reserved=CASE WHEN status='awaiting_upload' THEN 0 ELSE transcription_seconds_reserved END,
    retention_until=now(),updated_at=now() WHERE id=a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
END $$;

CREATE FUNCTION public.research_finish_media_analysis(p_job_id uuid,p_claim_token uuid,p_transcript jsonb,p_provider jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; a public.research_source_assets; i public.interviews; s public.research_studies; valid_source boolean;
BEGIN
  -- Match the grant → source lock order used by edits and quota reservations.
  PERFORM 1 FROM public.research_access_grants grant_row JOIN public.workspaces owner_workspace ON owner_workspace.owner_id=grant_row.user_id
    JOIN public.research_analysis_jobs source_job ON source_job.workspace_id=owner_workspace.id WHERE source_job.id=p_job_id FOR UPDATE OF grant_row;
  SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.kind<>'media_transcription' OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now()
    THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
  IF jsonb_typeof(p_transcript)<>'array' OR jsonb_array_length(p_transcript)=0 OR jsonb_typeof(p_provider)<>'object' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO a FROM public.research_source_assets WHERE id=(j.settings->>'asset_id')::uuid FOR UPDATE;
  SELECT * INTO s FROM public.research_studies WHERE id=j.study_id FOR UPDATE;
  SELECT * INTO i FROM public.interviews WHERE id=j.interview_id FOR UPDATE;
  valid_source := a.id IS NOT NULL AND a.status IN ('ready','processing') AND s.id IS NOT NULL AND s.archived_at IS NULL
    AND s.current_version_id=j.study_version_id AND i.id IS NOT NULL AND i.research_archived_at IS NULL
    AND i.current_transcript_version_id=j.transcript_version_id AND i.transcript_revision=j.transcript_revision
    AND EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id WHERE w.id=j.workspace_id
      AND g.expires_at>now() AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by)));
  IF valid_source THEN
    PERFORM set_config('research.recording_ref',a.id::text,true);
    PERFORM set_config('research.actor_id','',true);
    UPDATE public.interviews SET transcript_data=p_transcript,status='completed',research_revision=research_revision+1,
      summary_stale=coalesce(summary_data - '_system','{}'::jsonb)<>'{}'::jsonb,updated_at=now() WHERE id=i.id;
    UPDATE public.research_source_assets SET status='completed',updated_at=now() WHERE id=a.id;
  ELSE
    UPDATE public.research_source_assets SET status='failed',updated_at=now() WHERE id=a.id AND status IN ('ready','processing');
  END IF;
  UPDATE public.research_analysis_jobs SET status=CASE WHEN valid_source THEN 'completed' ELSE 'stale' END,
    output=jsonb_build_object('transcript_version_id',CASE WHEN valid_source THEN (SELECT current_transcript_version_id FROM public.interviews WHERE id=i.id) ELSE NULL END,
      'provider',p_provider,'asset_id',a.id),claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_fail_media_analysis(p_job_id uuid,p_claim_token uuid,p_error_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs;
BEGIN
  SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.kind<>'media_transcription' OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now()
    THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
  UPDATE public.research_analysis_jobs SET status=CASE WHEN attempts<2 THEN 'queued' ELSE 'failed' END,
    available_at=now()+interval '2 minutes',error_code=left(coalesce(p_error_code,'TRANSCRIPTION_FAILED'),80),
    claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  IF j.status='failed' THEN UPDATE public.research_source_assets SET status='failed',updated_at=now() WHERE id=(j.settings->>'asset_id')::uuid; END IF;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_expire_uploads() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.research_source_assets SET status='expired',updated_at=now()
    WHERE status='awaiting_upload' AND expires_at<=now();
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION public.research_mark_media_deleting(p_asset_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.research_source_assets;
BEGIN
  SELECT * INTO a FROM public.research_source_assets WHERE id=p_asset_id FOR UPDATE;
  IF NOT FOUND OR a.status='deleted' OR a.created_at+interval '25 hours'>now() THEN RETURN false; END IF;
  IF a.status='deleting' THEN RETURN true; END IF;
  IF NOT (a.status IN ('expired','canceled') OR (a.status IN ('completed','failed') AND a.retention_until<=now())) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.research_analysis_jobs j WHERE j.kind='media_transcription' AND j.settings->>'asset_id'=a.id::text
    AND j.status IN ('queued','running')) THEN RETURN false; END IF;
  UPDATE public.research_source_assets SET status='deleting',updated_at=now() WHERE id=a.id;
  RETURN true;
END $$;
CREATE FUNCTION public.research_confirm_media_deleted(p_asset_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.research_source_assets SET status='deleted',reserved_bytes=0,updated_at=now() WHERE id=p_asset_id AND status='deleting';
  RETURN FOUND;
END $$;

CREATE FUNCTION public.research_asset_keys_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.upload_key IS DISTINCT FROM OLD.upload_key OR NEW.object_key IS DISTINCT FROM OLD.object_key
    THEN RAISE EXCEPTION 'RESEARCH_IMMUTABLE_ASSET'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_asset_keys_immutable BEFORE UPDATE ON public.research_source_assets FOR EACH ROW EXECUTE FUNCTION public.research_asset_keys_immutable();

-- A new dispatcher must explicitly request media support. Existing no-arg worker stays on two old kinds.
CREATE OR REPLACE FUNCTION public.research_claim_supported_analysis(p_supported_kinds text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; max_attempts integer;
BEGIN
  IF p_supported_kinds IS NULL OR p_supported_kinds<@ARRAY['interview_summary','study_synthesis','media_transcription']::text[] IS NOT TRUE THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO j FROM public.research_analysis_jobs WHERE kind=ANY(p_supported_kinds)
    AND ((status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id WHERE w.id=j.workspace_id
    AND w.product_key='research' AND g.expires_at>now() AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by))) THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ACCESS_REVOKED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  max_attempts := CASE WHEN j.kind='media_transcription' THEN 2 ELSE 3 END;
  IF j.attempts>=max_attempts THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ATTEMPTS_EXHAUSTED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  UPDATE public.research_analysis_jobs SET status='running',attempts=attempts+1,claim_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=j.id RETURNING * INTO j;
  IF j.kind='media_transcription' THEN UPDATE public.research_source_assets SET status='processing',updated_at=now()
    WHERE id=(j.settings->>'asset_id')::uuid AND status IN ('ready','processing'); END IF;
  RETURN to_jsonb(j);
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('research_begin_upload','research_finalize_upload','research_cancel_upload','research_finish_media_analysis','research_fail_media_analysis','research_expire_uploads','research_mark_media_deleting','research_confirm_media_deleted','research_asset_keys_immutable') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
