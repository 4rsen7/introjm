BEGIN;
CREATE TABLE public.research_worker_limits (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), global_slots integer NOT NULL DEFAULT 2 CHECK(global_slots BETWEEN 1 AND 16),
 workspace_slots integer NOT NULL DEFAULT 1 CHECK(workspace_slots BETWEEN 1 AND 4), media_slots integer NOT NULL DEFAULT 1 CHECK(media_slots BETWEEN 1 AND 4),
 max_pending integer NOT NULL DEFAULT 200 CHECK(max_pending BETWEEN 1 AND 5000), max_workspace_pending integer NOT NULL DEFAULT 20 CHECK(max_workspace_pending BETWEEN 1 AND 1000)
);
INSERT INTO public.research_worker_limits DEFAULT VALUES;
ALTER TABLE public.research_analysis_jobs ADD COLUMN started_at timestamptz, ADD COLUMN finished_at timestamptz,
 ADD COLUMN provider_calls integer NOT NULL DEFAULT 0, ADD COLUMN input_characters bigint NOT NULL DEFAULT 0,
 ADD COLUMN output_characters bigint NOT NULL DEFAULT 0;
CREATE TABLE public.research_worker_heartbeats (
 id uuid PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now(), capabilities text[] NOT NULL
);
CREATE TABLE public.research_synthesis_chunks (
 cache_key text PRIMARY KEY, study_id uuid NOT NULL REFERENCES public.research_studies(id), study_version_id uuid NOT NULL REFERENCES public.research_study_versions(id),
 source_manifest jsonb NOT NULL, output jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.research_worker_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_synthesis_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_worker_limits,public.research_worker_heartbeats,public.research_synthesis_chunks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_worker_limits,public.research_worker_heartbeats,public.research_synthesis_chunks TO service_role;

CREATE FUNCTION public.research_queue_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE limits public.research_worker_limits;
BEGIN
 -- Serialize brief capacity checks only; no lock is held while a provider runs.
 PERFORM pg_advisory_xact_lock(924202601);
 SELECT * INTO limits FROM public.research_worker_limits WHERE id;
 IF NEW.status='queued' AND (TG_OP='INSERT' OR OLD.status NOT IN ('queued','running')) THEN
   IF (SELECT count(*) FROM public.research_analysis_jobs WHERE status IN ('queued','running'))>=limits.max_pending
     OR (SELECT count(*) FROM public.research_analysis_jobs WHERE workspace_id=NEW.workspace_id AND status IN ('queued','running'))>=limits.max_workspace_pending
   THEN RAISE EXCEPTION 'RESEARCH_QUEUE_FULL'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.status='running' AND OLD.status IS DISTINCT FROM 'running' THEN NEW.started_at:=now(); END IF;
 IF NEW.status IN ('completed','failed','stale','canceled') THEN NEW.finished_at:=now(); ELSE NEW.finished_at:=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER research_queue_capacity BEFORE INSERT OR UPDATE OF status ON public.research_analysis_jobs FOR EACH ROW EXECUTE FUNCTION public.research_queue_capacity();

CREATE OR REPLACE FUNCTION public.research_claim_supported_analysis(p_supported_kinds text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; limits public.research_worker_limits; max_attempts integer;
BEGIN
 IF p_supported_kinds IS NULL OR p_supported_kinds<@ARRAY['interview_summary','study_synthesis','media_transcription','brief_preparation','guide_preparation','transcript_impact','interview_evidence']::text[] IS NOT TRUE THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(924202601);
 SELECT * INTO limits FROM public.research_worker_limits WHERE id;
 IF (SELECT count(*) FROM public.research_analysis_jobs WHERE status='running' AND lease_until>now())>=limits.global_slots THEN RETURN NULL; END IF;
 SELECT pending.* INTO j FROM public.research_analysis_jobs pending
 WHERE pending.kind=ANY(p_supported_kinds) AND ((pending.status='queued' AND pending.available_at<=now()) OR (pending.status='running' AND pending.lease_until<now()))
   AND (SELECT count(*) FROM public.research_analysis_jobs active WHERE active.workspace_id=pending.workspace_id AND active.status='running' AND active.lease_until>now())<limits.workspace_slots
   AND (pending.kind<>'media_transcription' OR (SELECT count(*) FROM public.research_analysis_jobs active WHERE active.kind='media_transcription' AND active.status='running' AND active.lease_until>now())<limits.media_slots)
 ORDER BY (SELECT max(previous.started_at) FROM public.research_analysis_jobs previous WHERE previous.workspace_id=pending.workspace_id) NULLS FIRST,pending.created_at,pending.id
 FOR UPDATE OF pending SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF j.kind='media_transcription' THEN
   PERFORM 1 FROM public.research_source_assets WHERE id=(j.settings->>'asset_id')::uuid FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id WHERE w.id=j.workspace_id
   AND w.product_key='research' AND g.expires_at>now() AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by))) THEN
   UPDATE public.research_analysis_jobs SET status='failed',error_code='ACCESS_REVOKED',claim_token=NULL,lease_until=NULL WHERE id=j.id;
   IF j.kind='media_transcription' THEN UPDATE public.research_source_assets SET status='failed' WHERE id=(j.settings->>'asset_id')::uuid AND status IN ('ready','processing'); END IF;
   RETURN NULL;
 END IF;
 max_attempts:=CASE WHEN j.kind='media_transcription' THEN 2 ELSE 3 END;
 IF j.attempts>=max_attempts THEN
   UPDATE public.research_analysis_jobs SET status='failed',error_code='ATTEMPTS_EXHAUSTED',claim_token=NULL,lease_until=NULL WHERE id=j.id;
   IF j.kind='media_transcription' THEN UPDATE public.research_source_assets SET status='failed' WHERE id=(j.settings->>'asset_id')::uuid AND status IN ('ready','processing'); END IF;
   RETURN NULL;
 END IF;
 UPDATE public.research_analysis_jobs SET status='running',started_at=now(),attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=j.id RETURNING * INTO j;
 IF j.kind='media_transcription' THEN UPDATE public.research_source_assets SET status='processing',updated_at=now() WHERE id=(j.settings->>'asset_id')::uuid AND status IN ('ready','processing'); END IF;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_provider_call(p_job_id uuid,p_claim_token uuid,p_input_characters integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs;
BEGIN
 SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now() THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id WHERE w.id=j.workspace_id
   AND g.expires_at>now() AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by))) THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
 IF p_input_characters IS NULL OR p_input_characters NOT BETWEEN 0 AND 300000 OR j.provider_calls>=(CASE WHEN j.kind='study_synthesis' THEN 40 ELSE 6 END) THEN RAISE EXCEPTION 'RESEARCH_AI_BUDGET'; END IF;
 UPDATE public.research_analysis_jobs SET provider_calls=provider_calls+1,input_characters=input_characters+p_input_characters WHERE id=j.id;
 RETURN true;
