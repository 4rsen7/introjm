-- migrations/create_interviews.sql

CREATE TABLE public.interviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  type text CHECK (type IN ('live', 'upload')) DEFAULT 'live',
  status text CHECK (status IN ('draft', 'completed')) DEFAULT 'draft',
  transcript_data jsonb DEFAULT '[]'::jsonb,
  summary_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
