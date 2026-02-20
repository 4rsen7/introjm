-- Run in Supabase SQL Editor: plan currency (USD/EUR/UAH) + description per locale.
-- currency: display currency for this plan; default USD for existing rows.
-- description_by_locale: { "en": "...", "uk": "..." }; API resolves by locale, fallback to plan.description.

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS description_by_locale jsonb;

COMMENT ON COLUMN plans.currency IS 'Display currency: USD, EUR, or UAH';
COMMENT ON COLUMN plans.description_by_locale IS 'Plan description per locale: { "en": "...", "uk": "..." }';

-- Optional: backfill description as English (run once if you have existing plans)
-- UPDATE plans SET description_by_locale = jsonb_build_object('en', description) WHERE description IS NOT NULL AND description_by_locale IS NULL;

-- After running this migration, reload PostgREST schema cache (Supabase SQL Editor):
-- NOTIFY pgrst, 'reload schema';
