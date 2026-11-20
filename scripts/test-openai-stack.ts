// The test-only OpenAI stack: every call on OpenAI, and only on a test tenant.
//
//   npx tsx scripts/test-openai-stack.ts
//
// FREE. Pure functions and the route's source; no model, no database.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPENAI_STACK, testFallbackDrill, testOpenAIStack, testOnlyResponseFields } from "../lib/test-tenant";
import { openAIActive, useOpenAIStack } from "../lib/model-provider";
// A literal, not NO_SIGNALS: importing lib/visitor-signals loads the
// Anthropic client, and test- scripts must not (scripts/test-live-gate.ts).
const NO_SIGNALS = { direct_request: false, accepts_offer: false, hesitation: false, impatience: false, asking_for_information: false, asks_about_price: false };

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ── Only a test tenant, only the literal true ───────────────────────
const realTenants: unknown[] = [{}, null, undefined, { is_test: false }, { is_test: "true" }, { is_test: 1 }];
const requests: unknown[] = [true, "true", 1, {}, undefined, null];
let leaked = 0;
for (const settings of realTenants) for (const requested of requests) if (testOpenAIStack(requested, settings as { is_test?: boolean })) leaked++;
check(`a real tenant never gets the OpenAI stack (${realTenants.length * requests.length} combinations)`, leaked === 0);
check("a test tenant gets it only for the literal true", testOpenAIStack(true, { is_test: true }) && !testOpenAIStack("true", { is_test: true }) && !testOpenAIStack(1, { is_test: true }));
check("no Claude model anywhere in the stack", !Object.values(OPENAI_STACK).some((m) => /claude|sonnet|haiku|opus/i.test(m)));
check("the classifier and coverage are on Luna; the rest on Terra", OPENAI_STACK.classifier === "gpt-6-luna" && OPENAI_STACK.coverage === "gpt-6-luna" && [OPENAI_STACK.reply, OPENAI_STACK.extraction, OPENAI_STACK.judge, OPENAI_STACK.shorten].every((m) => m === "gpt-6.1-terra"));
check("the classifier's time reaches a test tenant only", testOnlyResponseFields(true, { is_test: false }, NO_SIGNALS, true, { classifierMs: 900 }).classifierMs === undefined && testOnlyResponseFields(true, { is_test: true }, NO_SIGNALS, true, { classifierMs: 900 }).classifierMs === 900);

// ── Every call follows the switch, read from the route ──────────────
const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8").replace(/\r\n/g, "\n");
check("the switch is decided once, by the provider module", /const stack = useOpenAIStack\(openaiStack, tenant\.settings\);/.test(route));
check("classifier: Luna under the stack, Haiku otherwise", /stack\s*\?\s*readVisitorSignalsOpenAI\(openai, OPENAI_STACK\.classifier,/.test(route) && /:\s*readVisitorSignals\(trimmedMessage,/.test(route));
check("coverage: Luna under the stack", /coverageWillBeChecked && stack\s*\?\s*\(await readAnsweredDimensionsOpenAI\(\s*openai,\s*OPENAI_STACK\.coverage,/.test(route));
check("reply: Terra under the stack, through the OpenAI fallback", /const experimentModel = stack \? OPENAI_STACK\.reply : testReplyModel\(replyModel, tenant\.settings\);/.test(route));
check("extraction: Terra under the stack", /stack \? OPENAI_STACK\.extraction : testExtractionModel\(extractionModel, tenant\.settings\)/.test(route));
check("capture: the judge and shortener on Terra under the stack", /\.\.\.\(stack && \{ openai: \{ client: openai, judgeModel: OPENAI_STACK\.judge, shortenModel: OPENAI_STACK\.shorten \} \}\)/.test(route));
check("outside the stack the capture gate ignores accepts_offer (ships with the Luna switch)", /shouldJudge\(\{ \.\.\.signals, accepts_offer: stack && signals\.accepts_offer \}\)/.test(route));
check("the facts query is embedded only under the stack (no new call per production turn)", /stack && trimmedMessage && knowledgeEntries\.some\(\(e\) => e\.embedding\)/.test(route));
check("the business facts are offered only under the stack", /stack && shouldJudge\(signals\) && !hesitating && !hasContactDetails\(turnsWithLatest\)/.test(route));
const usageCalls = (route.match(/recordUsage\(/g) ?? []).length;
check("coverage on OpenAI is metered", /callType: "coverage_answered", provider: "openai", model: OPENAI_STACK\.coverage/.test(route), String(usageCalls));

// ── The default since 2026-11-20, and the rollback ──────────────────
check("OpenAI serves every tenant by default", openAIActive(undefined) && useOpenAIStack(undefined, { is_test: false }, undefined) && useOpenAIStack(undefined, null, undefined));
check("MODEL_PROVIDER=anthropic rolls a real tenant back to the previous models", !useOpenAIStack(undefined, { is_test: false }, "anthropic") && !useOpenAIStack(true, { is_test: false }, "anthropic"));
check("under the rollback a test tenant can still ask for the OpenAI stack", useOpenAIStack(true, { is_test: true }, "anthropic"));

// ── The fallback drill: test tenants only ───────────────────────────
let drillLeaks = 0;
for (const settings of realTenants) for (const d of ["retry", "second", "fallback"]) if (testFallbackDrill(d, settings as { is_test?: boolean }) !== null) drillLeaks++;
check(`a real tenant never gets the fallback drill (${realTenants.length * 3} combinations)`, drillLeaks === 0);
check("a test tenant gets only the listed drills", testFallbackDrill("retry", { is_test: true }) === "retry" && testFallbackDrill("all", { is_test: true }) === null);
check("the drill only bends the chain; the chain itself is unchanged", /testFallbackDrill\(fallbackDrill, tenant\.settings\)/.test(route) && /withOpenAIFallback\(chain,/.test(route));

// ── The greeting follows the switch ─────────────────────────────────
const actions = readFileSync(join(__dirname, "..", "app", "dashboard", "business", "actions.ts"), "utf8");
check(
  "the greeting suggestion and translation use Terra unless rolled back",
  (actions.match(/if \(openAIActive\(\)\) \{/g) ?? []).length === 2 &&
    /suggestGreetingOpenAI\(openai, OPENAI_STACK\.greeting/.test(actions) &&
    /translateGreetingOpenAI\(openai, OPENAI_STACK\.greeting/.test(actions)
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exitCode = 1;
} else {
  console.log("\nevery call on OpenAI under the switch, and only on a test tenant");
}
