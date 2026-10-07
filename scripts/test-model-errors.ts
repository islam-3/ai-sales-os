// Does a failure say what actually happened?
//
//   npx tsx scripts/test-model-errors.ts
//
// The sentence this exists to delete:
//
//     "The translation service did not respond. Try again."
//
// The service HAD responded, in 280ms, with a 400 saying the account was
// out of credit. Every word of that message was wrong, including "try
// again" — which is the part that cost an afternoon, because retrying a
// billing refusal can never work.
//
// So the two things worth testing are: is the KIND right, and is
// "try again" only ever said when trying again could help.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { classifyModelError, ownerFacingError } from "../lib/model-errors";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/** Shaped like what the Anthropic SDK actually throws. */
const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status, name: "BadRequestError" });

console.log("--- the failure that actually happened ---");
// Copied from the real response, not paraphrased.
const noCredit = apiError(
  400,
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
);
check("an out-of-credit 400 is recognised", classifyModelError(noCredit).kind === "no_credit");
check(
  "and is NOT retryable",
  classifyModelError(noCredit).retryable === false,
  "retrying a billing refusal can never work"
);
check(
  "the owner is told it needs topping up",
  /credit/i.test(ownerFacingError(noCredit)) && /top/i.test(ownerFacingError(noCredit)),
  ownerFacingError(noCredit)
);
check(
  "and is NOT told to try again",
  !/try again/i.test(ownerFacingError(noCredit)),
  ownerFacingError(noCredit)
);

console.log("\n--- every other kind ---");
const cases: [string, unknown, string, boolean][] = [
  ["an expired or wrong key", apiError(401, "invalid x-api-key"), "auth", false],
  ["a forbidden key", apiError(403, "forbidden"), "auth", false],
  ["a rate limit", apiError(429, "rate limit exceeded"), "rate_limited", true],
  ["an overloaded provider", apiError(529, "overloaded_error"), "overloaded", true],
  ["an aborted call", Object.assign(new Error("Request was aborted."), { name: "AbortError" }), "timeout", true],
  ["a dropped connection", new Error("fetch failed"), "unreachable", true],
  ["some other 4xx", apiError(422, "unprocessable"), "bad_request", false],
  ["anything else", new Error("kaboom"), "unknown", true],
];
for (const [label, error, kind, retryable] of cases) {
  const f = classifyModelError(error);
  check(`${label.padEnd(28)} -> ${kind}`, f.kind === kind, `got ${f.kind}: ${f.detail.slice(0, 60)}`);
  check(
    `${label.padEnd(28)}    retryable=${retryable}`,
    f.retryable === retryable,
    `got ${f.retryable}`
  );
}

console.log("\n--- 'try again' is a promise, not a filler ---");
for (const [label, error] of cases) {
  const f = classifyModelError(error);
  const saysRetry = /try again|wait a minute/i.test(f.ownerMessage);
  check(
    `${label.padEnd(28)} message matches its retryability`,
    saysRetry === f.retryable,
    `retryable=${f.retryable} but message says "${f.ownerMessage}"`
  );
}

console.log("\n--- every message says nothing was changed ---");
for (const [label, error] of [...cases, ["no credit", noCredit] as [string, unknown]]) {
  const message = ownerFacingError(error);
  check(
    `${label.padEnd(28)} is clear the data is intact`,
    /nothing was changed/i.test(message),
    message
  );
}

console.log("\n--- nothing leaks the provider's raw response ---");
for (const [, error] of cases) {
  const message = ownerFacingError(error);
  check(
    "no JSON body in an owner-facing message",
    !message.includes("{") && !message.includes("x-api-key"),
    message
  );
}

console.log("\n--- the old sentence is gone, and cannot come back ---");
// A source sweep, because the property above only covers this module.
// The lie lived in a catch block in a server action, where no unit test
// was ever going to find it.
const offenders: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry) && !full.includes("test-model-errors")) {
      // Comments stripped first. Both this module and the action that
      // used to carry the sentence now QUOTE it to explain why it is
      // gone, and a sweep that flagged its own epitaph would be
      // reporting the documentation rather than the code.
      const src = readFileSync(full, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ 	]*\/\/.*$/gm, "");
      if (/did not respond\. Try again/i.test(src)) offenders.push(full);
    }
  }
}
["app", "lib", "components"].forEach((d) => walk(join(process.cwd(), d)));
check(
  'nothing says "did not respond. Try again"',
  offenders.length === 0,
  offenders.join(", ")
);

console.log("\n--- the chat route degrades rather than 500s ---");
const routeSrc = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
check(
  "the handler is wrapped in a catch",
  /try \{\s*return await handleChat\(body\);\s*\} catch/.test(routeSrc),
  "without this, an out-of-credit account served every visitor a bare 500"
);
check(
  "which serves the safe fallback",
  /reply: await degradedReply\(body\)/.test(routeSrc)
);
check(
  "in the visitor's own language",
  /safeFallbackFor\(message \? \[message\] : \[\], chatLanguage\)/.test(routeSrc),
  "an English apology to someone writing Arabic is the failure twice over"
);
check(
  "and says which failure it was, in the log",
  /kind: failure\.kind/.test(routeSrc),
  '"something went wrong" is how an out-of-credit account looked like a code bug'
);

console.log(bad ? `\n${bad} FAILING` : "\nall model-error tests passed");
process.exit(bad ? 1 : 0);
