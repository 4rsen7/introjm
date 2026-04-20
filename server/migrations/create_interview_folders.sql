CREATE TABLE IF NOT EXISTS public.interview_folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.interview_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS interview_folders_workspace_id_idx
  ON public.interview_folders(workspace_id);

CREATE INDEX IF NOT EXISTS interviews_folder_id_idx
  ON public.interviews(folder_id);

ALTER TABLE public.interview_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view interview folders in their workspace" ON public.interview_folders;
CREATE POLICY "Users can view interview folders in their workspace"
ON public.interview_folders FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert interview folders in their workspace" ON public.interview_folders;
CREATE POLICY "Users can insert interview folders in their workspace"
ON public.interview_folders FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update interview folders in their workspace" ON public.interview_folders;
CREATE POLICY "Users can update interview folders in their workspace"
ON public.interview_folders FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete interview folders in their workspace" ON public.interview_folders;
CREATE POLICY "Users can delete interview folders in their workspace"
ON public.interview_folders FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    UNION
    SELECT id AS workspace_id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);
