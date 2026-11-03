// Type only: this file is imported by every script's tenant guard, and a
// value import would drag the Anthropic and Supabase clients in with it.
import type { VisitorSignals } from "./visitor-signals";

// Which tenants automated runs are allowed to talk to.
//
// Measurement and live-check scripts hold a chat conversation, which
// writes a lead, a transcript, a session row and a metered conversation —
// real visitor data, indistinguishable on the dashboard from a real
// enquiry. Pointed at a customer's tenant they fill that customer's leads
// list with fictional people. That happened: one clinic's list reached
// 174 leads, every one of them ours.
//
// So a script may only hold a conversation with a tenant that has been
// explicitly marked as a test tenant. The flag is opt-in and lives on the
// tenant, not in the script: a constant at the top of a file is a
// convention, and a convention is what failed.

/** The slug used by the shared test tenant. */
export const TEST_TENANT_SLUG = "test-clinic";

/**
 * Whether automated runs may generate visitor traffic against a tenant.
 *
 * Strictly `true` — not truthy. A tenant that has never heard of this
 * flag, or carries a stray string in it, is a real tenant as far as this
 * is concerned. The safe answer is the one that refuses.
 */
export function isTestTenant(settings: { is_test?: boolean } | null | undefined): boolean {
  return settings?.is_test === true;
}

/**
 * The message shown when a run is refused.
 *
 * Long, and deliberately so: someone sees this because they are one
 * keystroke from writing fake leads into a real business's dashboard, and
 * the fix should not require reading the source to work out.
 */
export function refusalMessage(slug: string): string {
  return [
    ``,
    `  REFUSED: "${slug}" is not a test tenant.`,
    ``,
    `  This script holds a real conversation. It writes a lead, a transcript,`,
    `  a session row and a metered conversation, all of which show up on that`,
    `  tenant's dashboard as a genuine enquiry.`,
    ``,
    `  Run it against "${TEST_TENANT_SLUG}" instead:`,
    ``,
    `      SLUG=${TEST_TENANT_SLUG} npx tsx scripts/<script>.ts`,
    ``,
    `  If that tenant does not exist yet:`,
    ``,
    `      npx tsx scripts/create-test-tenant.ts`,
    ``,
    `  Marking a real tenant as a test tenant to get past this is never the`,
    `  right fix. Its owner is using that dashboard.`,
    ``,
  ].join("\n");
}

/**
 * Whether this turn's answer-gap capture should be skipped.
 *
 * The smoke test runs after every push and asks the same questions every
 * time — the process step by step, on purpose (see scripts/smoke-test.ts).
 * Captured, they fill test-clinic's "no answer yet" list with our own
 * questions, and each capture is a judge call: a whole knowledge base of
 * input, spent to learn nothing.
 *
 * Honoured ONLY on a test tenant. The request is the visitor's, so the
 * flag is something anyone can send; on a real tenant it must change
 * nothing, or a visitor could switch off what the owner's dashboard
 * relies on. Strictly `true` on both sides, for the same reason as
 * isTestTenant.
 *
 * Opt-in per request, not per tenant: scripts/live-capture-check.ts
 * exists to verify capture against test-clinic and must not skip it.
 */
export function shouldSkipCapture(
  requested: unknown,
  settings: { is_test?: boolean } | null | undefined
): boolean {
  return requested === true && isTestTenant(settings);
}

/**
 * What a test run gets back from /api/chat on top of the reply.
 *
 * The classifier's verdict for the turn, so the smoke test can assert
 * that a visitor stepping back was READ as stepping back, in every
 * language, instead of guessing it from how long the reply was. The
 * length proxy failed at random (82f4625), and a proxy that fails at
 * random teaches people to ignore red runs.
 *
 * Gated exactly like shouldSkipCapture: asked for in the request AND a
 * test tenant, both strictly `true`. On a real tenant this returns an
 * empty object whatever the request says. The verdict describes the
 * visitor's own message, but it is still our internal reading of a
 * customer, and a real tenant's chat page has no use for it.
 *
 * `available` is signalsAvailable(signals), passed in rather than
 * computed here for the import reason at the top of this file.
 *
 * The route spreads this into its response and nothing else adds the
 * key; scripts/test-capture-skip.ts checks both.
 */
export function testOnlyResponseFields(
  requested: unknown,
  settings: { is_test?: boolean } | null | undefined,
  signals: VisitorSignals,
  available: boolean
): { signals?: VisitorSignals & { available: boolean } } {
  if (requested !== true || !isTestTenant(settings)) return {};
  return { signals: { ...signals, available } };
}
