import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A Supabase client scoped to the current request's session cookie —
// anon key, so every query is subject to RLS with auth.uid() resolved
// from the signed-in user. For use in Server Components, Server Actions,
// and Route Handlers under app/dashboard/** ONLY.
//
// NOT a singleton — call this fresh on every request. It reads
// next/headers' cookies() at call time, which is only valid within the
// current request's context; sharing one instance across requests would
// leak one user's session into another's.
//
// setAll's cookie writes are wrapped in try/catch: Server Components can
// only read cookies (Next.js throws if you try to write one during
// render). That's fine here because middleware.ts already refreshes the
// session on every /dashboard request, so a Server Component never needs
// to persist a refreshed token itself — only Server Actions and Route
// Handlers do, and those CAN write cookies, so the try succeeds there.
export function createSessionClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component during render — safe to
            // ignore, see the comment above.
          }
        },
      },
    }
  );
}

export type SessionClient = ReturnType<typeof createSessionClient>;
