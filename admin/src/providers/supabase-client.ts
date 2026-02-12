import { createClient } from "@refinedev/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_API_KEY, SUPABASE_API_URL } from "./constants";

export const supabaseClient: SupabaseClient = createClient(
  SUPABASE_API_URL,
  SUPABASE_API_KEY,
  {
    db: {
      schema: "public",
    },
    auth: {
      persistSession: true,
    },
  }
);
