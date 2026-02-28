-- OAuth tokens for Google Sheets / Microsoft Excel (per user).
-- Run in Supabase SQL Editor. Tokens should be encrypted at application layer before storing.

CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_sheets', 'microsoft_excel')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider ON user_integrations(user_id, provider);

-- RLS: only the owning user can read/insert/update their rows. Service role (backend) bypasses RLS.
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own integrations"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow metrics to reference an external spreadsheet/Excel range.
ALTER TABLE metrics
ADD COLUMN IF NOT EXISTS integration_config jsonb DEFAULT NULL;

-- data_source can be 'manual' | 'google_sheets' | 'microsoft_excel' (no enum change if column is text).
