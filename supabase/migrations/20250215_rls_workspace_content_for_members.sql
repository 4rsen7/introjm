-- RLS: allow workspace members to read workspace content (workspaces, journeys, personas, metrics)
-- Uses SECURITY DEFINER helper to avoid infinite recursion. Auth in (select ...) for performance.
-- Run in Supabase Dashboard → SQL Editor after 20250214_fix_workspace_members_rls.sql
-- Drops duplicate SELECT policies so only one per table (fixes "Multiple Permissive Policies" lint).

-- Helper: returns true if current user is owner or member of the workspace (no RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_accessible(ws_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = ws_id AND w.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ws_id AND wm.user_id = (SELECT auth.uid())
  );
$$;

-- workspaces: drop old owner-only policy so only one SELECT policy remains
DROP POLICY IF EXISTS "workspaces_owner_access" ON workspaces;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_select_owner_or_member" ON workspaces;
CREATE POLICY "workspaces_select_owner_or_member"
ON workspaces FOR SELECT
USING (owner_id = (SELECT auth.uid()) OR is_workspace_accessible(id));

-- journeys: drop old policy, single SELECT for owner or member
DROP POLICY IF EXISTS "journeys_owner_access" ON journeys;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journeys_select_workspace_owner_or_member" ON journeys;
CREATE POLICY "journeys_select_workspace_owner_or_member"
ON journeys FOR SELECT
USING (is_workspace_accessible(workspace_id));

-- personas
DROP POLICY IF EXISTS "personas_owner_access" ON personas;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personas_select_workspace_owner_or_member" ON personas;
CREATE POLICY "personas_select_workspace_owner_or_member"
ON personas FOR SELECT
USING (is_workspace_accessible(workspace_id));

-- metrics
DROP POLICY IF EXISTS "metrics_owner_access" ON metrics;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metrics_select_workspace_owner_or_member" ON metrics;
CREATE POLICY "metrics_select_workspace_owner_or_member"
ON metrics FOR SELECT
USING (is_workspace_accessible(workspace_id));