END $$;

CREATE FUNCTION public.research_results_snapshot(p_user_id uuid,p_study_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; sessions jsonb; results jsonb;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=s.workspace_id AND w.product_key='research'
   AND (w.owner_id=p_user_id OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=p_user_id))) THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 IF (SELECT count(*) FROM public.interviews WHERE study_id=s.id AND research_archived_at IS NULL)>500 THEN RAISE EXCEPTION 'RESEARCH_REPORT_TOO_LARGE'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'research_participant_id',i.research_participant_id,'evidence_revision',i.evidence_revision,
   'evidence_job_id',i.evidence_job_id,'current_transcript_version_id',i.current_transcript_version_id,'summary_stale',i.summary_stale,
   'summary_source_study_revision',i.summary_source_study_revision,'summary_source_job_id',i.summary_source_job_id) ORDER BY i.created_at,i.id),'[]') INTO sessions
 FROM public.interviews i WHERE study_id=s.id AND research_archived_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]') INTO results FROM public.research_task_outcomes o
   JOIN public.interviews i ON i.id=o.interview_id AND i.evidence_job_id=o.job_id
 WHERE i.study_id=s.id AND i.research_archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.research_task_outcomes newer WHERE newer.supersedes_id=o.id);
 RETURN jsonb_build_object('study',to_jsonb(s),'interviews',sessions,'outcomes',results);
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('research_queue_capacity','research_claim_supported_analysis','research_provider_call','research_results_snapshot') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
