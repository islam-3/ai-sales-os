// The smoke test's skip-capture flag is honoured only on a test tenant.
//
//   npx tsx scripts/test-capture-skip.ts
//
// The flag arrives in the request body, which a visitor controls. If it
// worked on a real tenant, anyone could switch off the owner's "no
// answer yet" list — silently, because an empty list looks like a
// business with every answer.

import { shouldSkipCapture } from "../lib/test-tenant";

let bad = 0;
const check = (name: string, pass: boolean) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

check("skipped on a test tenant that asks", shouldSkipCapture(true, { is_test: true }));
check("not skipped on a real tenant that asks", !shouldSkipCapture(true, {}));
check("not skipped when settings are missing", !shouldSkipCapture(true, null));
check("not skipped on a test tenant that does not ask", !shouldSkipCapture(undefined, { is_test: true }));
check("a truthy string is not a request", !shouldSkipCapture("true", { is_test: true }));
check(
  "a truthy string is not a test tenant",
  !shouldSkipCapture(true, { is_test: "true" } as unknown as { is_test?: boolean })
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nall passed");
