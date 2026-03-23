ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_portraits_per_period integer,
  ADD COLUMN IF NOT EXISTS max_ai_summaries_per_period integer,
  ADD COLUMN IF NOT EXISTS max_exports_per_period integer;
