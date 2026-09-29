BEGIN;
ALTER TABLE public.research_transcript_versions DROP CONSTRAINT research_transcript_versions_origin_check;
ALTER TABLE public.research_transcript_versions ADD CONSTRAINT research_transcript_versions_origin_check
 CHECK(origin IN ('backfill','created','manual_edit','service_write','recording'));
CREATE OR REPLACE FUNCTION public.research_transcript_after() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v public.research_transcript_versions; actor uuid; recording text;
BEGIN
 IF pg_trigger_depth()>1 OR NEW.study_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.transcript_revision=OLD.transcript_revision THEN RETURN NEW; END IF;
 actor:=nullif(current_setting('research.actor_id',true),'')::uuid;
 recording:=nullif(current_setting('research.recording_ref',true),'');
 INSERT INTO public.research_transcript_versions(interview_id,transcript_revision,transcript_data,origin,author_id,recording_ref)
 VALUES(NEW.id,NEW.transcript_revision,NEW.transcript_data,
   CASE WHEN TG_OP='INSERT' THEN 'created' WHEN recording IS NOT NULL THEN 'recording' WHEN actor IS NOT NULL THEN 'manual_edit' ELSE 'service_write' END,actor,recording) RETURNING * INTO v;
 UPDATE public.interviews SET current_transcript_version_id=v.id WHERE id=NEW.id;
 RETURN NEW;
END $$;

-- The next step is enqueued in the same transaction as transcription completion.
-- Failure to reserve a summary leaves the transcript usable and an explicit retry state.
CREATE FUNCTION public.research_media_auto_summary() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result jsonb; safe_code text;
BEGIN
 IF NEW.kind<>'media_transcription' OR NEW.status<>'completed' OR OLD.status='completed' OR NEW.settings->>'auto_summary' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
 BEGIN
   result:=public.research_enqueue_analysis(NEW.requested_by,'interview_summary',NEW.study_id,NEW.interview_id);
   UPDATE public.research_analysis_jobs SET output=output || jsonb_build_object('summary_job_id',result->>'id') WHERE id=NEW.id;
 EXCEPTION WHEN others THEN
   safe_code:=CASE WHEN SQLERRM LIKE '%RESEARCH_LIMIT_REACHED%' THEN 'RESEARCH_LIMIT_REACHED' WHEN SQLERRM LIKE '%RESEARCH_QUEUE_FULL%' THEN 'RESEARCH_QUEUE_FULL' ELSE 'SUMMARY_ENQUEUE_FAILED' END;
   UPDATE public.research_analysis_jobs SET output=output || jsonb_build_object('summary_error',safe_code) WHERE id=NEW.id;
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER research_media_auto_summary AFTER UPDATE OF status ON public.research_analysis_jobs FOR EACH ROW EXECUTE FUNCTION public.research_media_auto_summary();
REVOKE ALL ON FUNCTION public.research_media_auto_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_media_auto_summary() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
