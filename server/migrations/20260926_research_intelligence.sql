-- Apply after research_versions and research_media. All new AI work shares the leased queue.
BEGIN;
ALTER TABLE public.research_analysis_jobs DROP CONSTRAINT research_analysis_jobs_kind_check;
ALTER TABLE public.research_analysis_jobs ADD CONSTRAINT research_analysis_jobs_kind_check CHECK
 (kind IN ('interview_summary','study_synthesis','media_transcription','brief_preparation','guide_preparation','transcript_impact','interview_evidence'));
-- The media migration names the interview/kind guard explicitly.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.research_analysis_jobs'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%interview_id%' LOOP
   EXECUTE format('ALTER TABLE public.research_analysis_jobs DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.research_analysis_jobs ADD CONSTRAINT research_job_interview_kind CHECK
 ((kind IN ('interview_summary','media_transcription','transcript_impact','interview_evidence'))=(interview_id IS NOT NULL));
ALTER TABLE public.interviews ADD COLUMN summary_source_job_id uuid REFERENCES public.research_analysis_jobs(id),
 ADD COLUMN summary_validation_id uuid,
 ADD COLUMN evidence_job_id uuid REFERENCES public.research_analysis_jobs(id),
 ADD COLUMN evidence_revision integer NOT NULL DEFAULT 0;
UPDATE public.interviews i SET summary_source_job_id=j.id FROM public.research_analysis_jobs j
 WHERE j.interview_id=i.id AND j.kind='interview_summary' AND j.status='completed'
 AND j.summary_revision+1=i.summary_revision AND j.study_version_id IS NOT NULL;

CREATE TABLE public.research_summary_validations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL UNIQUE REFERENCES public.research_analysis_jobs(id),
 interview_id uuid NOT NULL REFERENCES public.interviews(id), summary_source_job_id uuid NOT NULL REFERENCES public.research_analysis_jobs(id),
 study_version_id uuid NOT NULL REFERENCES public.research_study_versions(id),
 transcript_version_id uuid NOT NULL REFERENCES public.research_transcript_versions(id), summary_revision integer NOT NULL,
 decision text NOT NULL CHECK(decision IN ('unaffected','affected','uncertain')), result jsonb NOT NULL,
 accepted_by uuid REFERENCES auth.users(id), accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interviews ADD CONSTRAINT research_summary_validation_fk FOREIGN KEY(summary_validation_id) REFERENCES public.research_summary_validations(id);
CREATE TABLE public.research_task_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.research_analysis_jobs(id),
 interview_id uuid NOT NULL REFERENCES public.interviews(id), study_version_id uuid NOT NULL,
 transcript_version_id uuid NOT NULL REFERENCES public.research_transcript_versions(id), task_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('success','partial','failure','not_attempted','unknown')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000), segment_ids jsonb NOT NULL,
 author_id uuid REFERENCES auth.users(id), supersedes_id uuid UNIQUE REFERENCES public.research_task_outcomes(id),
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(study_version_id,task_id) REFERENCES public.research_study_tasks(version_id,task_id),
 UNIQUE(job_id,task_id,revision)
);
CREATE TRIGGER research_outcomes_immutable BEFORE UPDATE OR DELETE ON public.research_task_outcomes FOR EACH ROW EXECUTE FUNCTION public.research_immutable_snapshot();
CREATE INDEX research_outcomes_job ON public.research_task_outcomes(job_id,task_id,revision DESC);
ALTER TABLE public.research_summary_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_task_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_summary_validations,public.research_task_outcomes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_summary_validations,public.research_task_outcomes TO service_role;

