// The dashboard half of the live smoke test: sign in and load the page.
//
// Every failure that has actually reached production lately was in a
// non-English conversation or in the dashboard, and the chat half of this
// suite could only see the first. The lockout is the case in point: an
// owner signed in successfully and was told their account had no
// business, and nothing automated noticed for a day, because nothing
// automated had ever signed in.
//
// This drives the real cookie flow through @supabase/ssr — the same
// library the app reads sessions with — rather than hand-building a
// cookie, so it cannot drift from what the server expects.
//
// It signs in as a dedicated account that owns ONLY the test tenant, so
// RLS confines it there even if something else goes wrong.

import { createServerClient } from "@supabase/ssr";
import { TEST_TENANT_SLUG } from "../lib/test-tenant";

export type DashboardFailure = { what: string; detail: string };

/** Pages worth loading: each broke, or could break, on its own. */
const PAGES = ["/dashboard", "/dashboard/business", "/dashboard/settings", "/dashboard/billing"];

/**
 * The multi-business banner, matched on its STATIC words only.
 *
 * React server-rendering splits interpolated values out of their
 * surrounding text — the page actually contains
 * "This account has <!-- -->2<!-- --> businesses" — so a pattern with the
 * number inline never matches. Checking for that cost a false alarm:
 * "the banner does not render on production", when it renders fine.
 */
const BANNER = /This account has[\s\S]{0,40}businesses/;
const BANNER_TAIL = /the oldest one/;

/** Copy that means the page gave up. */
const NOT_FOUND_COPY = /couldn&apos;t find a business|couldn't find a business|couldn’t find a business/i;
// No check for dental wording in the rendered HTML, deliberately. The
// test tenant's own industry is "Dental clinic" and its business name
// contains "Clinic" — both legitimate business DATA — so matching the
// page would fail on correct pages. Copy regressions are caught at source
// by scripts/audit-copy.ts, which can tell our copy from a tenant's own
// words; rendered HTML cannot.

export async function runDashboardChecks(base: string): Promise<DashboardFailure[]> {
  const failures: DashboardFailure[] = [];
  const email = process.env.TEST_OWNER_EMAIL ?? "";
  const password = process.env.TEST_OWNER_PASSWORD ?? "";

  console.log(`\n── Dashboard (signed in as ${email || "<unset>"})`);

  // A cookie jar standing in for the browser's. createServerClient writes
  // the session into it exactly as the app will later read it.
  const jar = new Map<string, string>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    }
  );

  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.user) {
    failures.push({
      what: "sign-in failed",
      detail: signInError?.message ?? "no user returned",
    });
    console.log("   sign-in: ✗ FAILED");
    return failures;
  }
  console.log("   sign-in: ok");

  if (jar.size === 0) {
    failures.push({ what: "no session cookie", detail: "sign-in produced nothing to send" });
    return failures;
  }
  const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");

  for (const path of PAGES) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
    } catch (error) {
      failures.push({ what: `${path}: request failed`, detail: String((error as Error).message) });
      console.log(`   ${path}: ✗ REQUEST FAILED`);
      continue;
    }

    // A redirect here means middleware did not accept the session, which
    // is the signed-out experience wearing a signed-in session.
    if (res.status >= 300 && res.status < 400) {
      failures.push({
        what: `${path}: redirected away while signed in`,
        detail: `${res.status} -> ${res.headers.get("location") ?? "?"}`,
      });
      console.log(`   ${path}: ✗ REDIRECTED (${res.status})`);
      continue;
    }
    if (!res.ok) {
      failures.push({ what: `${path}: HTTP ${res.status}`, detail: (await res.text()).slice(0, 120) });
      console.log(`   ${path}: ✗ HTTP ${res.status}`);
      continue;
    }

    const html = await res.text();

    // The lockout, exactly as it read on screen.
    if (NOT_FOUND_COPY.test(html)) {
      failures.push({
        what: `${path}: "couldn't find a business"`,
        detail: "signed in successfully and the page still could not resolve the tenant",
      });
      console.log(`   ${path}: ✗ NO BUSINESS FOUND`);
      continue;
    }

    // The dashboard actually rendered this tenant, not a shell.
    if (!html.includes("TEST")) {
      failures.push({
        what: `${path}: the tenant's name is not on the page`,
        detail: `expected the ${TEST_TENANT_SLUG} business name in the rendered HTML`,
      });
      console.log(`   ${path}: ✗ TENANT NAME MISSING`);
      continue;
    }

    // With ONE business there must be no banner: saying an account has
    // one business when it has one is noise, and a banner that is always
    // there stops being read.
    if (path === "/dashboard" && (BANNER.test(html) || BANNER_TAIL.test(html))) {
      failures.push({
        what: "/dashboard: multi-business banner shown for a single business",
        detail: "the banner must appear only when there is genuinely more than one",
      });
      console.log(`   ${path}: ✗ SPURIOUS BANNER`);
      continue;
    }

    console.log(`   ${path}: ok`);
  }

  failures.push(...(await checkBannerAppears(base, cookie)));

  await client.auth.signOut();
  return failures;
}

/**
 * The banner must appear when the account really does own two.
 *
 * Checked by temporarily giving the test owner a second business, which
 * is the only honest way to see it: the condition cannot be simulated
 * from outside, and this exact condition locked a real owner out.
 *
 * Cleaned up in a finally, and any leftovers from an interrupted run are
 * swept first — a stray second tenant would otherwise make every later
 * run fail the single-business check instead, which is at least loud.
 */
async function checkBannerAppears(base: string, cookie: string): Promise<DashboardFailure[]> {
  const failures: DashboardFailure[] = [];
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: owner } = await supabaseServer
    .from("tenants")
    .select("owner_user_id")
    .eq("slug", TEST_TENANT_SLUG)
    .single();
  const ownerId = owner?.owner_user_id;
  if (!ownerId) {
    failures.push({
      what: "the test tenant has no owner",
      detail: "run scripts/create-test-owner.ts",
    });
    return failures;
  }

  await supabaseServer.from("tenants").delete().like("slug", "test-second-%");

  const slug = `test-second-${Date.now()}`;
  const { data: temp, error } = await supabaseServer
    .from("tenants")
    .insert({
      business_name: "TEST second business (temporary)",
      slug,
      industry: "Law firm",
      owner_user_id: ownerId,
      settings: { is_test: true },
      plan_id: "trial",
      subscription_status: "trialing",
    })
    .select("id")
    .single();
  if (error || !temp) {
    failures.push({ what: "could not create a second business to test with", detail: String(error?.message) });
    return failures;
  }

  try {
    const res = await fetch(`${base}/dashboard`, { headers: { cookie }, redirect: "manual" });
    const html = res.ok ? await res.text() : "";
    if (!res.ok) {
      failures.push({ what: "two businesses: /dashboard failed", detail: `HTTP ${res.status}` });
    } else if (NOT_FOUND_COPY.test(html)) {
      // The original lockout, exactly.
      failures.push({
        what: "two businesses: locked out",
        detail: "an owner with two businesses was told their account has none",
      });
      console.log("   two businesses: ✗ LOCKED OUT");
    } else if (!BANNER.test(html) || !BANNER_TAIL.test(html)) {
      failures.push({
        what: "two businesses: no banner",
        detail: "one was chosen silently, so the other is invisible with nothing to explain it",
      });
      console.log("   two businesses: ✗ NO BANNER");
    } else {
      console.log("   two businesses: ok (banner shown, not locked out)");
    }
  } finally {
    await supabaseServer.from("tenants").delete().eq("id", temp.id);
  }

  return failures;
}
