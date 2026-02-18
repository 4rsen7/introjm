-- Run in Supabase SQL Editor if profiles.avatar_color is missing.
-- Stores Tailwind classes, e.g. 'bg-blue-100 text-blue-600'.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_color text;

COMMENT ON COLUMN profiles.avatar_color IS 'Tailwind classes for profile avatar (e.g. bg-blue-100 text-blue-600)';
