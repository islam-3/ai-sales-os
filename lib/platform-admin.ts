import { createSessionClient } from "./supabase-session";

// Platform-owner (not tenant-owner) access check for the internal usage
// pages.
//
// The allow-list lives in an env var rather than the database so it needs
// no migration and can't be edited from inside the app. It is checked
// against the signed-in user's email, so this builds on the existing
// login rather than introducing a second credential — deliberately not a
// secret in the URL, which leaks through server logs, browser history,
// and Referer headers.
//
// Set in .env.local (comma-separated, case-insensitive):
//   PLATFORM_ADMIN_EMAILS=you@example.com,cofounder@example.com
//
// If the variable is unset, nobody is an admin — the page fails closed
// rather than exposing cross-tenant spend to every logged-in owner.
export async function isPlatformAdmin(): Promise<boolean> {
  const allowList = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) return false;

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  return Boolean(email && allowList.includes(email));
}
