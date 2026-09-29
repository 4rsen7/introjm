-- Research closed-beta core. Apply in a STAGING database after schema review.
-- This repo does not contain the complete production schema. This migration is
-- deliberately fail-closed; it never removes unknown uniqueness constraints.
-- Enable PRODUCT_SCOPE_ENABLED only with the companion legacy views migration.
-- Enable RESEARCH_ENABLED only after both migrations and direct RLS checks pass.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.workspaces'::regclass AND i.indisunique
      AND i.indnkeyatts = 1 AND a.attname = 'owner_id'
  ) THEN
    RAISE EXCEPTION 'Research preflight: workspaces has unique owner_id. Review and replace that constraint before allowing product-specific workspaces.';
  END IF;
END $$;

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'iterojm';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'iterojm';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'iterojm';
ALTER TABLE public.workspaces ADD CONSTRAINT research_workspace_product CHECK (product_key IN ('iterojm', 'research'));
ALTER TABLE public.plans ADD CONSTRAINT research_plan_product CHECK (product_key IN ('iterojm', 'research'));
ALTER TABLE public.subscriptions ADD CONSTRAINT research_subscription_product CHECK (product_key IN ('iterojm', 'research'));
CREATE INDEX research_workspace_product_owner ON public.workspaces(product_key, owner_id);
CREATE INDEX research_subscription_product_user ON public.subscriptions(product_key, user_id, status);
CREATE INDEX research_plan_product ON public.plans(product_key);

CREATE FUNCTION public.research_immutable_product() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.product_key IS DISTINCT FROM OLD.product_key THEN
    RAISE EXCEPTION 'Product scope cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_workspace_product_immutable BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.research_immutable_product();
CREATE TRIGGER research_plan_product_immutable BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.research_immutable_product();
CREATE TRIGGER research_subscription_product_immutable BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.research_immutable_product();

CREATE FUNCTION public.research_subscription_plan_scope() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = NEW.plan_id AND p.product_key = NEW.product_key) THEN
    RAISE EXCEPTION 'Subscription and plan products must match';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_subscription_plan_scope BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.research_subscription_plan_scope();

-- Explicit, expiring, bounded beta grants. No new paid plan or automatic trial.
-- Only a service-role/admin operation may provision these rows.
CREATE TABLE public.research_access_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  max_studies integer NOT NULL DEFAULT 20 CHECK (max_studies BETWEEN 1 AND 10000),
  max_interviews integer NOT NULL DEFAULT 100 CHECK (max_interviews BETWEEN 1 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  goal text NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 12000),
  brief text CHECK (brief IS NULL OR length(brief) <= 30000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX research_studies_workspace_page ON public.research_studies(workspace_id, id DESC) WHERE archived_at IS NULL;
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS study_id uuid,
  ADD COLUMN IF NOT EXISTS research_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_source_study_revision integer,
  ADD COLUMN IF NOT EXISTS research_archived_at timestamptz;
ALTER TABLE public.interviews ADD CONSTRAINT research_interview_study_workspace
  FOREIGN KEY (study_id, workspace_id) REFERENCES public.research_studies(id, workspace_id);
CREATE INDEX research_interviews_study_page ON public.interviews(study_id, id DESC) WHERE research_archived_at IS NULL;

CREATE FUNCTION public.research_entity_scope() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE workspace_product text;
BEGIN
  SELECT product_key INTO workspace_product FROM public.workspaces WHERE id = NEW.workspace_id;
  IF TG_TABLE_NAME = 'research_studies' THEN
    IF workspace_product IS DISTINCT FROM 'research' THEN RAISE EXCEPTION 'Study requires a Research workspace'; END IF;
  ELSE
    IF coalesce(workspace_product = 'research', false) IS DISTINCT FROM (NEW.study_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Research interviews require a study; legacy interviews cannot belong to a Research study';
    END IF;
    IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.interview_folders WHERE id = NEW.folder_id AND workspace_id = NEW.workspace_id
    ) THEN RAISE EXCEPTION 'Interview and folder workspaces must match'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_study_scope BEFORE INSERT OR UPDATE ON public.research_studies FOR EACH ROW EXECUTE FUNCTION public.research_entity_scope();
CREATE TRIGGER research_interview_scope BEFORE INSERT OR UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.research_entity_scope();

-- Shared tables have existing permissive policies; additional permissive policies
-- cannot isolate Research. Restrictive policies retain all legacy authorization
-- and remove Research from every browser path, including privileged admin SPA.
-- The new API uses service_role only after explicit membership + product checks.
CREATE FUNCTION public.research_is_legacy_workspace(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND product_key = 'iterojm');
$$;
REVOKE ALL ON FUNCTION public.research_is_legacy_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_is_legacy_workspace(uuid) TO anon, authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspaces', 'plans', 'subscriptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY research_browser_product_guard ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (product_key = ''iterojm'') WITH CHECK (product_key = ''iterojm'')', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['workspace_members','workspace_invites','interviews','interview_folders','journeys','personas','metrics','portraits','workspace_usage_counters','workspace_period_usage'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY research_browser_workspace_guard ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (workspace_id IS NULL OR public.research_is_legacy_workspace(workspace_id)) WITH CHECK (workspace_id IS NULL OR public.research_is_legacy_workspace(workspace_id))', t);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.research_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_access_grants, public.research_onboarding, public.research_studies FROM anon, authenticated;
GRANT ALL ON public.research_access_grants, public.research_onboarding, public.research_studies TO service_role;

