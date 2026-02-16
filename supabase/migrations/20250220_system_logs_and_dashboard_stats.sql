-- system_logs: ensure table exists with created_at (for API errors 24h count).
-- admin_dashboard_stats: view so Product Health "API Errors (24h)" reads from system_logs.

-- 1) system_logs table (server already inserts level, message, details)
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  message text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If table already existed without created_at, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_logs' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE system_logs ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- RLS: only admins can read system_logs (server writes with service_role, bypasses RLS)
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_system_logs" ON system_logs;
CREATE POLICY "admin_select_system_logs"
  ON system_logs FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1) = 'admin');

-- 2) View: one row for admin dashboard (total_users, total_journeys, new_users_last_30d, journeys_created_24h, activation_rate, api_errors_24h)
-- activation_rate = % of users who created at least one journey in last 24h
-- api_errors_24h = count of error rows in system_logs in last 24h (visible when querying as admin)
-- security_invoker = on: view runs as the user querying it (not owner), so RLS applies; avoids Security Advisor "Security Definer View" warning
-- Must DROP first: PostgreSQL does not allow changing columns with CREATE OR REPLACE VIEW
DROP VIEW IF EXISTS admin_dashboard_stats CASCADE;
CREATE VIEW admin_dashboard_stats WITH (security_invoker = on) AS
SELECT
  (SELECT count(*)::int FROM public.profiles) AS total_users,
  (SELECT count(*)::int FROM public.journeys) AS total_journeys,
  (SELECT count(*)::int FROM public.profiles) AS new_users_last_30d,
  (SELECT count(*)::int FROM public.journeys j WHERE j.created_at >= now() - interval '24 hours') AS journeys_created_24h,
  round(
    (SELECT count(DISTINCT j.user_id)::numeric FROM public.journeys j WHERE j.created_at >= now() - interval '24 hours')
    * 100.0 / nullif((SELECT count(*)::numeric FROM public.profiles), 0),
    2
  )::numeric AS activation_rate,
  (SELECT count(*)::int FROM public.system_logs WHERE level = 'error' AND created_at >= now() - interval '24 hours') AS api_errors_24h;

COMMENT ON VIEW admin_dashboard_stats IS 'Single row for admin dashboard: Product Health (API errors 24h, Activation Rate), user/journey counts';
