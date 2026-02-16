-- Support & Feedback: user submissions and admin replies (two-way).

-- User submissions (Report issue / Send idea)
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('issue', 'idea')),
  subject text NOT NULL,
  body text NOT NULL,
  -- issue
  steps_to_reproduce text,
  attachment_url text,
  -- idea
  category text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Replies (user or admin); read_at = when user saw this reply (for unread badge)
CREATE TABLE IF NOT EXISTS feedback_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('user', 'admin')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);

-- RLS: users see only their feedback and its replies; admin via service role
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select_own"
  ON feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_insert_own"
  ON feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_replies_select_own_feedback"
  ON feedback_replies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM feedback f WHERE f.id = feedback_replies.feedback_id AND f.user_id = auth.uid())
  );

-- Only backend (service role) inserts replies; no INSERT policy for authenticated = only service role can insert.

COMMENT ON TABLE feedback IS 'Support submissions: issue or idea from app users';
COMMENT ON TABLE feedback_replies IS 'Replies to feedback; admin replies have read_at null until user opens thread';
