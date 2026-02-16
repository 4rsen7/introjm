-- Add per-workspace limit fields to plans (configurable in admin).
-- NULL = unlimited.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_journeys integer,
  ADD COLUMN IF NOT EXISTS max_personas integer,
  ADD COLUMN IF NOT EXISTS max_metrics integer;

COMMENT ON COLUMN plans.max_journeys IS 'Max journey maps per workspace; NULL = unlimited';
COMMENT ON COLUMN plans.max_personas IS 'Max personas per workspace; NULL = unlimited';
COMMENT ON COLUMN plans.max_metrics IS 'Max metrics per workspace; NULL = unlimited';

-- Optional: set defaults for existing "Starter" plan (adjust numbers as needed)
-- UPDATE plans SET max_journeys = 5, max_personas = 5, max_metrics = 5 WHERE name ILIKE 'Starter' AND max_journeys IS NULL;
