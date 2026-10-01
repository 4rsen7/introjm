-- Shared brief lifecycle and durable aggregate orchestration. Apply after research_operations.
-- Additive state; legacy studies are confirmed. Existing snapshots and quotas are preserved.
BEGIN;

ALTER TABLE public.research_studies
 ADD COLUMN brief_status text NOT NULL DEFAULT 'confirmed' CHECK (brief_status IN ('draft','confirmed')),
 ADD COLUMN auto_context_revision integer DEFAULT 0,
 ADD COLUMN refresh_context_revision integer,
 ADD COLUMN flow_pending boolean NOT NULL DEFAULT false,
 ADD COLUMN flow_requested_by uuid REFERENCES auth.users(id),
 ADD COLUMN flow_requested_at timestamptz,
 ADD COLUMN flow_checked_at timestamptz,
 ADD COLUMN flow_error_code text,
 ADD COLUMN upload_batch_id uuid,
 ADD COLUMN upload_batch_expires_at timestamptz;
UPDATE public.research_studies SET auto_context_revision=context_revision;

CREATE FUNCTION public.research_flow_context_before() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.goal IS DISTINCT FROM OLD.goal OR NEW.brief IS DISTINCT FROM OLD.brief OR NEW.plan IS DISTINCT FROM OLD.plan THEN
  NEW.refresh_context_revision:=NULL; NEW.flow_pending:=false; NEW.flow_error_code:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER research_flow_context_before BEFORE UPDATE OF goal,brief,plan ON public.research_studies
 FOR EACH ROW EXECUTE FUNCTION public.research_flow_context_before();

CREATE FUNCTION public.research_brief_sources(p_study_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'transcript_version_id',current_transcript_version_id,
  'transcript_revision',transcript_revision) ORDER BY id),'[]'::jsonb)
 FROM public.interviews WHERE study_id=p_study_id AND research_archived_at IS NULL AND jsonb_array_length(transcript_data)>0;
$$;