-- Service-only SQL helpers. The caller supplies an already verified user ID;
-- untrusted authenticated users have no EXECUTE privilege on any writer RPC.
CREATE FUNCTION public.research_require_write(p_user_id uuid, p_workspace_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_uuid uuid;
BEGIN
  SELECT owner_id INTO owner_uuid FROM public.workspaces
    WHERE id = p_workspace_id AND product_key = 'research';
  IF p_user_id IS NULL OR owner_uuid IS NULL OR (owner_uuid <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  )) THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  -- Locks per payer serialize quota checks across all of the payer's workspaces.
  PERFORM 1 FROM public.research_access_grants WHERE user_id = owner_uuid AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
  RETURN owner_uuid;
END $$;

CREATE FUNCTION public.research_bootstrap(p_user_id uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected_workspace public.workspaces;
BEGIN
  IF p_user_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('research-bootstrap:' || p_user_id::text, 0));
  SELECT w.* INTO selected_workspace FROM public.workspaces w
    WHERE w.product_key = 'research' AND (w.owner_id = p_user_id OR EXISTS (
      SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.user_id = p_user_id
    )) ORDER BY (w.owner_id = p_user_id) DESC, w.id LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(selected_workspace); END IF;
  -- Do not silently re-onboard a user whose previous workspace was removed.
  IF EXISTS (SELECT 1 FROM public.research_onboarding WHERE user_id = p_user_id) THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
  PERFORM 1 FROM public.research_access_grants WHERE user_id = p_user_id AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_ACCESS_REQUIRED'; END IF;
  INSERT INTO public.workspaces(owner_id, name, product_key) VALUES (p_user_id, btrim(p_name), 'research') RETURNING * INTO selected_workspace;
  INSERT INTO public.research_onboarding(user_id, workspace_id) VALUES (p_user_id, selected_workspace.id);
  RETURN to_jsonb(selected_workspace);
END $$;

