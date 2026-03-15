-- Migration to add `type` column to existing interviews table

ALTER TABLE public.interviews 
ADD COLUMN type text CHECK (type IN ('live', 'upload')) DEFAULT 'live';
