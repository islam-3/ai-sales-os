// The only way a script may talk to /api/chat.
//
// Every automated conversation goes through say() below, and say() will
// not send the first message until it has checked that the target tenant
// is a test tenant. That check is not a step a script performs — it is
// the door itself, so a script written next month cannot forget it.
//
// Importing supabase or calling fetch() directly would get around this.
// Don't. scripts/test-tenant-guard.ts asserts that no script under
// scripts/ posts to /api/chat by any other route, so that shortcut fails
// the suite rather than failing a customer.

import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

export type Reply = { reply: string };

// Checked once per process, then remembered: the guard protects against a
// script aimed at the wrong tenant, which cannot change halfway through.
let checked: string | null = null;

async function ensureTestTenant(slug: string): Promise<void> {
  if (checked === slug) return;

  const { supabaseServer } = await import("../lib/supabase-server");
  const { data, error } = await supabaseServer
    .from("tenants")
    .select("slug, business_name, settings")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`could not check tenant "${slug}": ${error.message}`);
  if (!data) throw new Error(`no tenant with slug "${slug}"`);

  // parseTenantSettings is an allowlist and would be the honest reader
  // here, but this must not depend on the flag surviving a parser it
  // does not control. The raw row is what the database actually holds.
  const settings = (data.settings ?? {}) as { is_test?: boolean };
  if (!isTestTenant(settings)) {
    throw new Error(refusalMessage(slug));
  }

  checked = slug;
  console.log(`✓ target: ${data.business_name} (${slug}) — test tenant\n`);
}

/**
 * Sends one visitor message and returns the assistant's reply.
 *
 * ── Why this retries a THROWN fetch, not just a bad status ───────────
 * It used to retry only a non-ok response, so a fetch that rejected
 * outright went straight out of the loop. That is not a hypothetical:
 * the smoke run against production failed its last four turns with
 * "fetch failed" - a socket-level error after roughly 35 requests - and
 * reported six product failures that were nothing of the kind.
 *
 * A smoke test that fails for its own reasons teaches nobody anything,
 * and worse, it trains whoever reads it to discount a red run. So a
 * transport failure is retried like any other, with backoff.
 *
 * Three attempts, not two: the failures seen came in bursts, and a
 * single extra try landed inside the same burst.
 */
const ATTEMPTS = Number(process.env.CHAT_CLIENT_ATTEMPTS ?? 3);

export async function say(sessionId: string, message: string, slug: string = SLUG): Promise<Reply> {
  await ensureTestTenant(slug);

  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, sessionId, slug }),
      });
      if (res.ok) return (await res.json()) as Reply;
      last = `${res.status} ${(await res.text()).slice(0, 200)}`;
    } catch (error) {
      // The cause carries the useful part; undici's own message is just
      // "fetch failed", which says nothing about what went wrong.
      const cause = (error as { cause?: { message?: string; code?: string } }).cause;
      last = `${(error as Error).message}${cause?.code ? ` (${cause.code})` : ""}${
        cause?.message ? `: ${cause.message}` : ""
      }`;
    }

    if (attempt < ATTEMPTS) {
      const backoff = 2000 * attempt;
      console.log(`    (attempt ${attempt} failed: ${last.slice(0, 70)} — retrying in ${backoff / 1000}s)`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error(`${ATTEMPTS} attempts failed, last: ${last}`);
}
