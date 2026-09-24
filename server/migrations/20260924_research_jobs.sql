-- Apply after the Research core migration, only after staging schema review.
BEGIN;
ALTER TABLE public.research_access_grants ADD COLUMN max_analyses integer NOT NULL DEFAULT 20 CHECK (max_analyses BETWEEN 1 AND 100000);

CREATE TABLE public.research_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('interview_summary','study_synthesis')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','stale','failed')),
  study_revision integer NOT NULL,
  transcript_revision integer,
  summary_revision integer,
  source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token uuid,
  output jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'interview_summary') = (interview_id IS NOT NULL))
);
CREATE INDEX research_jobs_claim ON public.research_analysis_jobs(available_at,created_at) WHERE status = 'queued';
CREATE INDEX research_jobs_lease ON public.research_analysis_jobs(lease_until) WHERE status = 'running';
CREATE INDEX research_jobs_study ON public.research_analysis_jobs(study_id,created_at DESC);
ALTER TABLE public.research_analysis_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_analysis_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.research_analysis_jobs TO service_role;

-- Deterministic manifest permits exact source checks without trusting worker input.
CREATE FUNCTION public.research_synthesis_sources(p_study_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'transcript_revision',i.transcript_revision,
    'summary_revision',i.summary_revision) ORDER BY i.id), '[]'::jsonb)
  FROM public.interviews i JOIN public.research_studies s ON s.id=i.study_id
  WHERE s.id=p_study_id AND s.archived_at IS NULL AND i.research_archived_at IS NULL
    AND i.summary_stale=false AND i.summary_source_study_revision=s.revision
    AND coalesce(i.summary_data - '_system','{}'::jsonb) <> '{}'::jsonb;
$$;

CREATE FUNCTION public.research_enqueue_analysis(p_user_id uuid,p_kind text,p_study_id uuid,p_interview_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.research_studies; i public.interviews; owner_uuid uuid; manifest jsonb; previous public.research_analysis_jobs; created public.research_analysis_jobs; analysis_limit integer; used bigint;
BEGIN
  IF p_kind NOT IN ('interview_summary','study_synthesis') OR (p_kind='interview_summary') IS DISTINCT FROM (p_interview_id IS NOT NULL)
    THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  owner_uuid := public.research_require_write(p_user_id,s.workspace_id);
  -- Owner grant lock serializes reservations and edits that use the core writer.
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_kind='interview_summary' THEN
    SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id=s.id AND workspace_id=s.workspace_id AND research_archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
    IF jsonb_typeof(i.transcript_data) <> 'array' OR jsonb_array_length(i.transcript_data)=0 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
    manifest := '[]'::jsonb;
  ELSE
    manifest := public.research_synthesis_sources(s.id);
    IF jsonb_array_length(manifest)=0 THEN RAISE EXCEPTION 'RESEARCH_NO_SOURCES'; END IF;
  END IF;
  SELECT * INTO previous FROM public.research_analysis_jobs j
    WHERE j.kind=p_kind AND j.study_id=s.id AND j.interview_id IS NOT DISTINCT FROM p_interview_id
      AND j.study_revision=s.revision AND j.transcript_revision IS NOT DISTINCT FROM i.transcript_revision
      AND j.summary_revision IS NOT DISTINCT FROM i.summary_revision AND j.source_manifest=manifest
      AND j.status IN ('queued','running','completed') ORDER BY j.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(previous); END IF;
  SELECT max_analyses INTO analysis_limit FROM public.research_access_grants WHERE user_id=owner_uuid;
  SELECT count(*) INTO used FROM public.research_analysis_jobs j JOIN public.workspaces w ON w.id=j.workspace_id WHERE w.owner_id=owner_uuid;
  IF used >= analysis_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.research_analysis_jobs(workspace_id,study_id,interview_id,requested_by,kind,study_revision,transcript_revision,summary_revision,source_manifest)
    VALUES(s.workspace_id,s.id,p_interview_id,p_user_id,p_kind,s.revision,i.transcript_revision,i.summary_revision,manifest) RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;

CREATE FUNCTION public.research_claim_analysis() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.research_analysis_jobs;
BEGIN
  SELECT * INTO j FROM public.research_analysis_jobs
    WHERE (status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
      WHERE w.id=j.workspace_id AND w.product_key='research' AND g.expires_at>now())
    OR NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=j.workspace_id AND
      (w.owner_id=j.requested_by OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by))) THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ACCESS_REVOKED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  IF j.attempts >= 3 THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ATTEMPTS_EXHAUSTED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  UPDATE public.research_analysis_jobs SET status='running',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
    WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_heartbeat_analysis(p_job_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.research_analysis_jobs SET lease_until=now()+interval '2 minutes',updated_at=now()
    WHERE id=p_job_id AND claim_token=p_claim_token AND status='running' AND lease_until>now();
  RETURN FOUND;
END $$;

CREATE FUNCTION public.research_finish_analysis(p_job_id uuid,p_claim_token uuid,p_output jsonb,p_error_code text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.research_analysis_jobs; s public.research_studies; i public.interviews; valid_source boolean;
BEGIN
  SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now() THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
  IF p_error_code='STALE_SOURCE' THEN
    UPDATE public.research_analysis_jobs SET status='stale',error_code='STALE_SOURCE',claim_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=j.id RETURNING * INTO j;
    RETURN to_jsonb(j);
  END IF;
  IF p_error_code IS NOT NULL THEN
    UPDATE public.research_analysis_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
      available_at=now()+make_interval(secs => 30 * attempts),error_code=left(p_error_code,80),claim_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=j.id RETURNING * INTO j;
    RETURN to_jsonb(j);
  END IF;
  IF p_output IS NULL OR jsonb_typeof(p_output)<>'object' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO s FROM public.research_studies WHERE id=j.study_id FOR UPDATE;
  valid_source := FOUND AND s.archived_at IS NULL AND s.revision=j.study_revision
    AND EXISTS (SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
      WHERE w.id=j.workspace_id AND w.product_key='research' AND g.expires_at>now()
        AND (w.owner_id=j.requested_by OR EXISTS (SELECT 1 FROM public.workspace_members m
          WHERE m.workspace_id=w.id AND m.user_id=j.requested_by)));
  IF j.kind='interview_summary' THEN
    SELECT * INTO i FROM public.interviews WHERE id=j.interview_id FOR UPDATE;
    valid_source := valid_source AND FOUND AND i.research_archived_at IS NULL AND i.transcript_revision=j.transcript_revision AND i.summary_revision=j.summary_revision;
    IF valid_source THEN
      UPDATE public.interviews SET summary_data=p_output,status='completed',summary_revision=summary_revision+1,
        summary_source_study_revision=s.revision,summary_stale=false,research_revision=research_revision+1,updated_at=now() WHERE id=i.id;
    END IF;
  ELSE
    valid_source := valid_source AND public.research_synthesis_sources(j.study_id)=j.source_manifest;
  END IF;
  UPDATE public.research_analysis_jobs SET status=CASE WHEN valid_source THEN 'completed' ELSE 'stale' END,
    output=p_output,error_code=NULL,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('research_synthesis_sources','research_enqueue_analysis','research_claim_analysis','research_heartbeat_analysis','research_finish_analysis') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
