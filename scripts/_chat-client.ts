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

export type Reply = {
  reply: string;
  media: { url: string; type: string | null } | null;
};

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
 * Retries once. A single upstream timeout should not throw away a run of
 * seventy-two calls, and a retried turn measures the same thing.
 */
export async function say(sessionId: string, message: string, slug: string = SLUG): Promise<Reply> {
  await ensureTestTenant(slug);

  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sessionId, slug }),
    });
    if (res.ok) return res.json();
    last = `${res.status} ${await res.text()}`;
    if (attempt === 0) {
      console.log(`    (retrying after ${res.status})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(last);
}
