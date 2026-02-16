-- Max members per workspace (excluding owner); NULL = unlimited.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_members integer;

COMMENT ON COLUMN plans.max_members IS 'Max workspace members (excluding owner) per workspace; NULL = unlimited';
