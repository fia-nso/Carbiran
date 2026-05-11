import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Service role key — required for auth.admin.* operations.
// Add VITE_SUPABASE_SERVICE_ROLE_KEY to your .env file (Supabase dashboard → Project settings → API).
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