CREATE FUNCTION public.research_enqueue_intelligence(p_user_id uuid,p_kind text,p_study_id uuid,p_interview_id uuid,p_settings jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; i public.interviews; original public.research_analysis_jobs; j public.research_analysis_jobs;
 owner_uuid uuid; params jsonb; used bigint; allowed integer;
BEGIN
 IF p_kind NOT IN ('brief_preparation','guide_preparation','transcript_impact','interview_evidence')
   OR (p_kind IN ('transcript_impact','interview_evidence')) IS DISTINCT FROM (p_interview_id IS NOT NULL)
   OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR length(p_settings::text)>20000 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 owner_uuid:=public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 params:=jsonb_build_object('description',coalesce(p_settings->>'description',''),'answers',coalesce(p_settings->>'answers',''));
 IF p_interview_id IS NOT NULL THEN
   SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id=s.id AND research_archived_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
   IF jsonb_array_length(i.transcript_data)=0 THEN RAISE EXCEPTION 'RESEARCH_NO_SOURCES'; END IF;
   params:=jsonb_build_object('evidence_revision',i.evidence_revision);
   IF p_kind='interview_evidence' AND jsonb_array_length(s.plan->'tasks')=0 THEN RAISE EXCEPTION 'RESEARCH_NO_TASKS'; END IF;
   IF p_kind='transcript_impact' THEN
     SELECT * INTO original FROM public.research_analysis_jobs WHERE id=i.summary_source_job_id AND kind='interview_summary' AND status='completed';
     IF NOT FOUND OR original.study_version_id<>s.current_version_id OR original.transcript_version_id IS NULL THEN RAISE EXCEPTION 'RESEARCH_CONTEXT_CHANGED'; END IF;
     params:=jsonb_build_object('summary_source_job_id',original.id,'original_transcript_version_id',original.transcript_version_id);
   END IF;
 END IF;
 SELECT * INTO j FROM public.research_analysis_jobs WHERE kind=p_kind AND study_id=s.id AND interview_id IS NOT DISTINCT FROM p_interview_id
   AND study_version_id=s.current_version_id AND transcript_version_id IS NOT DISTINCT FROM i.current_transcript_version_id
   AND summary_revision IS NOT DISTINCT FROM i.summary_revision AND settings=params AND status IN ('queued','running','completed') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(j); END IF;
 SELECT max_analyses INTO allowed FROM public.research_access_grants WHERE user_id=owner_uuid;
 SELECT count(*) INTO used FROM public.research_analysis_jobs used_job JOIN public.workspaces w ON w.id=used_job.workspace_id WHERE w.owner_id=owner_uuid AND used_job.kind<>'media_transcription';
 IF used>=allowed THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
 INSERT INTO public.research_analysis_jobs(workspace_id,study_id,interview_id,requested_by,kind,study_revision,study_version_id,context_revision,
   transcript_revision,transcript_version_id,summary_revision,settings,pipeline_version)
 VALUES(s.workspace_id,s.id,p_interview_id,p_user_id,p_kind,s.revision,s.current_version_id,s.context_revision,i.transcript_revision,i.current_transcript_version_id,i.summary_revision,params,'research-v2') RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_accept_preparation(p_user_id uuid,p_study_id uuid,p_job_id uuid,p_revision integer,p_goal text,p_brief text,p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies;
BEGIN
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,s.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.research_analysis_jobs WHERE id=p_job_id AND study_id=s.id AND study_version_id=s.current_version_id
   AND kind IN ('brief_preparation','guide_preparation') AND status='completed') THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 IF p_goal IS NULL OR length(btrim(p_goal)) NOT BETWEEN 1 AND 12000 OR length(coalesce(p_brief,''))>30000
   OR NOT public.research_validate_plan(p_plan) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 UPDATE public.research_studies SET goal=btrim(p_goal),brief=p_brief,plan=p_plan,revision=revision+1,updated_at=now() WHERE id=s.id;
 SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
 RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.research_validate_outcome(p_outcome jsonb,p_study_version uuid,p_transcript_version uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
 IF p_outcome->>'status' NOT IN ('success','partial','failure','not_attempted','unknown')
   OR jsonb_typeof(p_outcome->'status') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_outcome->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_outcome->>'reason')) NOT BETWEEN 1 AND 4000
   OR jsonb_typeof(p_outcome->'segment_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_outcome->'segment_ids')>50
   OR NOT EXISTS(SELECT 1 FROM public.research_study_tasks WHERE version_id=p_study_version AND task_id=(p_outcome->>'task_id')::uuid)
 THEN RETURN false; END IF;
 IF p_outcome->>'status' IN ('success','partial','failure') AND jsonb_array_length(p_outcome->'segment_ids')=0 THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_outcome->'segment_ids') x WHERE NOT EXISTS
   (SELECT 1 FROM public.research_transcript_versions v, jsonb_array_elements(v.transcript_data) segment WHERE v.id=p_transcript_version AND segment->>'id'=x));
EXCEPTION WHEN others THEN RETURN false;
END $$;

