ALTER TABLE public.interviews
  DROP CONSTRAINT IF EXISTS interviews_status_check;

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('draft', 'processing', 'completed', 'failed'));
