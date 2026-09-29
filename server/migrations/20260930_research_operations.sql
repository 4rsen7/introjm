BEGIN;
CREATE FUNCTION public.research_provider_output(p_job_id uuid,p_claim_token uuid,p_characters integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_characters IS NULL OR p_characters NOT BETWEEN 0 AND 2000000 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
 UPDATE public.research_analysis_jobs SET output_characters=output_characters+p_characters
 WHERE id=p_job_id AND claim_token=p_claim_token AND status='running' AND lease_until>now();
 RETURN FOUND;
END $$;
CREATE VIEW public.research_admin_queue_health AS
 SELECT kind,count(*) FILTER(WHERE status='queued') AS queued,count(*) FILTER(WHERE status='running') AS running,
 count(*) FILTER(WHERE status='running' AND lease_until<now()) AS expired_leases,
 count(*) FILTER(WHERE status='failed' AND updated_at>now()-interval '24 hours') AS failed_last_day,
 coalesce(max(extract(epoch FROM now()-created_at)) FILTER(WHERE status='queued'),0) AS oldest_wait_seconds,
 coalesce(sum(provider_calls),0) AS provider_attempts,coalesce(sum(input_characters),0) AS input_characters,
 coalesce(sum(output_characters),0) AS output_characters
 FROM public.research_analysis_jobs GROUP BY kind;
REVOKE ALL ON public.research_admin_queue_health FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.research_admin_queue_health TO service_role;

CREATE FUNCTION public.research_media_cleanup_candidates(p_limit integer DEFAULT 50) RETURNS SETOF public.research_source_assets
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM public.research_source_assets WHERE created_at<now()-interval '25 hours'
 AND (status IN ('expired','canceled','deleting') OR status IN ('completed','failed') AND retention_until<=now())
 ORDER BY created_at,id LIMIT greatest(1,least(p_limit,100));
$$;

-- No live bucket operation happens until this migration is explicitly applied.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
   INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('research-recordings','research-recordings',false,104857600) ON CONFLICT(id) DO NOTHING;
   IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='research-recordings' AND (public OR file_size_limit IS NULL OR file_size_limit>104857600))
     THEN RAISE EXCEPTION 'Research recording bucket must be private and limited to 100 MiB'; END IF;
   EXECUTE $policy$CREATE POLICY research_private_recordings ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
     USING(bucket_id<>'research-recordings') WITH CHECK(bucket_id<>'research-recordings')$policy$;
 END IF;
END $$;
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND p.proname IN ('research_provider_output','research_media_cleanup_candidates') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
