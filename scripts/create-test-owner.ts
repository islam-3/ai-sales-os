// Creates the account that owns the test tenant, so the smoke test can
// sign in and exercise the dashboard the way a real owner does.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/create-test-owner.ts
//
// A dedicated account, never a real person's. The smoke test signs in as
// this user on every deploy, and it must never be possible for that to
// touch a customer's data — this account owns exactly one tenant, the
// test one, and RLS confines it to that.
//
// The password is written to a gitignored file rather than printed, so it
// does not end up in a terminal transcript or CI log. Copy it into the
// repository secret TEST_OWNER_PASSWORD.
//
// Safe to re-run: it reuses the account if it already exists and only
// resets the password when asked with RESET_PASSWORD=yes.

import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { TEST_TENANT_SLUG } from "../lib/test-tenant";

const EMAIL = process.env.TEST_OWNER_EMAIL ?? "smoke-test@ai-sales-os.invalid";
const CREDENTIALS_FILE = ".test-owner-credentials";

/** Strong enough that a leak is a nuisance rather than an incident. */
function newPassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  // The tenant must exist first — this account's whole purpose is owning it.
  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id, business_name, settings")
    .eq("slug", TEST_TENANT_SLUG)
    .maybeSingle();
  if (!tenant) {
    throw new Error(`no "${TEST_TENANT_SLUG}" tenant — run scripts/create-test-tenant.ts first`);
  }
  const isTest = (tenant.settings as { is_test?: boolean } | null)?.is_test === true;
  if (!isTest) {
    // Refusing here matters: this script hands an account ownership of a
    // tenant, and doing that to a real business would be handing someone
    // else's dashboard to a shared test credential.
    throw new Error(`"${TEST_TENANT_SLUG}" is not marked is_test — refusing to give it an owner`);
  }

  // Find the account if it is already there, since listUsers is the only
  // way to look one up by email with the admin API.
  let userId: string | null = null;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;
    userId = data.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())?.id ?? null;
  }

  const password = newPassword();
  let wrotePassword = false;

  if (!userId) {
    const { data, error } = await supabaseServer.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true, // no inbox exists for this address
    });
    if (error) throw error;
    userId = data.user.id;
    wrotePassword = true;
    console.log(`created account ${EMAIL} (${userId})`);
  } else {
    console.log(`account already exists: ${EMAIL} (${userId})`);
    if (process.env.RESET_PASSWORD === "yes") {
      const { error } = await supabaseServer.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      wrotePassword = true;
      console.log("password reset");
    } else {
      console.log("password left alone — re-run with RESET_PASSWORD=yes to change it");
    }
  }

  // Ownership. Checked afterwards rather than assumed, because the whole
  // outage this covers came from nobody checking what owned what.
  const { error: ownError } = await supabaseServer
    .from("tenants")
    .update({ owner_user_id: userId })
    .eq("id", tenant.id);
  if (ownError) throw ownError;

  const { data: owned } = await supabaseServer
    .from("tenants")
    .select("slug")
    .eq("owner_user_id", userId);
  console.log(`\n${EMAIL} now owns ${owned?.length ?? 0} tenant(s): ${(owned ?? []).map((t) => t.slug).join(", ")}`);
  if ((owned?.length ?? 0) !== 1) {
    throw new Error("the test owner must own exactly one tenant");
  }

  if (wrotePassword) {
    writeFileSync(
      CREDENTIALS_FILE,
      `TEST_OWNER_EMAIL=${EMAIL}\nTEST_OWNER_PASSWORD=${password}\n`,
      { mode: 0o600 }
    );
    console.log(`\ncredentials written to ${CREDENTIALS_FILE} (gitignored)`);
    console.log("copy them into the repository secrets TEST_OWNER_EMAIL and TEST_OWNER_PASSWORD");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
