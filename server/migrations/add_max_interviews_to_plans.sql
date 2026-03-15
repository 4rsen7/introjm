-- Add max_interviews to plans table for subscription limits
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_interviews INT;