CREATE FUNCTION public.research_create_study(p_user_id uuid, p_workspace_id uuid, p_title text, p_goal text, p_brief text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_uuid uuid; study public.research_studies; study_limit integer; used bigint;
BEGIN
  owner_uuid := public.research_require_write(p_user_id, p_workspace_id);
  SELECT max_studies INTO study_limit FROM public.research_access_grants WHERE user_id = owner_uuid;
  SELECT count(*) INTO used FROM public.research_studies s JOIN public.workspaces w ON w.id = s.workspace_id WHERE w.owner_id = owner_uuid;
  -- Archived rows count too; archive cannot reset a finite beta allocation.
  IF used >= study_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.research_studies(workspace_id,user_id,title,goal,brief)
    VALUES (p_workspace_id,p_user_id,btrim(p_title),btrim(p_goal),p_brief) RETURNING * INTO study;
  RETURN to_jsonb(study);
END $$;

CREATE FUNCTION public.research_update_study(p_user_id uuid, p_study_id uuid, p_revision integer, p_title text, p_goal text, p_brief text, p_archive boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE study public.research_studies; context_changed boolean;
BEGIN
  SELECT * INTO study FROM public.research_studies WHERE id = p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id, study.workspace_id);
  SELECT * INTO study FROM public.research_studies WHERE id = p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR study.revision <> p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  context_changed := study.goal IS DISTINCT FROM btrim(p_goal) OR study.brief IS DISTINCT FROM p_brief;
  UPDATE public.research_studies SET title=btrim(p_title),goal=btrim(p_goal),brief=p_brief,revision=revision+1,
    archived_at=CASE WHEN p_archive THEN now() ELSE NULL END,updated_at=now() WHERE id=p_study_id RETURNING * INTO study;
  IF context_changed THEN
    UPDATE public.interviews SET summary_stale=true,research_revision=research_revision+1,updated_at=now()
      WHERE study_id=p_study_id AND coalesce(summary_data - '_system', '{}'::jsonb) <> '{}'::jsonb;
  END IF;
  RETURN to_jsonb(study);
END $$;

CREATE FUNCTION public.research_create_interview(p_user_id uuid,p_study_id uuid,p_title text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE study public.research_studies; interview public.interviews; owner_uuid uuid; interview_limit integer; used bigint;
BEGIN
  SELECT * INTO study FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  owner_uuid := public.research_require_write(p_user_id,study.workspace_id);
  -- Recheck under the grant lock, shared by study archival and interview writes.
  PERFORM 1 FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  SELECT max_interviews INTO interview_limit FROM public.research_access_grants WHERE user_id=owner_uuid;
  SELECT count(*) INTO used FROM public.interviews i JOIN public.workspaces w ON w.id=i.workspace_id
    WHERE w.owner_id=owner_uuid AND w.product_key='research';
  IF used >= interview_limit THEN RAISE EXCEPTION 'RESEARCH_LIMIT_REACHED'; END IF;
  INSERT INTO public.interviews(workspace_id,study_id,user_id,title,type,status)
    VALUES(study.workspace_id,study.id,p_user_id,btrim(p_title),'upload','draft') RETURNING * INTO interview;
  RETURN to_jsonb(interview);
END $$;

-- Only whitespace normalization is treated as safely immaterial. Speaker, timing,
-- wording and all other source changes remain material until a separate AI review.
CREATE FUNCTION public.research_transcript_content(p_transcript jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(entry || jsonb_build_object('text',regexp_replace(btrim(entry->>'text'),'\s+',' ','g')) ORDER BY ordinal), '[]'::jsonb)
  FROM jsonb_array_elements(p_transcript) WITH ORDINALITY AS rows(entry,ordinal);
$$;

CREATE FUNCTION public.research_update_interview(p_user_id uuid,p_interview_id uuid,p_revision integer,p_transcript_revision integer,p_summary_revision integer,p_title text,p_transcript jsonb,p_archive boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE interview public.interviews; transcript_changed boolean; material_changed boolean;
BEGIN
  SELECT * INTO interview FROM public.interviews WHERE id=p_interview_id AND study_id IS NOT NULL AND research_archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,interview.workspace_id);
  SELECT * INTO interview FROM public.interviews WHERE id=p_interview_id AND research_archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.research_studies WHERE id=interview.study_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR p_transcript_revision IS NULL OR p_summary_revision IS NULL
      OR interview.research_revision <> p_revision OR interview.transcript_revision <> p_transcript_revision OR interview.summary_revision <> p_summary_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 OR jsonb_typeof(p_transcript) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  transcript_changed := interview.transcript_data IS DISTINCT FROM p_transcript;
  material_changed := public.research_transcript_content(interview.transcript_data) IS DISTINCT FROM public.research_transcript_content(p_transcript);
  UPDATE public.interviews SET title=btrim(p_title),transcript_data=p_transcript,
    research_revision=research_revision+1,
    transcript_revision=transcript_revision + CASE WHEN transcript_changed THEN 1 ELSE 0 END,
    summary_stale=summary_stale OR (material_changed AND coalesce(summary_data - '_system','{}'::jsonb) <> '{}'::jsonb),
    research_archived_at=CASE WHEN p_archive THEN now() ELSE NULL END,updated_at=now()
    WHERE id=p_interview_id RETURNING * INTO interview;
  RETURN to_jsonb(interview);
END $$;

-- REVOKE before COMMIT makes all SECURITY DEFINER writers service-only atomically.
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'research_%' AND p.proname <> 'research_is_legacy_workspace'
      OR p.proname IN ('increment_workspace_interview_usage','increment_workspace_period_usage'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
