-- R6 admin and team controls. Apply after Research media/intelligence/limits migrations.
BEGIN;
ALTER TABLE public.research_access_grants ADD COLUMN max_members integer NOT NULL DEFAULT 10 CHECK (max_members BETWEEN 1 AND 1000);

CREATE TABLE public.research_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_admin_audit_page ON public.research_admin_audit(created_at DESC,id DESC);
ALTER TABLE public.research_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_admin_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_admin_audit TO service_role;

CREATE VIEW public.research_admin_grant_usage AS
SELECT g.user_id,g.expires_at,g.max_studies,g.max_interviews,g.max_analyses,g.max_storage_bytes,g.max_transcription_seconds,g.max_members,
  (SELECT count(*) FROM public.workspaces w WHERE w.owner_id=g.user_id AND w.product_key='research') AS workspace_count,
  (SELECT count(*) FROM public.research_studies s JOIN public.workspaces w ON w.id=s.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research') AS studies_used,
  (SELECT count(*) FROM public.interviews i JOIN public.workspaces w ON w.id=i.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research') AS interviews_used,
  (SELECT count(*) FROM public.research_analysis_jobs j JOIN public.workspaces w ON w.id=j.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research' AND j.kind<>'media_transcription') AS analyses_used,
  (SELECT coalesce(sum(a.reserved_bytes),0) FROM public.research_source_assets a JOIN public.workspaces w ON w.id=a.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research') AS storage_bytes_used,
  (SELECT coalesce(sum(a.transcription_seconds_reserved),0) FROM public.research_source_assets a JOIN public.workspaces w ON w.id=a.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research') AS transcription_seconds_used,
  (SELECT count(*) FROM public.workspace_members m JOIN public.workspaces w ON w.id=m.workspace_id WHERE w.owner_id=g.user_id AND w.product_key='research') AS members_used
FROM public.research_access_grants g;
REVOKE ALL ON public.research_admin_grant_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.research_admin_grant_usage TO service_role;

CREATE FUNCTION public.research_require_admin(p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='admin')
    THEN RAISE EXCEPTION 'RESEARCH_ADMIN_REQUIRED'; END IF;
END $$;

CREATE FUNCTION public.research_admin_set_grant(p_admin_id uuid,p_user_id uuid,p_expires_at timestamptz,p_limits jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.research_access_grants; v_studies integer; v_interviews integer; v_analyses integer; v_storage bigint; v_seconds bigint; v_members integer;
BEGIN
  PERFORM public.research_require_admin(p_admin_id);
  IF p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '5 years' OR jsonb_typeof(p_limits)<>'object'
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  v_studies := (p_limits->>'max_studies')::integer;
  v_interviews := (p_limits->>'max_interviews')::integer;
  v_analyses := (p_limits->>'max_analyses')::integer;
  v_storage := (p_limits->>'max_storage_bytes')::bigint;
  v_seconds := (p_limits->>'max_transcription_seconds')::bigint;
  v_members := (p_limits->>'max_members')::integer;
  IF v_studies IS NULL OR v_interviews IS NULL OR v_analyses IS NULL OR v_storage IS NULL OR v_seconds IS NULL OR v_members IS NULL
    OR v_studies NOT BETWEEN 1 AND 10000 OR v_interviews NOT BETWEEN 1 AND 100000 OR v_analyses NOT BETWEEN 1 AND 100000
    OR v_storage NOT BETWEEN 1 AND 1099511627776 OR v_seconds NOT BETWEEN 1 AND 100000000 OR v_members NOT BETWEEN 1 AND 1000
    THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  INSERT INTO public.research_access_grants(user_id,expires_at,max_studies,max_interviews,max_analyses,max_storage_bytes,max_transcription_seconds,max_members)
    VALUES(p_user_id,p_expires_at,v_studies,v_interviews,v_analyses,v_storage,v_seconds,v_members)
    ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,max_studies=excluded.max_studies,max_interviews=excluded.max_interviews,
      max_analyses=excluded.max_analyses,max_storage_bytes=excluded.max_storage_bytes,max_transcription_seconds=excluded.max_transcription_seconds,
      max_members=excluded.max_members RETURNING * INTO g;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_admin_id,'grant_set','user',p_user_id,jsonb_build_object('expires_at',g.expires_at,'max_studies',g.max_studies,
      'max_interviews',g.max_interviews,'max_analyses',g.max_analyses,'max_storage_bytes',g.max_storage_bytes,
      'max_transcription_seconds',g.max_transcription_seconds,'max_members',g.max_members));
  RETURN to_jsonb(g);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT';
END $$;

CREATE FUNCTION public.research_admin_revoke_grant(p_admin_id uuid,p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.research_access_grants;
BEGIN
  PERFORM public.research_require_admin(p_admin_id);
  SELECT * INTO g FROM public.research_access_grants WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  UPDATE public.research_access_grants SET expires_at=now() WHERE user_id=p_user_id RETURNING * INTO g;
  UPDATE public.research_analysis_jobs j SET status='canceled',claim_token=NULL,lease_until=NULL,updated_at=now()
    FROM public.workspaces w WHERE j.workspace_id=w.id AND w.owner_id=p_user_id AND w.product_key='research' AND j.status IN ('queued','running');
  UPDATE public.research_source_assets a SET status='canceled',retention_until=now(),updated_at=now()
    FROM public.workspaces w WHERE a.workspace_id=w.id AND w.owner_id=p_user_id AND w.product_key='research' AND a.status IN ('ready','processing');
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id) VALUES(p_admin_id,'grant_revoked','user',p_user_id);
  RETURN to_jsonb(g);
END $$;

CREATE FUNCTION public.research_admin_job_action(p_admin_id uuid,p_job_id uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.research_analysis_jobs; s public.research_studies; i public.interviews; a public.research_source_assets; max_attempts integer;
BEGIN
  PERFORM public.research_require_admin(p_admin_id);
  IF p_action NOT IN ('retry','cancel') THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT * INTO j FROM public.research_analysis_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_action='cancel' THEN
    IF j.status IN ('queued','running') THEN
      UPDATE public.research_analysis_jobs SET status='canceled',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
      IF j.kind='media_transcription' THEN
        UPDATE public.research_source_assets SET status='canceled',retention_until=now(),updated_at=now()
          WHERE id=(j.settings->>'asset_id')::uuid AND status IN ('ready','processing');
      END IF;
    ELSIF j.status<>'canceled' THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  ELSE
    max_attempts := CASE WHEN j.kind='media_transcription' THEN 2 ELSE 3 END;
    IF j.status<>'failed' OR j.attempts>=max_attempts THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    SELECT * INTO s FROM public.research_studies WHERE id=j.study_id;
    IF NOT FOUND OR s.archived_at IS NOT NULL OR s.current_version_id IS DISTINCT FROM j.study_version_id
      OR NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.research_access_grants g ON g.user_id=w.owner_id
        WHERE w.id=j.workspace_id AND w.product_key='research' AND g.expires_at>now()
          AND (w.owner_id=j.requested_by OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=j.requested_by)))
      THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    IF j.interview_id IS NOT NULL THEN
      SELECT * INTO i FROM public.interviews WHERE id=j.interview_id;
      IF NOT FOUND OR i.research_archived_at IS NOT NULL OR i.current_transcript_version_id IS DISTINCT FROM j.transcript_version_id
        OR i.summary_revision IS DISTINCT FROM j.summary_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    END IF;
    IF j.kind='study_synthesis' AND public.research_synthesis_sources(j.study_id)<>j.source_manifest THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    IF j.kind='transcript_impact' AND (j.settings->>'summary_source_job_id') IS DISTINCT FROM i.summary_source_job_id::text
      THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    IF j.kind='interview_evidence' AND (j.settings->>'evidence_revision')::integer IS DISTINCT FROM i.evidence_revision
      THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    IF j.kind='media_transcription' THEN
      SELECT * INTO a FROM public.research_source_assets WHERE id=(j.settings->>'asset_id')::uuid FOR UPDATE;
      IF NOT FOUND OR a.status NOT IN ('failed','ready','processing') THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
      UPDATE public.research_source_assets SET status='ready',updated_at=now() WHERE id=a.id;
    END IF;
    IF j.kind NOT IN ('interview_summary','study_synthesis','media_transcription','brief_preparation','guide_preparation','transcript_impact','interview_evidence')
      THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
    UPDATE public.research_analysis_jobs SET status='queued',available_at=now(),error_code=NULL,claim_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=j.id RETURNING * INTO j;
  END IF;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_admin_id,'job_'||p_action,'job',j.id,jsonb_build_object('kind',j.kind,'attempts',j.attempts));
  RETURN to_jsonb(j);
END $$;

CREATE TABLE public.research_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_team_invites_workspace ON public.research_team_invites(workspace_id,created_at DESC);
ALTER TABLE public.research_team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_team_invites FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_team_invites TO service_role;

CREATE FUNCTION public.research_create_team_invite(p_user_id uuid,p_workspace_id uuid,p_email text,p_token_hash text,p_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.workspaces; g public.research_access_grants; invite public.research_team_invites; members_count bigint; pending_count bigint;
BEGIN
  SELECT * INTO w FROM public.workspaces WHERE id=p_workspace_id AND product_key='research';
  IF NOT FOUND OR w.owner_id<>p_user_id THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,p_workspace_id);
  SELECT * INTO g FROM public.research_access_grants WHERE user_id=p_user_id;
  IF p_email IS NULL OR length(btrim(p_email)) NOT BETWEEN 3 AND 320 OR btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL OR p_expires_at NOT BETWEEN now()+interval '5 minutes' AND now()+interval '30 days'
    THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT count(*) INTO members_count FROM public.workspace_members WHERE workspace_id=p_workspace_id;
  SELECT count(*) INTO pending_count FROM public.research_team_invites WHERE workspace_id=p_workspace_id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now();
  IF members_count+pending_count>=g.max_members THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.research_team_invites(workspace_id,email,token_hash,expires_at,created_by)
    VALUES(p_workspace_id,lower(btrim(p_email)),p_token_hash,p_expires_at,p_user_id) RETURNING * INTO invite;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_user_id,'invite_created','workspace',p_workspace_id,jsonb_build_object('invite_id',invite.id));
  RETURN to_jsonb(invite) - 'token_hash';
END $$;

CREATE FUNCTION public.research_accept_team_invite(p_user_id uuid,p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.research_team_invites; w public.workspaces; g public.research_access_grants; account_email text; confirmed timestamptz; members_count bigint;
BEGIN
  IF p_user_id IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT * INTO invite FROM public.research_team_invites WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND OR invite.accepted_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=now() THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT email,email_confirmed_at INTO account_email,confirmed FROM auth.users WHERE id=p_user_id;
  IF account_email IS NULL OR confirmed IS NULL OR lower(account_email)<>invite.email THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
  SELECT * INTO w FROM public.workspaces WHERE id=invite.workspace_id AND product_key='research';
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT * INTO g FROM public.research_access_grants WHERE user_id=w.owner_id AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
  SELECT count(*) INTO members_count FROM public.workspace_members WHERE workspace_id=w.id;
  IF members_count>=g.max_members AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=w.id AND user_id=p_user_id)
    THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(w.id,p_user_id,'member') ON CONFLICT(workspace_id,user_id) DO NOTHING;
  UPDATE public.research_team_invites SET accepted_at=now(),accepted_by=p_user_id WHERE id=invite.id;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_user_id,'invite_accepted','workspace',w.id,jsonb_build_object('invite_id',invite.id));
  RETURN jsonb_build_object('workspace_id',w.id,'role','member');
END $$;

CREATE FUNCTION public.research_revoke_team_invite(p_user_id uuid,p_invite_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.research_team_invites; w public.workspaces;
BEGIN
  SELECT * INTO invite FROM public.research_team_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  SELECT * INTO w FROM public.workspaces WHERE id=invite.workspace_id AND product_key='research';
  IF NOT FOUND OR w.owner_id<>p_user_id THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  UPDATE public.research_team_invites SET revoked_at=coalesce(revoked_at,now()) WHERE id=invite.id;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_user_id,'invite_revoked','workspace',w.id,jsonb_build_object('invite_id',invite.id));
  RETURN true;
END $$;

CREATE FUNCTION public.research_remove_team_member(p_user_id uuid,p_workspace_id uuid,p_member_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.workspaces;
BEGIN
  SELECT * INTO w FROM public.workspaces WHERE id=p_workspace_id AND product_key='research';
  IF NOT FOUND OR w.owner_id<>p_user_id OR p_member_id=p_user_id THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,p_workspace_id);
  UPDATE public.research_analysis_jobs SET status='canceled',claim_token=NULL,lease_until=NULL,updated_at=now()
    WHERE workspace_id=p_workspace_id AND requested_by=p_member_id AND status IN ('queued','running');
  UPDATE public.research_source_assets a SET status='canceled',retention_until=now(),updated_at=now()
    FROM public.research_analysis_jobs j WHERE j.kind='media_transcription' AND j.settings->>'asset_id'=a.id::text
      AND j.workspace_id=p_workspace_id AND j.requested_by=p_member_id AND j.status='canceled' AND a.status IN ('ready','processing');
  DELETE FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  INSERT INTO public.research_admin_audit(actor_id,action,target_type,target_id,details)
    VALUES(p_user_id,'member_removed','workspace',w.id,jsonb_build_object('member_id',p_member_id));
  RETURN true;
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('research_require_admin','research_admin_set_grant','research_admin_revoke_grant','research_admin_job_action',
      'research_create_team_invite','research_accept_team_invite','research_revoke_team_invite','research_remove_team_member') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
