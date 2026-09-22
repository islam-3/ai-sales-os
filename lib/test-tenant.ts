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
