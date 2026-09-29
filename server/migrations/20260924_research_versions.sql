-- R1 source history. Apply after research_core and research_jobs, after staging review.
BEGIN;

ALTER TABLE public.research_studies
  ADD COLUMN plan jsonb NOT NULL DEFAULT '{"questions":[],"hypotheses":[],"prototype":{"name":"","url":"","version":""},"tasks":[],"guide":[]}'::jsonb,
  ADD COLUMN context_revision integer NOT NULL DEFAULT 0 CHECK (context_revision >= 0),
  ADD COLUMN current_version_id uuid;
UPDATE public.research_studies SET context_revision=revision;

CREATE TABLE public.research_study_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  context_revision integer NOT NULL,
  goal text NOT NULL,
  brief text,
  plan jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,context_revision),
  UNIQUE(id,study_id)
);
CREATE TABLE public.research_study_tasks (
  version_id uuid NOT NULL REFERENCES public.research_study_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 29),
  title text NOT NULL,
  instruction text NOT NULL,
  success_criteria text NOT NULL,
  PRIMARY KEY(version_id,task_id),
  UNIQUE(version_id,position)
);
ALTER TABLE public.research_studies ADD CONSTRAINT research_study_current_version_fk
  FOREIGN KEY (current_version_id,id) REFERENCES public.research_study_versions(id,study_id);

CREATE FUNCTION public.research_validate_plan(p_plan jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE entry jsonb; key text; seen uuid[] := '{}'; task_id uuid; max_len integer;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR length(p_plan::text)>60000
    OR jsonb_typeof(p_plan->'questions') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'hypotheses') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'guide') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'tasks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'prototype') IS DISTINCT FROM 'object' OR jsonb_array_length(p_plan->'tasks')>30
    OR jsonb_array_length(p_plan->'questions')>20 OR jsonb_array_length(p_plan->'hypotheses')>20
    OR jsonb_array_length(p_plan->'guide')>100 THEN RETURN false; END IF;
  IF p_plan ? 'summary_sections' THEN
    IF jsonb_typeof(p_plan->'summary_sections') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'summary_sections')>9
      OR NOT (p_plan->'summary_sections' @> '["summary"]'::jsonb) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_plan->'summary_sections') item
        WHERE item NOT IN ('summary','testedProductContext','taskSuccess','whatWorked','whatDidNotWork','confusionsObjections','featureRequests','actionableRecommendations','quotes'))
      THEN RETURN false; END IF;
  END IF;
  FOREACH key IN ARRAY ARRAY['name','url','version'] LOOP
    max_len := CASE WHEN key='url' THEN 2000 ELSE 240 END;
    IF jsonb_typeof(p_plan->'prototype'->key) IS DISTINCT FROM 'string'
      OR length(p_plan->'prototype'->>key)>max_len THEN RETURN false; END IF;
  END LOOP;
  IF p_plan->'prototype'->>'url' <> '' AND p_plan->'prototype'->>'url' !~* '^https?://[^[:space:]]+$' THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements((p_plan->'questions') || (p_plan->'hypotheses')) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'string' OR length(entry #>> '{}')>1000 THEN RETURN false; END IF;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_plan->'guide') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'string' OR length(entry #>> '{}')>2000 THEN RETURN false; END IF;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_plan->'tasks') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string' OR (entry->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
    task_id := (entry->>'id')::uuid;
    IF task_id=ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,task_id);
    FOREACH key IN ARRAY ARRAY['title','instruction','success_criteria'] LOOP
      max_len := CASE WHEN key='title' THEN 240 WHEN key='success_criteria' THEN 2000 ELSE 4000 END;
      IF jsonb_typeof(entry->key) IS DISTINCT FROM 'string' OR length(btrim(entry->>key)) NOT BETWEEN 1 AND max_len THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.research_studies ADD CONSTRAINT research_study_plan_valid CHECK (public.research_validate_plan(plan));

CREATE FUNCTION public.research_immutable_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'RESEARCH_IMMUTABLE_VERSION'; END $$;
CREATE TRIGGER research_study_versions_immutable BEFORE UPDATE OR DELETE ON public.research_study_versions FOR EACH ROW EXECUTE FUNCTION public.research_immutable_snapshot();
CREATE TRIGGER research_study_tasks_immutable BEFORE UPDATE OR DELETE ON public.research_study_tasks FOR EACH ROW EXECUTE FUNCTION public.research_immutable_snapshot();

