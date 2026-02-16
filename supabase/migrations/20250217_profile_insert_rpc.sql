-- Allow server to create/update profile bypassing RLS (e.g. Auto-Fix on first GET /api/profile).
-- Call from backend: supabase.rpc('insert_profile_for_user', { p_user_id: '...', p_email: '...', p_full_name: '...' })

CREATE OR REPLACE FUNCTION insert_profile_for_user(
  p_user_id uuid,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(TRIM(p_email), ''), ''),
    COALESCE(NULLIF(TRIM(p_full_name), ''), 'User')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''), profiles.email),
    full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), profiles.full_name);
$$;

COMMENT ON FUNCTION insert_profile_for_user(uuid, text, text) IS 'Create or update profile; used by backend Auto-Fix to bypass RLS';
