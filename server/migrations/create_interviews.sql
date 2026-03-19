-- migrations/create_interviews.sql

CREATE TABLE public.interviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  type text CHECK (type IN ('live', 'upload')) DEFAULT 'live',
  status text CHECK (status IN ('draft', 'processing', 'completed', 'failed')) DEFAULT 'draft',
  transcript_data jsonb DEFAULT '[]'::jsonb,
  summary_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_usage_counters (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  interviews_created integer NOT NULL DEFAULT 0 CHECK (interviews_created >= 0),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workspace_usage_counters ENABLE ROW LEVEL SECURITY;

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

-- Enable RLS
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

-- Policies for workspace members
CREATE POLICY "Users can view interviews in their workspace"
ON public.interviews FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert interviews in their workspace"
ON public.interviews FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update interviews in their workspace"
ON public.interviews FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete interviews in their workspace"
ON public.interviews FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);