INSERT INTO public.research_study_versions(study_id,context_revision,goal,brief,plan)
  SELECT id,context_revision,goal,brief,plan FROM public.research_studies;
UPDATE public.research_studies s SET current_version_id=v.id FROM public.research_study_versions v WHERE v.study_id=s.id;

CREATE FUNCTION public.research_capture_study_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v public.research_study_versions; t jsonb; ord bigint;
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.goal IS NOT DISTINCT FROM OLD.goal AND NEW.brief IS NOT DISTINCT FROM OLD.brief
    AND NEW.plan IS NOT DISTINCT FROM OLD.plan THEN RETURN NEW; END IF;
  INSERT INTO public.research_study_versions(study_id,context_revision,goal,brief,plan)
    VALUES(NEW.id,NEW.context_revision,NEW.goal,NEW.brief,NEW.plan) RETURNING * INTO v;
  FOR t,ord IN SELECT value,ordinality FROM jsonb_array_elements(NEW.plan->'tasks') WITH ORDINALITY LOOP
    INSERT INTO public.research_study_tasks(version_id,task_id,position,title,instruction,success_criteria)
      VALUES(v.id,(t->>'id')::uuid,ord-1,t->>'title',t->>'instruction',t->>'success_criteria');
  END LOOP;
  UPDATE public.research_studies SET current_version_id=v.id WHERE id=NEW.id;
  RETURN NEW;
END $$;
CREATE FUNCTION public.research_study_version_before() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN NEW.context_revision := coalesce(NEW.context_revision,0); RETURN NEW; END IF;
  IF NEW.goal IS DISTINCT FROM OLD.goal OR NEW.brief IS DISTINCT FROM OLD.brief OR NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.context_revision := OLD.context_revision+1;
    UPDATE public.interviews SET summary_stale=true,research_revision=research_revision+1,updated_at=now()
      WHERE study_id=NEW.id AND coalesce(summary_data - '_system','{}'::jsonb)<>'{}'::jsonb;
  ELSE NEW.context_revision := OLD.context_revision; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_study_version_before BEFORE INSERT OR UPDATE ON public.research_studies FOR EACH ROW EXECUTE FUNCTION public.research_study_version_before();
CREATE TRIGGER research_study_version_after AFTER INSERT OR UPDATE OF goal,brief,plan ON public.research_studies FOR EACH ROW EXECUTE FUNCTION public.research_capture_study_version();

-- Existing goal/brief writer keeps its public contract; the trigger captures its new context.
CREATE OR REPLACE FUNCTION public.research_update_study(p_user_id uuid,p_study_id uuid,p_revision integer,p_title text,p_goal text,p_brief text,p_archive boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies;
BEGIN
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,s.workspace_id);
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 OR p_goal IS NULL OR length(btrim(p_goal)) NOT BETWEEN 1 AND 12000
    OR (p_brief IS NOT NULL AND length(p_brief)>30000) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  UPDATE public.research_studies SET title=btrim(p_title),goal=btrim(p_goal),brief=p_brief,revision=revision+1,
    archived_at=CASE WHEN p_archive THEN now() ELSE NULL END,updated_at=now() WHERE id=p_study_id RETURNING * INTO s;
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
  RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.research_save_study_version(p_user_id uuid,p_study_id uuid,p_revision integer,p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies;
BEGIN
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,s.workspace_id);
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF NOT public.research_validate_plan(p_plan) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  IF s.plan=p_plan THEN RETURN to_jsonb(s); END IF;
  UPDATE public.research_studies SET plan=p_plan,revision=revision+1,updated_at=now() WHERE id=p_study_id RETURNING * INTO s;
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
  RETURN to_jsonb(s);
END $$;

