CREATE TABLE public.portraits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  title text NOT NULL,
  portrait_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.portraits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view portraits in their workspace"
ON public.portraits FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert portraits in their workspace"
ON public.portraits FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update portraits in their workspace"
ON public.portraits FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete portraits in their workspace"
ON public.portraits FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);
