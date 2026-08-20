import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /dashboard and /admin (and their sub-routes) run through this
  // middleware. /signup, /login, /chat, /privacy, /terms, API routes, and
  // everything else are untouched and stay public.
  //
  // /admin only gets "must be signed in" from here — being a platform
  // admin is a separate check inside the page itself, since middleware
  // has no cheap way to read the allow-list per request.
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