-- Stable segment IDs are generated once; familiar IDs on existing data survive.
CREATE FUNCTION public.research_stabilize_segments(p_new jsonb,p_old jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=public AS $$
DECLARE result jsonb := '[]'::jsonb; entry jsonb; previous jsonb; candidate text; seen text[] := '{}'; n integer := 0;
BEGIN
  IF jsonb_typeof(p_new)<>'array' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_new) LOOP
    IF jsonb_typeof(entry)<>'object' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
    previous := CASE WHEN jsonb_typeof(p_old)='array' AND jsonb_array_length(p_old)>n THEN p_old->n ELSE NULL END;
    candidate := nullif(btrim(entry->>'id'),'');
    IF candidate IS NOT NULL AND previous IS NOT NULL AND previous->>'speaker'=entry->>'speaker'
      AND previous->>'timestamp'=entry->>'timestamp' AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_old) old_entry WHERE old_entry->>'id'=candidate
      ) AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_new) new_entry WHERE new_entry->>'id'=previous->>'id'
      ) THEN candidate := nullif(previous->>'id',''); END IF;
    IF candidate IS NULL AND previous IS NOT NULL AND previous->>'speaker'=entry->>'speaker'
      AND previous->>'timestamp'=entry->>'timestamp' AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_new) new_entry WHERE new_entry->>'id'=previous->>'id'
      ) THEN candidate := nullif(previous->>'id',''); END IF;
    IF candidate IS NULL THEN candidate := gen_random_uuid()::text; END IF;
    IF candidate=ANY(seen) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
    seen := array_append(seen,candidate);
    result := result || jsonb_build_array(entry || jsonb_build_object('id',candidate));
    n := n+1;
  END LOOP;
  RETURN result;
END $$;

CREATE TABLE public.research_transcript_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  transcript_revision integer NOT NULL,
  transcript_data jsonb NOT NULL,
  origin text NOT NULL CHECK (origin IN ('backfill','created','manual_edit','service_write')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recording_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id,transcript_revision),
  UNIQUE(id,interview_id)
);
CREATE TRIGGER research_transcript_versions_immutable BEFORE UPDATE OR DELETE ON public.research_transcript_versions FOR EACH ROW EXECUTE FUNCTION public.research_immutable_snapshot();
ALTER TABLE public.interviews ADD COLUMN current_transcript_version_id uuid,
  ADD COLUMN research_participant_id uuid;
ALTER TABLE public.interviews ADD CONSTRAINT research_interview_current_transcript_fk
  FOREIGN KEY(current_transcript_version_id,id) REFERENCES public.research_transcript_versions(id,interview_id);
UPDATE public.interviews SET transcript_data=public.research_stabilize_segments(transcript_data)
  WHERE study_id IS NOT NULL;
INSERT INTO public.research_transcript_versions(interview_id,transcript_revision,transcript_data,origin,author_id)
  SELECT id,transcript_revision,transcript_data,'backfill',NULL FROM public.interviews WHERE study_id IS NOT NULL;
UPDATE public.interviews i SET current_transcript_version_id=v.id FROM public.research_transcript_versions v WHERE v.interview_id=i.id;

