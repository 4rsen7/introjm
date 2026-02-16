-- Performance Advisor: Auth RLS Initialization Plan + Multiple Permissive Policies
-- 1) Wrap auth.uid() in (SELECT auth.uid()) so the planner can cache the value per statement.
-- 2) On system_logs leave only one permissive policy (drop any extras, recreate the single one).

-- ---------- feedback ----------
DROP POLICY IF EXISTS "feedback_select_own" ON feedback;
CREATE POLICY "feedback_select_own"
  ON feedback FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "feedback_insert_own" ON feedback;
CREATE POLICY "feedback_insert_own"
  ON feedback FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ---------- feedback_replies ----------
DROP POLICY IF EXISTS "feedback_replies_select_own_feedback" ON feedback_replies;
CREATE POLICY "feedback_replies_select_own_feedback"
  ON feedback_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback f
      WHERE f.id = feedback_replies.feedback_id AND f.user_id = (SELECT auth.uid())
    )
  );

-- ---------- system_logs: один SELECT-політика (усуваємо "Multiple Permissive Policies") ----------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON system_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "admin_select_system_logs"
  ON system_logs FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1) = 'admin');

-- workspace_invites: якщо політики створювались вручну в Dashboard, замініть там
-- auth.uid() на (SELECT auth.uid()) та auth.jwt() на (SELECT auth.jwt()) для зняття попередження.
