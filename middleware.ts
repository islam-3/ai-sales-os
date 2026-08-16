import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only /dashboard and its sub-routes (e.g. /dashboard/settings) run
  // through this middleware. /signup, /login, /chat, API routes, and
  // everything else are untouched and stay public.
  matcher: ["/dashboard/:path*"],
};