CREATE FUNCTION public.research_create_study_flow(p_user_id uuid,p_workspace_id uuid,p_title text,p_goal text,p_brief text,p_brief_status text,p_plan jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; created jsonb;
BEGIN
 IF p_brief_status IS NULL OR p_brief_status NOT IN ('draft','confirmed') OR NOT public.research_validate_plan(p_plan)
  OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240
  OR length(coalesce(p_brief,''))>30000 OR (p_brief_status='confirmed' AND length(btrim(coalesce(p_goal,''))) NOT BETWEEN 1 AND 12000)
 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 created:=public.research_create_study(p_user_id,p_workspace_id,p_title,
  CASE WHEN p_brief_status='draft' AND btrim(coalesce(p_goal,''))='' THEN 'Brief pending confirmation' ELSE p_goal END,p_brief);
 UPDATE public.research_studies SET brief_status=p_brief_status,plan=p_plan WHERE id=(created->>'id')::uuid;
 UPDATE public.research_studies SET auto_context_revision=CASE WHEN p_brief_status='confirmed' THEN context_revision ELSE NULL END WHERE id=(created->>'id')::uuid;
 SELECT * INTO s FROM public.research_studies WHERE id=(created->>'id')::uuid;
 RETURN to_jsonb(s);
END $$;

-- Current summaries are reused even though completing a job advances summary_revision.
ALTER FUNCTION public.research_enqueue_analysis(uuid,text,uuid,uuid) RENAME TO research_enqueue_pinned_analysis;
CREATE FUNCTION public.research_enqueue_analysis(p_user_id uuid,p_kind text,p_study_id uuid,p_interview_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; i public.interviews; j public.research_analysis_jobs; result jsonb;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF s.brief_status<>'confirmed' THEN RAISE EXCEPTION 'RESEARCH_BRIEF_REQUIRED'; END IF;
 IF p_kind='interview_summary' THEN
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id=s.id AND research_archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF NOT i.summary_stale AND i.summary_source_study_revision=s.context_revision AND i.summary_source_job_id IS NOT NULL THEN
   SELECT * INTO j FROM public.research_analysis_jobs WHERE id=i.summary_source_job_id AND status='completed';
   IF FOUND THEN RETURN to_jsonb(j); END IF;
  END IF;
 END IF;
 result:=public.research_enqueue_pinned_analysis(p_user_id,p_kind,p_study_id,p_interview_id);
 IF p_kind='interview_summary' AND result->>'status' IN ('queued','running') THEN
  UPDATE public.research_studies SET flow_requested_at=CASE WHEN flow_pending THEN flow_requested_at ELSE now() END,
   flow_pending=true,flow_requested_by=p_user_id,flow_error_code=NULL WHERE id=s.id;
 END IF;
 RETURN result;
END $$;

-- Preparations pin the complete source set, rather than silently choosing a first session.
ALTER FUNCTION public.research_enqueue_intelligence(uuid,text,uuid,uuid,jsonb) RENAME TO research_enqueue_source_intelligence;
CREATE FUNCTION public.research_enqueue_intelligence(p_user_id uuid,p_kind text,p_study_id uuid,p_interview_id uuid,p_settings jsonb DEFAULT '{}')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; manifest jsonb; params jsonb; j public.research_analysis_jobs; owner_uuid uuid; used bigint; allowed integer;
BEGIN
 IF p_kind NOT IN ('brief_preparation','guide_preparation') THEN
  RETURN public.research_enqueue_source_intelligence(p_user_id,p_kind,p_study_id,p_interview_id,p_settings);
 END IF;
 IF p_interview_id IS NOT NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR length(p_settings::text)>20000 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 owner_uuid:=public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF s.upload_batch_id IS NOT NULL AND s.upload_batch_expires_at>now() OR EXISTS(SELECT 1 FROM public.interviews
  WHERE study_id=s.id AND research_archived_at IS NULL AND (status='processing' OR (s.brief_status='draft' AND status<>'failed' AND jsonb_array_length(transcript_data)=0)))
 THEN RAISE EXCEPTION 'RESEARCH_SOURCES_PENDING'; END IF;
 manifest:=public.research_brief_sources(s.id);
 IF jsonb_array_length(manifest)>500 THEN RAISE EXCEPTION 'RESEARCH_REPORT_TOO_LARGE'; END IF;
 IF s.brief_status='draft' AND jsonb_array_length(manifest)=0 THEN RAISE EXCEPTION 'RESEARCH_NO_SOURCES'; END IF;
 params:=jsonb_build_object('description',coalesce(p_settings->>'description',''),'answers',coalesce(p_settings->>'answers',''),'source_fingerprint',md5(manifest::text));
 SELECT * INTO j FROM public.research_analysis_jobs WHERE kind=p_kind AND study_id=s.id AND study_version_id=s.current_version_id
  AND settings=params AND source_manifest=manifest AND status IN ('queued','running','completed') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(j); END IF;
 SELECT max_analyses INTO allowed FROM public.research_access_grants WHERE user_id=owner_uuid;
 SELECT count(*) INTO used FROM public.research_analysis_jobs a JOIN public.workspaces w ON w.id=a.workspace_id WHERE w.owner_id=owner_uuid AND a.kind<>'media_transcription';
 IF used>=allowed THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
 INSERT INTO public.research_analysis_jobs(workspace_id,study_id,requested_by,kind,study_revision,study_version_id,context_revision,settings,source_manifest,pipeline_version)
 VALUES(s.workspace_id,s.id,p_user_id,p_kind,s.revision,s.current_version_id,s.context_revision,params,manifest,'research-v3') RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_advance_study(p_user_id uuid,p_study_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; i public.interviews; previous public.research_analysis_jobs; last_job public.research_analysis_jobs;
 jobs jsonb:='[]'; j jsonb; manifest jsonb; failed boolean:=false; code text;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND OR NOT s.flow_pending THEN RETURN jobs; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT s.flow_pending THEN RETURN jobs; END IF;
 IF s.upload_batch_id IS NOT NULL THEN
  IF s.upload_batch_expires_at>now() THEN RETURN jobs; END IF;
  UPDATE public.research_studies SET upload_batch_id=NULL,upload_batch_expires_at=NULL WHERE id=s.id;
 END IF;
 IF s.brief_status='draft' THEN
  IF EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND (status='processing' OR (status<>'failed' AND jsonb_array_length(transcript_data)=0)))
   OR EXISTS(SELECT 1 FROM public.research_analysis_jobs WHERE study_id=s.id AND kind='media_transcription' AND status IN ('queued','running')) THEN RETURN jobs; END IF;
  IF jsonb_array_length(public.research_brief_sources(s.id))=0 THEN
   UPDATE public.research_studies SET flow_pending=false WHERE id=s.id; RETURN jobs;
  END IF;
  j:=public.research_enqueue_intelligence(p_user_id,'brief_preparation',s.id,NULL,'{}');
  UPDATE public.research_studies SET flow_pending=false,flow_error_code=NULL WHERE id=s.id;
  RETURN jsonb_build_array(j);
 END IF;
 IF s.auto_context_revision IS DISTINCT FROM s.context_revision AND s.refresh_context_revision IS DISTINCT FROM s.context_revision THEN
  UPDATE public.research_studies SET flow_pending=false WHERE id=s.id; RETURN jobs;
 END IF;
 SELECT * INTO previous FROM public.research_analysis_jobs WHERE study_id=s.id AND kind='study_synthesis'
  AND study_version_id=s.current_version_id ORDER BY created_at DESC LIMIT 1;
 IF FOUND AND previous.status IN ('failed','canceled') AND previous.created_at>=s.flow_requested_at
  AND previous.source_manifest=public.research_synthesis_sources(s.id)
  AND NOT EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL
   AND (status='processing' OR jsonb_array_length(transcript_data)>0 AND
    (summary_stale OR summary_source_study_revision IS DISTINCT FROM s.context_revision OR summary_source_job_id IS NULL))) THEN
  UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code=coalesce(previous.error_code,'GENERATION_FAILED') WHERE id=s.id;
  RETURN jobs;
 END IF;
 IF s.refresh_context_revision=s.context_revision THEN
  FOR i IN SELECT * FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND jsonb_array_length(transcript_data)>0 AND status<>'processing'
   AND (summary_stale OR summary_source_study_revision IS DISTINCT FROM s.context_revision OR summary_source_job_id IS NULL) ORDER BY id LOOP
   SELECT * INTO last_job FROM public.research_analysis_jobs WHERE interview_id=i.id AND kind='interview_summary'
    AND study_version_id=s.current_version_id AND transcript_version_id=i.current_transcript_version_id ORDER BY created_at DESC LIMIT 1;
   IF FOUND AND last_job.status IN ('failed','canceled') AND last_job.created_at>=s.flow_requested_at THEN failed:=true; CONTINUE; END IF;
   BEGIN
    j:=public.research_enqueue_analysis(p_user_id,'interview_summary',s.id,i.id); jobs:=jobs||jsonb_build_array(j);
   EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%RESEARCH_QUEUE_FULL%' THEN RETURN jobs; ELSE RAISE; END IF;
   END;
  END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM public.research_analysis_jobs WHERE study_id=s.id AND kind IN ('media_transcription','interview_summary') AND status IN ('queued','running'))
  OR EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND status='processing') THEN RETURN jobs; END IF;
 IF EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND jsonb_array_length(transcript_data)>0
  AND (summary_stale OR summary_source_study_revision IS DISTINCT FROM s.context_revision OR summary_source_job_id IS NULL)) THEN
  UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code='GENERATION_FAILED' WHERE id=s.id;
  RETURN jobs;
 END IF;
 manifest:=public.research_synthesis_sources(s.id);
 IF jsonb_array_length(manifest)=0 THEN
  UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code=CASE WHEN failed THEN 'GENERATION_FAILED' ELSE 'RESEARCH_NO_SOURCES' END WHERE id=s.id;
  RETURN jobs;
 END IF;
 j:=public.research_enqueue_analysis(p_user_id,'study_synthesis',s.id,NULL); jobs:=jobs||jsonb_build_array(j);
 IF j->>'status'='completed' THEN
  UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code=CASE WHEN failed THEN 'GENERATION_FAILED' ELSE NULL END WHERE id=s.id;
 END IF;
 RETURN jobs;
