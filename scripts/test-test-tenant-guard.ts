// The guard that keeps automated conversations off real tenants.
//
//   npx tsx scripts/test-test-tenant-guard.ts
//
// Two halves. The pure functions are tested directly. The part that
// actually protects a customer — that no script reaches /api/chat around
// the guard — is tested by reading the scripts, because a helper nobody
// is obliged to use protects nothing.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

console.log("--- only an explicit flag counts ---");
check("a marked tenant passes", isTestTenant({ is_test: true }));
check("an unmarked tenant does not", !isTestTenant({}));
check("a null settings object does not", !isTestTenant(null));
check("an undefined one does not", !isTestTenant(undefined));
// Truthiness is the whole risk here: a tenant holding a stray "false",
// "0" or "no" in this field is a real tenant, and every one of those is
// truthy in JavaScript.
check("the string \"false\" does not", !isTestTenant({ is_test: "false" } as never));
check("the string \"true\" does not", !isTestTenant({ is_test: "true" } as never));
check("the number 1 does not", !isTestTenant({ is_test: 1 } as never));

console.log("\n--- the flag survives a settings round-trip ---");
// parseTenantSettings is an allowlist, so a field it does not know about
// is silently dropped on every dashboard save. Dropped here, the test
// tenant would lock its own scripts out.
check(
  "a marked tenant stays marked",
  parseTenantSettings({ is_test: true, currency: "USD" }).is_test === true
);
check(
  "and nothing else acquires the flag",
  parseTenantSettings({ currency: "USD" }).is_test === undefined
);
check(
  "a truthy impostor is not promoted on the way through",
  parseTenantSettings({ is_test: "yes" }).is_test === undefined
);

console.log("\n--- the refusal says what to do about it ---");
const refusal = refusalMessage("prof-clinic");
check("it names the tenant it refused", refusal.includes("prof-clinic"));
check("it names the one to use instead", refusal.includes(TEST_TENANT_SLUG));
check("it gives the command to create it", refusal.includes("create-test-tenant"));
check(
  "and it rules out the wrong fix explicitly",
  /never the\s+right fix/.test(refusal),
  "the tempting repair is to flag the real tenant, which is the accident itself"
);

console.log("\n--- no script reaches the chat API around the guard ---");
const dir = join(process.cwd(), "scripts");
const offenders: string[] = [];
readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && f !== "_chat-client.ts")
  .forEach((file) => {
    const src = readFileSync(join(dir, file), "utf8");
    // A string mentioning the route in a comment or a message is fine.
    // Building a request to it is not.
    const posts = /fetch\(\s*[`"'][^`"']*\/api\/chat/.test(src) || /\$\{BASE\}\/api\/chat/.test(src);
    if (posts) offenders.push(file);
  });
check(
  "every conversation goes through say()",
  offenders.length === 0,
  offenders.length ? `these post directly: ${offenders.join(", ")}` : undefined
);

console.log("\n--- the guard runs before the first message, not after ---");
const client = readFileSync(join(dir, "_chat-client.ts"), "utf8");
const sayBody = client.slice(client.indexOf("export async function say"));
const awaitAt = sayBody.indexOf("ensureTestTenant");
const fetchAt = sayBody.indexOf("fetch(");
check(
  "say() checks the tenant before it sends anything",
  awaitAt !== -1 && fetchAt !== -1 && awaitAt < fetchAt,
  "a check that runs after the request has already written the lead"
);
check(
  "and it throws rather than returning a flag a caller can ignore",
  /throw new Error\(refusalMessage\(slug\)\)/.test(client)
);
check(
  "the raw row is what it reads",
  /data\.settings \?\? \{\}/.test(client),
  "reading through a parser it does not control would make the guard depend on that parser"
);

console.log(bad ? `\n${bad} FAILING` : "\nall test-tenant guard tests passed");
