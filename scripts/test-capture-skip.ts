// The smoke test's test-only request flags are honoured only on a test
// tenant: skipCapture, and includeSignals (the classifier's verdict).
//
//   npx tsx scripts/test-capture-skip.ts
//
// The flag arrives in the request body, which a visitor controls. If it
// worked on a real tenant, anyone could switch off the owner's "no
// answer yet" list — silently, because an empty list looks like a
// business with every answer.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldSkipCapture, testOnlyResponseFields } from "../lib/test-tenant";

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

// ── The classifier's verdict in the response ───────────────────────
// Same gate, same reasons, and the stronger claim: a real tenant NEVER
// receives it, whatever the request says. Checked as absence of the key,
// not as a falsy value — `signals: undefined` would still be a field a
// later change could fill.
{
  const verdict = { direct_request: false, hesitation: true, impatience: false, asking_for_information: false };
  const realTenants: unknown[] = [{}, null, undefined, { is_test: false }, { is_test: "true" }, { is_test: 1 }];
  const requests: unknown[] = [true, "true", 1, {}, undefined];
  let leaked = 0;
  for (const settings of realTenants) {
    for (const requested of requests) {
      for (const available of [true, false]) {
        const fields = testOnlyResponseFields(
          requested,
          settings as { is_test?: boolean },
          verdict,
          available
        );
        if (Object.keys(fields).length > 0) leaked++;
      }
    }
  }
  check(`a non-test tenant never receives the verdict (${realTenants.length * requests.length * 2} combinations)`, leaked === 0);

  check(
    "a test tenant that does not ask does not receive it",
    Object.keys(testOnlyResponseFields(undefined, { is_test: true }, verdict, true)).length === 0
  );
  const given = testOnlyResponseFields(true, { is_test: true }, verdict, false);
  check(
    "a test tenant that asks receives the verdict and whether the classifier answered",
    given.signals?.hesitation === true && given.signals?.available === false
  );

  // The route must add the key through the gate and nowhere else. A
  // second `signals:` in a response would bypass everything above.
  const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8");
  check(
    "the chat route builds its response through testOnlyResponseFields",
    /\.\.\.testOnlyResponseFields\(includeSignals, tenant\.settings,/.test(route)
  );
  check("the chat route never writes a signals key itself", !/\bsignals\s*:/.test(route));
}

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nall passed");
