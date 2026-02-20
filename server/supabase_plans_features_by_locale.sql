-- Run in Supabase SQL Editor to support localized plan features.
-- Format: { "en": ["Feature 1", "Feature 2"], "uk": ["Фіча 1", "Фіча 2"] }
-- Fallback: API uses plan.features when features_by_locale is null or locale key missing.

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS features_by_locale jsonb;

COMMENT ON COLUMN plans.features_by_locale IS 'Plan features per locale: { "en": ["..."], "uk": ["..."] }';

-- Optional: backfill existing features as English (run once if you have existing plans)
-- UPDATE plans SET features_by_locale = jsonb_build_object('en', to_jsonb(features)) WHERE features IS NOT NULL AND features_by_locale IS NULL;
