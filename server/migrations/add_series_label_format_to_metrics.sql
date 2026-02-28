-- Add optional label format for Series metrics (axis/tooltip date formatting).
-- Run in Supabase SQL Editor if your metrics table does not have this column yet.

ALTER TABLE metrics
ADD COLUMN IF NOT EXISTS series_label_format text DEFAULT 'text';
