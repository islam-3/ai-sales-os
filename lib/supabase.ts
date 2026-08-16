import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client. Session is stored in cookies (not localStorage) so
// middleware.ts can read it server-side to gate /dashboard routes — a
// plain @supabase/supabase-js client would keep the session somewhere
// middleware can never see, and every dashboard visit would bounce back
// to /login even right after a successful sign-in. Client components only.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
