CREATE TABLE IF NOT EXISTS public.workspace_period_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_period_usage_workspace_feature_period_idx
  ON public.workspace_period_usage (workspace_id, feature_key, period_start, period_end);

ALTER TABLE public.workspace_period_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view period usage in their workspace"
ON public.workspace_period_usage FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

WITH current_workspace_billing_periods AS (
  SELECT DISTINCT ON (w.id)
    w.id AS workspace_id,
    s.current_period_start AS period_start,
    s.current_period_end AS period_end
  FROM public.workspaces w
  INNER JOIN public.subscriptions s
    ON s.user_id = w.owner_id
  WHERE s.status = 'active'
    AND s.current_period_start IS NOT NULL
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end > timezone('utc'::text, now())
  ORDER BY w.id, s.current_period_end DESC NULLS LAST, s.created_at DESC NULLS LAST
),
interview_backfill AS (
  SELECT
    p.workspace_id,
    'interviews_created'::text AS feature_key,
    p.period_start,
    p.period_end,
    GREATEST(
      COALESCE(wuc.interviews_created, 0),
      COALESCE(COUNT(i.id), 0)
    )::integer AS used
  FROM current_workspace_billing_periods p
  LEFT JOIN public.workspace_usage_counters wuc
    ON wuc.workspace_id = p.workspace_id
  LEFT JOIN public.interviews i
    ON i.workspace_id = p.workspace_id
  GROUP BY p.workspace_id, p.period_start, p.period_end, wuc.interviews_created
)
INSERT INTO public.workspace_period_usage (
  workspace_id,
  feature_key,
  period_start,
  period_end,
  used,
  created_at,
  updated_at
)
SELECT
  workspace_id,
  feature_key,
  period_start,
  period_end,
  used,
  timezone('utc'::text, now()),
  timezone('utc'::text, now())
FROM interview_backfill
WHERE used > 0
ON CONFLICT (workspace_id, feature_key, period_start, period_end) DO UPDATE
SET
  used = GREATEST(public.workspace_period_usage.used, EXCLUDED.used),
  updated_at = timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.increment_workspace_period_usage(
  p_workspace_id uuid,
  p_feature_key text,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer;
BEGIN
  INSERT INTO public.workspace_period_usage (
    workspace_id,
    feature_key,
    period_start,
    period_end,
    used,
    created_at,
    updated_at
  )
  VALUES (
    p_workspace_id,
    p_feature_key,
    p_period_start,
    p_period_end,
    GREATEST(COALESCE(p_delta, 1), 1),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (workspace_id, feature_key, period_start, period_end) DO UPDATE
  SET
    used = public.workspace_period_usage.used + GREATEST(COALESCE(p_delta, 1), 1),
    updated_at = timezone('utc'::text, now())
  RETURNING used INTO next_count;

  RETURN next_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_workspace_period_usage(uuid, text, timestamp with time zone, timestamp with time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_workspace_period_usage(uuid, text, timestamp with time zone, timestamp with time zone, integer) TO service_role;
