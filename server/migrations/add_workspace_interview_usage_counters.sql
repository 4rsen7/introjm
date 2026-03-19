CREATE TABLE IF NOT EXISTS public.workspace_usage_counters (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  interviews_created integer NOT NULL DEFAULT 0 CHECK (interviews_created >= 0),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workspace_usage_counters ENABLE ROW LEVEL SECURITY;

INSERT INTO public.workspace_usage_counters (workspace_id, interviews_created, updated_at)
SELECT
  workspace_id,
  COUNT(*)::integer AS interviews_created,
  timezone('utc'::text, now()) AS updated_at
FROM public.interviews
GROUP BY workspace_id
ON CONFLICT (workspace_id) DO UPDATE
SET
  interviews_created = GREATEST(public.workspace_usage_counters.interviews_created, EXCLUDED.interviews_created),
  updated_at = timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.increment_workspace_interview_usage(p_workspace_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer;
BEGIN
  INSERT INTO public.workspace_usage_counters (workspace_id, interviews_created, updated_at)
  VALUES (p_workspace_id, 1, timezone('utc'::text, now()))
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    interviews_created = public.workspace_usage_counters.interviews_created + 1,
    updated_at = timezone('utc'::text, now())
  RETURNING interviews_created INTO next_count;

  RETURN next_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_workspace_interview_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_workspace_interview_usage(uuid) TO service_role;