ALTER FUNCTION public.research_finish_analysis(uuid,uuid,jsonb,text) RENAME TO research_finish_base_analysis;
CREATE FUNCTION public.research_finish_analysis(p_job_id uuid,p_claim_token uuid,p_output jsonb,p_error_code text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; s public.research_studies; i public.interviews; valid_source boolean; result jsonb; outcome jsonb; seen uuid[]:='{}'; tid uuid;
BEGIN
  -- Match the grant → source lock order used by edits and quota reservations.
  PERFORM 1 FROM public.research_access_grants grant_row JOIN public.workspaces owner_workspace ON owner_workspace.owner_id=grant_row.user_id
    JOIN public.research_analysis_jobs source_job ON source_job.workspace_id=owner_workspace.id WHERE source_job.id=p_job_id FOR UPDATE OF grant_row;
 SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now() THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
 IF j.kind IN ('interview_summary','study_synthesis') OR p_error_code IS NOT NULL THEN
   result:=public.research_finish_base_analysis(p_job_id,p_claim_token,p_output,p_error_code);
   IF j.kind='interview_summary' AND result->>'status'='completed' THEN
     UPDATE public.interviews SET summary_source_job_id=j.id,summary_validation_id=NULL WHERE id=j.interview_id;
   END IF;
   RETURN result;
 END IF;
 IF p_output IS NULL OR jsonb_typeof(p_output)<>'object' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 SELECT * INTO s FROM public.research_studies WHERE id=j.study_id FOR UPDATE;
 valid_source:=FOUND AND s.archived_at IS NULL AND s.current_version_id=j.study_version_id
   AND EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
     WHERE w.id=j.workspace_id AND g.expires_at>now() AND (w.owner_id=j.requested_by OR EXISTS
       (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by)));
 IF j.interview_id IS NOT NULL THEN
   SELECT * INTO i FROM public.interviews WHERE id=j.interview_id FOR UPDATE;
   valid_source:=valid_source AND FOUND AND i.research_archived_at IS NULL AND i.current_transcript_version_id=j.transcript_version_id AND i.summary_revision=j.summary_revision;
 END IF;
 IF j.kind IN ('brief_preparation','guide_preparation') THEN
   IF NOT public.research_validate_plan(p_output->'plan') OR length(btrim(coalesce(p_output->>'goal',''))) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 ELSIF j.kind='transcript_impact' THEN
   valid_source:=valid_source AND i.summary_source_job_id=(j.settings->>'summary_source_job_id')::uuid;
   IF p_output->>'decision' NOT IN ('unaffected','affected','uncertain') OR p_output->>'decision' IS NULL THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
   IF valid_source THEN INSERT INTO public.research_summary_validations(job_id,interview_id,summary_source_job_id,study_version_id,transcript_version_id,summary_revision,decision,result)
     VALUES(j.id,i.id,i.summary_source_job_id,j.study_version_id,j.transcript_version_id,j.summary_revision,p_output->>'decision',p_output); END IF;
 ELSIF j.kind='interview_evidence' THEN
   valid_source:=valid_source AND i.evidence_revision=(j.settings->>'evidence_revision')::integer;
   IF jsonb_typeof(p_output->'outcomes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'outcomes')<>(SELECT count(*) FROM public.research_study_tasks WHERE version_id=j.study_version_id) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
   FOR outcome IN SELECT value FROM jsonb_array_elements(p_output->'outcomes') LOOP
     IF NOT public.research_validate_outcome(outcome,j.study_version_id,j.transcript_version_id) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
     tid:=(outcome->>'task_id')::uuid;
     IF tid=ANY(seen) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
     seen:=array_append(seen,tid);
     IF valid_source THEN INSERT INTO public.research_task_outcomes(job_id,interview_id,study_version_id,transcript_version_id,task_id,status,reason,segment_ids)
       VALUES(j.id,i.id,j.study_version_id,j.transcript_version_id,tid,outcome->>'status',outcome->>'reason',outcome->'segment_ids'); END IF;
   END LOOP;
   IF valid_source THEN UPDATE public.interviews SET evidence_job_id=j.id,evidence_revision=evidence_revision+1 WHERE id=i.id; END IF;
 ELSE RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 UPDATE public.research_analysis_jobs SET status=CASE WHEN valid_source THEN 'completed' ELSE 'stale' END,output=p_output,error_code=NULL,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.research_accept_summary_validation(p_user_id uuid,p_interview_id uuid,p_validation_id uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.interviews; s public.research_studies; v public.research_summary_validations;
BEGIN
 SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id IS NOT NULL AND research_archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,i.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=i.study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.interviews WHERE id=p_interview_id FOR UPDATE;
 IF i.research_archived_at IS NOT NULL OR p_revision IS NULL OR i.research_revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 SELECT * INTO v FROM public.research_summary_validations WHERE id=p_validation_id AND interview_id=i.id AND decision='unaffected' FOR UPDATE;
 IF NOT FOUND OR v.transcript_version_id<>i.current_transcript_version_id OR v.summary_revision<>i.summary_revision
   OR v.summary_source_job_id<>i.summary_source_job_id OR v.study_version_id<>s.current_version_id THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 UPDATE public.research_summary_validations SET accepted_by=p_user_id,accepted_at=now() WHERE id=v.id;
 UPDATE public.interviews SET summary_stale=false,summary_validation_id=v.id,research_revision=research_revision+1,updated_at=now() WHERE id=i.id RETURNING * INTO i;
 RETURN to_jsonb(i);
END $$;

CREATE FUNCTION public.research_correct_outcome(p_user_id uuid,p_outcome_id uuid,p_revision integer,p_outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.research_task_outcomes; next_row public.research_task_outcomes; i public.interviews; s public.research_studies;
BEGIN
 SELECT * INTO old FROM public.research_task_outcomes WHERE id=p_outcome_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.interviews WHERE id=old.interview_id AND research_archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 PERFORM public.research_require_write(p_user_id,i.workspace_id);
 SELECT * INTO s FROM public.research_studies WHERE id=i.study_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.interviews WHERE id=old.interview_id FOR UPDATE;
 IF p_revision IS NULL OR i.evidence_revision<>p_revision OR i.evidence_job_id<>old.job_id OR s.current_version_id<>old.study_version_id
   OR i.current_transcript_version_id<>old.transcript_version_id OR i.research_archived_at IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.research_task_outcomes WHERE supersedes_id=old.id) THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
 IF p_outcome->>'task_id' IS DISTINCT FROM old.task_id::text OR NOT public.research_validate_outcome(p_outcome,old.study_version_id,old.transcript_version_id) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 INSERT INTO public.research_task_outcomes(job_id,interview_id,study_version_id,transcript_version_id,task_id,status,reason,segment_ids,author_id,supersedes_id,revision)
   VALUES(old.job_id,i.id,old.study_version_id,old.transcript_version_id,old.task_id,p_outcome->>'status',p_outcome->>'reason',p_outcome->'segment_ids',p_user_id,old.id,old.revision+1) RETURNING * INTO next_row;
 UPDATE public.interviews SET evidence_revision=evidence_revision+1 WHERE id=i.id;
 RETURN to_jsonb(next_row);
END $$;

CREATE OR REPLACE FUNCTION public.research_synthesis_sources(p_study_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'transcript_revision',coalesce(validated_transcript.transcript_revision,original.transcript_revision),'summary_revision',i.summary_revision,
   'summary_source_job_id',i.summary_source_job_id,'validation_id',i.summary_validation_id) ORDER BY i.id),'[]'::jsonb)
 FROM public.interviews i JOIN public.research_studies s ON s.id=i.study_id
 JOIN public.research_analysis_jobs original ON original.id=i.summary_source_job_id
 LEFT JOIN public.research_summary_validations validation ON validation.id=i.summary_validation_id AND validation.accepted_at IS NOT NULL
 LEFT JOIN public.research_transcript_versions validated_transcript ON validated_transcript.id=validation.transcript_version_id
 WHERE s.id=p_study_id AND s.archived_at IS NULL AND i.research_archived_at IS NULL AND i.summary_stale=false
   AND i.summary_source_study_revision=s.context_revision AND i.summary_source_job_id IS NOT NULL
   AND coalesce(i.summary_data - '_system','{}'::jsonb)<>'{}'::jsonb;
$$;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('research_enqueue_intelligence','research_accept_preparation','research_validate_outcome','research_finish_analysis','research_finish_base_analysis','research_accept_summary_validation','research_correct_outcome') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
