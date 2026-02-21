-- Admin: Dashboard, Chart, Users 360. Run in Supabase SQL Editor. Then: NOTIFY pgrst, 'reload schema'.
-- Pattern: SECURITY DEFINER function with admin check inside; view with security_invoker=true (no "Security Definer View" lint).

-- 1. Очищаємо все, щоб уникнути конфліктів типів
DROP VIEW IF EXISTS public.admin_dashboard_stats;
DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats();

DROP VIEW IF EXISTS public.admin_chart_data;
DROP FUNCTION IF EXISTS public.get_admin_chart_data();

DROP VIEW IF EXISTS public.admin_users_stats;
DROP FUNCTION IF EXISTS public.get_admin_users_stats();

-- 2. Функція Дашборду (res_id замість id; res_api_errors_24h з system_logs)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS TABLE (
  res_id int,
  res_total_users bigint,
  res_total_journeys bigint,
  res_new_users bigint,
  res_journeys_24h bigint,
  res_activation_rate numeric,
  res_api_errors_24h bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  WITH user_activity AS (
    SELECT
      p.id,
      EXISTS (
        SELECT 1 FROM journeys j
        WHERE j.user_id = p.id
        AND j.created_at < p.created_at + interval '24 hours'
      ) as is_activated
    FROM profiles p
  )
  SELECT
    1::int as res_id,
    (SELECT count(*) FROM profiles)::bigint as res_total_users,
    (SELECT count(*) FROM journeys)::bigint as res_total_journeys,
    (SELECT count(*) FROM profiles WHERE created_at > now() - interval '30 days')::bigint as res_new_users,
    (SELECT count(*) FROM journeys WHERE created_at > now() - interval '24 hours')::bigint as res_journeys_24h,
    COALESCE(
      (SELECT round(count(*) FILTER (WHERE is_activated)::numeric / NULLIF(count(*), 0)::numeric * 100, 1) FROM user_activity),
      0
    )::numeric as res_activation_rate,
    COALESCE(
      (SELECT count(*)::bigint FROM public.system_logs WHERE level = 'error' AND created_at > now() - interval '24 hours'),
      0::bigint
    ) as res_api_errors_24h;
END;
$$;

-- 3. View Дашборду (Мапимо res_id назад в id для Refine; api_errors_24h для дашборду)
CREATE VIEW public.admin_dashboard_stats WITH (security_invoker = true) AS
SELECT
  res_id as id,
  res_total_users as total_users,
  res_total_journeys as total_journeys,
  res_new_users as new_users_last_30d,
  res_journeys_24h as journeys_created_24h,
  res_activation_rate as activation_rate,
  res_api_errors_24h as api_errors_24h
FROM public.get_admin_dashboard_stats();

-- 4. Функція Графіка
CREATE OR REPLACE FUNCTION public.get_admin_chart_data()
RETURNS TABLE (
  res_id bigint,
  res_date text,
  res_value bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    row_number() OVER () as res_id,
    to_char(created_at, 'YYYY-MM-DD') as res_date,
    count(*)::bigint as res_value
  FROM profiles
  WHERE created_at > now() - interval '30 days'
  GROUP BY 2
  ORDER BY 2;
END;
$$;

-- 5. View Графіка
CREATE VIEW public.admin_chart_data WITH (security_invoker = true) AS
SELECT
  res_id as id,
  res_date as date,
  res_value as value
FROM public.get_admin_chart_data();

-- 6. Функція Юзерів: план з subscriptions/plans, підрахунки по воркспейсах
CREATE OR REPLACE FUNCTION public.get_admin_users_stats()
RETURNS TABLE (
  res_id uuid,
  res_email text,
  res_full_name text,
  res_created_at timestamptz,
  res_total_journeys bigint,
  res_total_personas bigint,
  res_total_metrics bigint,
  res_plan_status text,
  res_is_activated boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS res_id,
    p.email AS res_email,
    p.full_name AS res_full_name,
    p.created_at AS res_created_at,
    COALESCE(j.cnt, 0)::bigint AS res_total_journeys,
    COALESCE(per.cnt, 0)::bigint AS res_total_personas,
    COALESCE(m.cnt, 0)::bigint AS res_total_metrics,
    COALESCE(pl.name, 'Starter') AS res_plan_status,
    EXISTS (
      SELECT 1 FROM journeys j2
      WHERE j2.user_id = p.id
      AND j2.created_at < p.created_at + interval '24 hours'
    ) AS res_is_activated
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT s.plan_id
    FROM subscriptions s
    WHERE s.user_id = p.id AND s.status = 'active'
    ORDER BY s.current_period_end DESC NULLS LAST
    LIMIT 1
  ) sub ON true
  LEFT JOIN plans pl ON pl.id = sub.plan_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt
    FROM journeys j
    WHERE j.workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = p.id
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = p.id
    )
  ) j ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt
    FROM personas per
    WHERE per.workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = p.id
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = p.id
    )
  ) per ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt
    FROM metrics m
    WHERE m.workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = p.id
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = p.id
    )
  ) m ON true;
END;
$$;

-- 7. View Юзерів
CREATE VIEW public.admin_users_stats WITH (security_invoker = true) AS
SELECT
  res_id as id,
  res_email as email,
  res_full_name as full_name,
  res_created_at as created_at,
  res_total_journeys as total_journeys,
  res_total_personas as total_personas,
  res_total_metrics as total_metrics,
  res_plan_status as plan_status,
  res_is_activated as is_activated
FROM public.get_admin_users_stats();

-- 8. Надаємо права
GRANT SELECT ON public.admin_dashboard_stats TO authenticated, service_role;
GRANT SELECT ON public.admin_chart_data TO authenticated, service_role;
GRANT SELECT ON public.admin_users_stats TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_chart_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_users_stats() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
