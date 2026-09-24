-- Synthetic minimum expected pre-Research schema. This is not a production
-- schema snapshot and passing these tests does not establish deployment readiness.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users, role text DEFAULT 'user');
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.workspace_members (
  workspace_id uuid REFERENCES public.workspaces ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users, role text DEFAULT 'member',
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces,
  email text, role text DEFAULT 'member'
);
CREATE TABLE public.plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, max_interviews integer);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
  plan_id uuid REFERENCES public.plans, status text DEFAULT 'active',
  current_period_start timestamptz, current_period_end timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.journeys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces, user_id uuid REFERENCES auth.users, title text);
CREATE TABLE public.personas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces, user_id uuid REFERENCES auth.users, name text);
CREATE TABLE public.portraits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces, user_id uuid REFERENCES auth.users, name text);
CREATE TABLE public.metrics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces, user_id uuid REFERENCES auth.users, name text);
CREATE TABLE public.interview_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces,
  user_id uuid REFERENCES auth.users, name text
);
CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces,
  user_id uuid NOT NULL REFERENCES auth.users, folder_id uuid REFERENCES public.interview_folders,
  title text NOT NULL, type text DEFAULT 'upload', status text DEFAULT 'draft',
  transcript_data jsonb DEFAULT '[]', summary_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.workspace_usage_counters (workspace_id uuid PRIMARY KEY REFERENCES public.workspaces, interviews_created integer DEFAULT 0);
CREATE TABLE public.workspace_period_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces,
  feature_key text, used integer DEFAULT 0, period_start timestamptz, period_end timestamptz
);
-- Existing permissive policies intentionally remain: Research must protect its
-- rows even when old browser policies would otherwise authorize the owner.
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_workspace_access ON public.workspaces FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_member_access ON public.workspace_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_interviews_access ON public.interviews FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
