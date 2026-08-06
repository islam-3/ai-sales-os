import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only client — uses the service_role key, which bypasses Row Level
// Security. Never import this into client components or expose it to the
// browser; use lib/supabase.ts (anon key) there instead.
export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey);
