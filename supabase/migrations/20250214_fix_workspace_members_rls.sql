-- Fix infinite recursion (42P17) on workspace_members RLS
-- Run this in Supabase Dashboard → SQL Editor
-- Security: no USING(true); single INSERT policy; auth wrapped in (select ...) for performance.

-- 1) Drop ALL existing policies on workspace_members to remove recursion / duplicates
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'workspace_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON workspace_members', pol.policyname);
  END LOOP;
END $$;

-- 2) Enable RLS (if not already)
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 3) SELECT: user sees own row OR is workspace owner (no read from workspace_members → no recursion)
CREATE POLICY "workspace_members_select"
ON workspace_members FOR SELECT
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_members.workspace_id AND w.owner_id = (SELECT auth.uid())
  )
);

-- 4) INSERT: one policy — owner can add members OR invited user can add self (pending invite by email)
CREATE POLICY "workspace_members_insert"
ON workspace_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = workspace_members.workspace_id AND w.owner_id = (SELECT auth.uid())
  )
  OR (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM workspace_invites wi
      WHERE wi.workspace_id = workspace_members.workspace_id
        AND wi.status = 'pending'
        AND LOWER(wi.email) = LOWER((SELECT auth.jwt()) ->> 'email')
    )
  )
);

-- 5) UPDATE: owner or self only; explicit WITH CHECK (not "true") for security lint
CREATE POLICY "workspace_members_update"
ON workspace_members FOR UPDATE
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (SELECT auth.uid()))
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (SELECT auth.uid()))
);

-- 6) DELETE: owner can remove any member; user can remove themselves (leave)
CREATE POLICY "workspace_members_delete"
ON workspace_members FOR DELETE
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (SELECT auth.uid()))
);