CREATE OR REPLACE FUNCTION public.research_transcript_content(p_transcript jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(jsonb_agg((entry - 'id') || jsonb_build_object('text',regexp_replace(btrim(entry->>'text'),'\s+',' ','g')) ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(p_transcript) WITH ORDINALITY AS rows(entry,ordinal);
$$;
CREATE FUNCTION public.research_transcript_before() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.study_id IS NULL OR pg_trigger_depth()>1 THEN RETURN NEW; END IF;
  NEW.transcript_data := public.research_stabilize_segments(NEW.transcript_data,CASE WHEN TG_OP='UPDATE' THEN OLD.transcript_data ELSE '[]'::jsonb END);
  IF TG_OP='UPDATE' AND NEW.transcript_data IS DISTINCT FROM OLD.transcript_data AND NEW.transcript_revision=OLD.transcript_revision THEN
    NEW.transcript_revision := OLD.transcript_revision+1;
    NEW.summary_stale := NEW.summary_stale OR (public.research_transcript_content(NEW.transcript_data) IS DISTINCT FROM public.research_transcript_content(OLD.transcript_data)
      AND coalesce(OLD.summary_data - '_system','{}'::jsonb)<>'{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.research_transcript_after() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v public.research_transcript_versions; actor uuid;
BEGIN
  IF pg_trigger_depth()>1 OR NEW.study_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.transcript_revision=OLD.transcript_revision THEN RETURN NEW; END IF;
  actor := nullif(current_setting('research.actor_id',true),'')::uuid;
  INSERT INTO public.research_transcript_versions(interview_id,transcript_revision,transcript_data,origin,author_id)
    VALUES(NEW.id,NEW.transcript_revision,NEW.transcript_data,
      CASE WHEN TG_OP='INSERT' THEN 'created' WHEN actor IS NOT NULL THEN 'manual_edit' ELSE 'service_write' END,actor) RETURNING * INTO v;
  UPDATE public.interviews SET current_transcript_version_id=v.id WHERE id=NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER research_transcript_before BEFORE INSERT OR UPDATE OF transcript_data ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.research_transcript_before();
CREATE TRIGGER research_transcript_after AFTER INSERT OR UPDATE OF transcript_data ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.research_transcript_after();

CREATE OR REPLACE FUNCTION public.research_update_interview(p_user_id uuid,p_interview_id uuid,p_revision integer,p_transcript_revision integer,p_summary_revision integer,p_title text,p_transcript jsonb,p_archive boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.interviews; normalized jsonb; transcript_changed boolean; material_changed boolean;
BEGIN
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id IS NOT NULL AND research_archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,i.workspace_id);
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND research_archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.research_studies WHERE id=i.study_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR p_transcript_revision IS NULL OR p_summary_revision IS NULL OR i.research_revision<>p_revision
    OR i.transcript_revision<>p_transcript_revision OR i.summary_revision<>p_summary_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  normalized := public.research_stabilize_segments(p_transcript,i.transcript_data);
  transcript_changed := i.transcript_data IS DISTINCT FROM normalized;
  material_changed := public.research_transcript_content(i.transcript_data) IS DISTINCT FROM public.research_transcript_content(normalized);
  PERFORM set_config('research.actor_id',p_user_id::text,true);
  UPDATE public.interviews SET title=btrim(p_title),transcript_data=normalized,research_revision=research_revision+1,
    transcript_revision=transcript_revision+CASE WHEN transcript_changed THEN 1 ELSE 0 END,
    summary_stale=summary_stale OR (material_changed AND coalesce(summary_data - '_system','{}'::jsonb)<>'{}'::jsonb),
    research_archived_at=CASE WHEN p_archive THEN now() ELSE NULL END,updated_at=now()
    WHERE id=p_interview_id RETURNING * INTO i;
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id;
  RETURN to_jsonb(i);
END $$;

CREATE TABLE public.research_study_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  pseudonym text NOT NULL CHECK (length(btrim(pseudonym)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(study_id,workspace_id) REFERENCES public.research_studies(id,workspace_id) ON DELETE CASCADE,
  UNIQUE(id,study_id)
);
ALTER TABLE public.interviews ADD CONSTRAINT research_interview_participant_study_fk FOREIGN KEY(research_participant_id,study_id) REFERENCES public.research_study_participants(id,study_id);
CREATE FUNCTION public.research_create_participant(p_user_id uuid,p_study_id uuid,p_pseudonym text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; p public.research_study_participants; used bigint;
BEGIN
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,s.workspace_id);
  IF p_pseudonym IS NULL OR length(btrim(p_pseudonym)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT count(*) INTO used FROM public.research_study_participants WHERE study_id=s.id;
  IF used>=10000 THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.research_study_participants(study_id,workspace_id,pseudonym) VALUES(s.id,s.workspace_id,btrim(p_pseudonym)) RETURNING * INTO p;
  RETURN to_jsonb(p);
END $$;
CREATE FUNCTION public.research_assign_participant(p_user_id uuid,p_interview_id uuid,p_participant_id uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.interviews;
BEGIN
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id IS NOT NULL AND research_archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,i.workspace_id);
  SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND research_archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.research_studies WHERE id=i.study_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR i.research_revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF p_participant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.research_study_participants WHERE id=p_participant_id AND study_id=i.study_id)
    THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  UPDATE public.interviews SET research_participant_id=p_participant_id,research_revision=research_revision+1,updated_at=now() WHERE id=i.id RETURNING * INTO i;
  RETURN to_jsonb(i);
END $$;

ALTER TABLE public.research_study_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_transcript_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_study_versions,public.research_study_tasks,public.research_transcript_versions,public.research_study_participants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_study_versions,public.research_study_tasks,public.research_transcript_versions,public.research_study_participants TO service_role;

ALTER TABLE public.research_analysis_jobs ADD COLUMN study_version_id uuid REFERENCES public.research_study_versions(id),
  ADD COLUMN transcript_version_id uuid REFERENCES public.research_transcript_versions(id),
  ADD COLUMN context_revision integer,
  ADD COLUMN pipeline_version text NOT NULL DEFAULT 'research-v1',
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Prior jobs cannot be proven to have used the state present during migration.
-- Keep completed output as unpinned history; requeue in-flight work from new snapshots.
UPDATE public.research_analysis_jobs SET pipeline_version='research-v0-unpinned',
  status=CASE WHEN status IN ('queued','running') THEN 'stale' ELSE status END,
  error_code=CASE WHEN status IN ('queued','running') THEN 'MIGRATION_UNPINNED_SOURCE' ELSE error_code END,
  claim_token=NULL,lease_until=NULL;

CREATE OR REPLACE FUNCTION public.research_synthesis_sources(p_study_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'transcript_revision',i.transcript_revision,
    'summary_revision',i.summary_revision) ORDER BY i.id),'[]'::jsonb)
  FROM public.interviews i JOIN public.research_studies s ON s.id=i.study_id
  WHERE s.id=p_study_id AND s.archived_at IS NULL AND i.research_archived_at IS NULL
    AND i.summary_stale=false AND i.summary_source_study_revision=s.context_revision
    AND coalesce(i.summary_data - '_system','{}'::jsonb)<>'{}'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.research_enqueue_analysis(p_user_id uuid,p_kind text,p_study_id uuid,p_interview_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies; i public.interviews; owner_uuid uuid; manifest jsonb; previous public.research_analysis_jobs; created public.research_analysis_jobs; analysis_limit integer; used bigint;
BEGIN
  IF p_kind NOT IN ('interview_summary','study_synthesis') OR (p_kind='interview_summary') IS DISTINCT FROM (p_interview_id IS NOT NULL) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  owner_uuid := public.research_require_write(p_user_id,s.workspace_id);
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_kind='interview_summary' THEN
    SELECT * INTO i FROM public.interviews WHERE id=p_interview_id AND study_id=s.id AND workspace_id=s.workspace_id AND research_archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
    IF jsonb_typeof(i.transcript_data)<>'array' OR jsonb_array_length(i.transcript_data)=0 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
    manifest := '[]'::jsonb;
  ELSE
    manifest := public.research_synthesis_sources(s.id);
    IF jsonb_array_length(manifest)=0 THEN RAISE EXCEPTION 'RESEARCH_NO_SOURCES'; END IF;
  END IF;
  SELECT * INTO previous FROM public.research_analysis_jobs j WHERE j.kind=p_kind AND j.study_id=s.id
    AND j.interview_id IS NOT DISTINCT FROM p_interview_id AND j.context_revision=s.context_revision
    AND j.study_version_id=s.current_version_id AND j.transcript_version_id IS NOT DISTINCT FROM i.current_transcript_version_id
    AND j.summary_revision IS NOT DISTINCT FROM i.summary_revision AND j.source_manifest=manifest
    AND j.status IN ('queued','running','completed') ORDER BY j.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(previous); END IF;
  SELECT max_analyses INTO analysis_limit FROM public.research_access_grants WHERE user_id=owner_uuid;
  SELECT count(*) INTO used FROM public.research_analysis_jobs j JOIN public.workspaces w ON w.id=j.workspace_id WHERE w.owner_id=owner_uuid AND j.kind<>'media_transcription';
  IF used>=analysis_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.research_analysis_jobs(workspace_id,study_id,interview_id,requested_by,kind,study_revision,context_revision,study_version_id,
    transcript_revision,transcript_version_id,summary_revision,source_manifest)
    VALUES(s.workspace_id,s.id,p_interview_id,p_user_id,p_kind,s.revision,s.context_revision,s.current_version_id,
      i.transcript_revision,i.current_transcript_version_id,i.summary_revision,manifest) RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;

CREATE FUNCTION public.research_claim_supported_analysis(p_supported_kinds text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs;
BEGIN
  IF p_supported_kinds IS NULL OR p_supported_kinds<@ARRAY['interview_summary','study_synthesis']::text[] IS NOT TRUE THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO j FROM public.research_analysis_jobs WHERE kind=ANY(p_supported_kinds)
    AND ((status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
    WHERE w.id=j.workspace_id AND w.product_key='research' AND g.expires_at>now()
      AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by))) THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ACCESS_REVOKED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  IF j.attempts>=3 THEN
    UPDATE public.research_analysis_jobs SET status='failed',error_code='ATTEMPTS_EXHAUSTED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
    RETURN NULL;
  END IF;
  UPDATE public.research_analysis_jobs SET status='running',attempts=attempts+1,claim_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;
CREATE OR REPLACE FUNCTION public.research_claim_analysis() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.research_claim_supported_analysis(ARRAY['interview_summary','study_synthesis']::text[]);
$$;

CREATE OR REPLACE FUNCTION public.research_finish_analysis(p_job_id uuid,p_claim_token uuid,p_output jsonb,p_error_code text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; s public.research_studies; i public.interviews; valid_source boolean;
BEGIN
  -- Match the grant → source lock order used by edits and quota reservations.
  PERFORM 1 FROM public.research_access_grants grant_row JOIN public.workspaces owner_workspace ON owner_workspace.owner_id=grant_row.user_id
    JOIN public.research_analysis_jobs source_job ON source_job.workspace_id=owner_workspace.id WHERE source_job.id=p_job_id FOR UPDATE OF grant_row;
  SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status<>'running' OR j.claim_token IS DISTINCT FROM p_claim_token OR j.lease_until<=now() THEN RAISE EXCEPTION 'RESEARCH_JOB_FENCED'; END IF;
  IF p_error_code='STALE_SOURCE' THEN UPDATE public.research_analysis_jobs SET status='stale',error_code='STALE_SOURCE',claim_token=NULL,lease_until=NULL,updated_at=now()
    WHERE id=j.id RETURNING * INTO j; RETURN to_jsonb(j); END IF;
  IF p_error_code IS NOT NULL THEN UPDATE public.research_analysis_jobs SET status=CASE WHEN attempts<3 AND p_error_code NOT IN ('RESEARCH_INPUT_TOO_LARGE','RESEARCH_AI_BUDGET') THEN 'queued' ELSE 'failed' END,
    available_at=now()+make_interval(secs => 30*attempts),error_code=left(p_error_code,80),claim_token=NULL,lease_until=NULL,updated_at=now()
    WHERE id=j.id RETURNING * INTO j; RETURN to_jsonb(j); END IF;
  IF p_output IS NULL OR jsonb_typeof(p_output)<>'object' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO s FROM public.research_studies WHERE id=j.study_id FOR UPDATE;
  valid_source := FOUND AND s.archived_at IS NULL AND s.context_revision=j.context_revision AND s.current_version_id=j.study_version_id
    AND EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
      WHERE w.id=j.workspace_id AND w.product_key='research' AND g.expires_at>now()
        AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by)));
  IF j.kind='interview_summary' THEN
    SELECT * INTO i FROM public.interviews WHERE id=j.interview_id FOR UPDATE;
    valid_source := valid_source AND FOUND AND i.research_archived_at IS NULL AND i.transcript_revision=j.transcript_revision
      AND i.current_transcript_version_id=j.transcript_version_id AND i.summary_revision=j.summary_revision;
    IF valid_source THEN UPDATE public.interviews SET summary_data=p_output,status='completed',summary_revision=summary_revision+1,
      summary_source_study_revision=s.context_revision,summary_stale=false,research_revision=research_revision+1,updated_at=now() WHERE id=i.id; END IF;
  ELSIF j.kind='study_synthesis' THEN valid_source := valid_source AND public.research_synthesis_sources(j.study_id)=j.source_manifest;
  ELSE RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  UPDATE public.research_analysis_jobs SET status=CASE WHEN valid_source THEN 'completed' ELSE 'stale' END,
    output=p_output,error_code=NULL,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('research_validate_plan','research_capture_study_version','research_study_version_before','research_immutable_snapshot',
     'research_stabilize_segments','research_transcript_before','research_transcript_after','research_save_study_version',
     'research_create_participant','research_assign_participant','research_claim_supported_analysis') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
