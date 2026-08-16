import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reads the Supabase session from the incoming request's cookies and
// redirects to /login if there isn't a valid one. Called from
// middleware.ts, whose matcher scopes this to /dashboard and its
// sub-routes only — every other route in the app never runs this at all.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Reassigned inside setAll below — see the comment there.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Supabase's documented pattern: write the cookies onto the
          // request too (not just the response), then rebuild the
          // response from that updated request, so any server component
          // rendered after this middleware also sees the fresh cookies.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // Auth cookie responses must not be cached by a CDN/reverse
          // proxy, or one user's session could be served to another.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // getUser() (not getSession()) is deliberate — it revalidates the token
  // against the Auth server instead of just trusting a decoded cookie, so
  // a tampered or stale cookie can't slip through as "authenticated".
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // Must be returned as-is — it may carry refreshed session cookies that
  // the browser and subsequent server renders need to see.
  return response;
}
