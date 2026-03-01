-- Allow users to delete their own integration rows (e.g. disconnect Google/Excel).
-- Backend uses service role for DELETE; this policy keeps RLS consistent for client access.

CREATE POLICY "Users can delete own integrations"
  ON public.user_integrations FOR DELETE
  USING (auth.uid() = user_id);