EXCEPTION WHEN others THEN
 code:=CASE WHEN SQLERRM LIKE '%RESEARCH_QUEUE_FULL%' THEN 'RESEARCH_QUEUE_FULL'
  WHEN SQLERRM LIKE '%RESEARCH_LIMIT_REACHED%' THEN 'RESEARCH_LIMIT_REACHED'
  WHEN SQLERRM LIKE '%RESEARCH_ACCESS_REQUIRED%' OR SQLERRM LIKE '%RESEARCH_NOT_FOUND%' THEN 'ACCESS_REVOKED' ELSE 'GENERATION_FAILED' END;
 UPDATE public.research_studies SET flow_pending=(code='RESEARCH_QUEUE_FULL'),
  refresh_context_revision=CASE WHEN code='RESEARCH_QUEUE_FULL' THEN refresh_context_revision ELSE NULL END,flow_error_code=code WHERE id=p_study_id;
 RETURN jsonb_build_object('error_code',code);
END $$;

CREATE FUNCTION public.research_save_brief(p_user_id uuid,p_study_id uuid,p_revision integer,p_title text,p_goal text,p_brief text,p_plan jsonb,p_confirm boolean,p_preparation_job_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; proposed public.research_analysis_jobs; was_draft boolean;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 OR length(btrim(coalesce(p_goal,''))) NOT BETWEEN 1 AND 12000
  OR length(coalesce(p_brief,''))>30000 OR NOT public.research_validate_plan(p_plan) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 IF p_preparation_job_id IS NOT NULL THEN
  SELECT * INTO proposed FROM public.research_analysis_jobs WHERE id=p_preparation_job_id AND study_id=s.id AND study_version_id=s.current_version_id
   AND kind IN ('brief_preparation','guide_preparation') AND status='completed';
  IF NOT FOUND OR proposed.source_manifest<>public.research_brief_sources(s.id) THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 END IF;
 was_draft:=s.brief_status='draft';
 IF was_draft AND NOT p_confirm THEN RAISE EXCEPTION 'RESEARCH_BRIEF_REQUIRED'; END IF;
 IF s.title=btrim(p_title) AND s.goal=btrim(p_goal) AND s.brief IS NOT DISTINCT FROM p_brief AND s.plan=p_plan AND NOT was_draft THEN RETURN to_jsonb(s); END IF;
 UPDATE public.research_studies SET title=btrim(p_title),goal=btrim(p_goal),brief=p_brief,plan=p_plan,
  brief_status=CASE WHEN p_confirm THEN 'confirmed' ELSE brief_status END,revision=revision+1,updated_at=now() WHERE id=s.id;
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
 IF was_draft THEN
  UPDATE public.research_studies SET auto_context_revision=s.context_revision,refresh_context_revision=s.context_revision,flow_pending=true,flow_requested_by=p_user_id,flow_requested_at=now(),flow_error_code=NULL WHERE id=s.id;
  PERFORM public.research_advance_study(p_user_id,s.id);
 END IF;
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
 RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.research_refresh_results(p_user_id uuid,p_study_id uuid,p_revision integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; previous public.research_analysis_jobs; jobs jsonb; manifest jsonb;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 IF s.brief_status<>'confirmed' THEN RAISE EXCEPTION 'RESEARCH_BRIEF_REQUIRED'; END IF;
 SELECT * INTO previous FROM public.research_analysis_jobs WHERE study_id=s.id AND kind='study_synthesis' AND status='completed' ORDER BY created_at DESC LIMIT 1;
 manifest:=public.research_synthesis_sources(s.id);
 IF FOUND AND previous.context_revision=s.context_revision AND previous.source_manifest=manifest AND s.flow_error_code IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND jsonb_array_length(transcript_data)>0
   AND (summary_stale OR summary_source_study_revision IS DISTINCT FROM s.context_revision OR summary_source_job_id IS NULL)) THEN
  RETURN jsonb_build_object('study',to_jsonb(s),'jobs','[]'::jsonb);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL AND jsonb_array_length(transcript_data)>0) THEN RAISE EXCEPTION 'RESEARCH_NO_SOURCES'; END IF;
 IF s.refresh_context_revision IS DISTINCT FROM s.context_revision THEN
  UPDATE public.research_studies SET auto_context_revision=s.context_revision,refresh_context_revision=s.context_revision,flow_pending=true,flow_requested_by=p_user_id,flow_requested_at=now(),flow_error_code=NULL WHERE id=s.id;
 END IF;
 jobs:=public.research_advance_study(p_user_id,s.id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
 RETURN jsonb_build_object('study',to_jsonb(s),'jobs',jobs);
END $$;

CREATE FUNCTION public.research_upload_batch(p_user_id uuid,p_study_id uuid,p_batch_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; batch uuid;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 IF p_batch_id IS NULL THEN
  IF s.upload_batch_id IS NOT NULL AND s.upload_batch_expires_at>now() THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  batch:=gen_random_uuid();
  UPDATE public.research_studies SET upload_batch_id=batch,upload_batch_expires_at=now()+interval '2 hours',flow_pending=true,
   flow_requested_by=p_user_id,flow_requested_at=now(),flow_error_code=NULL WHERE id=s.id;
 ELSE
  IF s.upload_batch_id IS DISTINCT FROM p_batch_id THEN
   IF s.upload_batch_id IS NULL THEN RETURN jsonb_build_object('batch_id',p_batch_id); END IF;
   RAISE EXCEPTION 'RESEARCH_CONFLICT';
  END IF;
  batch:=p_batch_id;
  UPDATE public.research_studies SET upload_batch_id=NULL,upload_batch_expires_at=NULL WHERE id=s.id;
  PERFORM public.research_advance_study(p_user_id,s.id);
 END IF;
 RETURN jsonb_build_object('batch_id',batch);
END $$;

-- Replace existing media continuation: drafts only prepare a brief; confirmed studies
-- retain the original optional summary behavior. The transcript is never rolled back
-- by a quota/queue failure while reserving its next step.
CREATE OR REPLACE FUNCTION public.research_media_auto_summary() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result jsonb; safe_code text; s public.research_studies;
BEGIN
 IF NEW.kind<>'media_transcription' OR NEW.status<>'completed' OR OLD.status='completed' THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.research_studies WHERE id=NEW.study_id;
 UPDATE public.research_studies SET flow_pending=true,flow_requested_by=NEW.requested_by,
  flow_requested_at=CASE WHEN flow_pending THEN flow_requested_at ELSE now() END,flow_error_code=NULL WHERE id=s.id;
 IF s.brief_status='draft' OR NEW.settings->>'auto_summary' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
 BEGIN
  result:=public.research_enqueue_analysis(NEW.requested_by,'interview_summary',NEW.study_id,NEW.interview_id);
  UPDATE public.research_analysis_jobs SET output=output || jsonb_build_object('summary_job_id',result->>'id') WHERE id=NEW.id;
 EXCEPTION WHEN others THEN
  safe_code:=CASE WHEN SQLERRM LIKE '%RESEARCH_LIMIT_REACHED%' THEN 'RESEARCH_LIMIT_REACHED' WHEN SQLERRM LIKE '%RESEARCH_QUEUE_FULL%' THEN 'RESEARCH_QUEUE_FULL' ELSE 'SUMMARY_ENQUEUE_FAILED' END;
  UPDATE public.research_analysis_jobs SET output=output || jsonb_build_object('summary_error',safe_code) WHERE id=NEW.id;
  UPDATE public.research_studies SET flow_pending=false,flow_error_code=safe_code WHERE id=s.id;
 END;
 RETURN NEW;
END $$;

-- Worker completion and reconciliation continue the server flow even with no open browser.
ALTER FUNCTION public.research_finish_analysis(uuid,uuid,jsonb,text) RENAME TO research_finish_context_analysis;
CREATE FUNCTION public.research_finish_analysis(p_job_id uuid,p_claim_token uuid,p_output jsonb,p_error_code text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; result jsonb;
BEGIN
 SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id;
 IF j.kind IN ('brief_preparation','guide_preparation') AND j.pipeline_version='research-v3'
  AND j.source_manifest<>public.research_brief_sources(j.study_id) THEN p_error_code:='STALE_SOURCE'; END IF;
 result:=public.research_finish_context_analysis(p_job_id,p_claim_token,p_output,p_error_code);
 IF result->>'status'='completed' AND j.kind='study_synthesis' THEN
  UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code=NULL
   WHERE id=j.study_id AND current_version_id=j.study_version_id
   AND (upload_batch_id IS NULL OR upload_batch_expires_at<=now())
   AND NOT EXISTS(SELECT 1 FROM public.interviews WHERE study_id=j.study_id AND research_archived_at IS NULL
    AND (status='processing' OR jsonb_array_length(transcript_data)>0 AND
     (summary_stale OR summary_source_study_revision IS DISTINCT FROM j.context_revision OR summary_source_job_id IS NULL)))
   AND NOT EXISTS(SELECT 1 FROM public.research_analysis_jobs WHERE study_id=j.study_id
    AND kind IN ('media_transcription','interview_summary') AND status IN ('queued','running'));
  IF NOT FOUND THEN PERFORM public.research_advance_study(j.requested_by,j.study_id); END IF;
 ELSIF j.kind IN ('interview_summary','study_synthesis') THEN
  IF j.kind='study_synthesis' AND result->>'status' IN ('failed','canceled') THEN
   UPDATE public.research_studies SET flow_pending=false,refresh_context_revision=NULL,flow_error_code=coalesce(result->>'error_code','GENERATION_FAILED')
    WHERE id=j.study_id AND current_version_id=j.study_version_id
    AND j.source_manifest=public.research_synthesis_sources(j.study_id)
    AND (upload_batch_id IS NULL OR upload_batch_expires_at<=now())
    AND flow_requested_at<=j.created_at
    AND NOT EXISTS(SELECT 1 FROM public.interviews WHERE study_id=j.study_id AND research_archived_at IS NULL
     AND (status='processing' OR jsonb_array_length(transcript_data)>0 AND
      (summary_stale OR summary_source_study_revision IS DISTINCT FROM j.context_revision OR summary_source_job_id IS NULL)));
   IF NOT FOUND THEN PERFORM public.research_advance_study(j.requested_by,j.study_id); END IF;
  ELSE PERFORM public.research_advance_study(j.requested_by,j.study_id); END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.research_continue_flows() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; n integer:=0;
BEGIN
 FOR s IN SELECT id,flow_requested_by FROM public.research_studies WHERE archived_at IS NULL AND flow_pending
  AND flow_requested_by IS NOT NULL ORDER BY flow_checked_at NULLS FIRST,id LIMIT 20 LOOP
  PERFORM public.research_advance_study(s.flow_requested_by,s.id);
  UPDATE public.research_studies SET flow_checked_at=clock_timestamp() WHERE id=s.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('research_flow_context_before','research_brief_sources','research_create_study_flow','research_enqueue_analysis','research_enqueue_intelligence',
  'research_advance_study','research_save_brief','research_refresh_results','research_upload_batch','research_finish_analysis','research_continue_flows') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
