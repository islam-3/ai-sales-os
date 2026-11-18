// The reply-provider experiment cannot reach a real tenant, and maps faithfully.
//
//   npx tsx scripts/test-reply-provider.ts
//
// FREE: no model call, no database.
//
// replyModel arrives in the request body, which a visitor controls. If it
// worked on a real tenant, anyone could choose which model answers on a
// business's behalf, and an experimental model would be talking to real
// customers. Same gate as skipCapture and includeSignals.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testExtractionModel, testReplyModel, TEST_REPLY_MODELS } from "../lib/test-tenant";
import { toOpenAIExtractionInput, toOpenAIExtractionRequest, transcriptBlocks } from "../lib/lead-extraction";
import { buildLeadExtractionPrompt } from "../lib/lead-language";
import { openAIUsageToTokens, toOpenAIReplyRequest } from "../lib/reply-openai";
import { PRICING } from "../lib/ai-pricing";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ── 1. The gate ──────────────────────────────────────────────────────
console.log("--- a real tenant never gets an experimental reply model ---");
const realTenants: unknown[] = [{}, null, undefined, { is_test: false }, { is_test: "true" }, { is_test: 1 }];
const requests: unknown[] = [...TEST_REPLY_MODELS, "gpt-4o", "claude-sonnet-4-6", "", true, 1, {}, undefined, null];
let leaked = 0;
for (const settings of realTenants) {
  for (const requested of requests) {
    if (testReplyModel(requested, settings as { is_test?: boolean }) !== null) leaked++;
  }
}
check(`no combination on a non-test tenant selects a model (${realTenants.length * requests.length} tried)`, leaked === 0);
for (const model of TEST_REPLY_MODELS) {
  check(`a test tenant that asks for ${model} gets it`, testReplyModel(model, { is_test: true }) === model);
}
check("a test tenant asking for an unlisted model gets the default", testReplyModel("gpt-4o", { is_test: true }) === null);
check("a test tenant that does not ask gets the default", testReplyModel(undefined, { is_test: true }) === null);
for (const model of TEST_REPLY_MODELS) {
  check(`${model} is priced, so its calls are not recorded at $0`, Boolean(PRICING[model]?.input && PRICING[model]?.output));
}

const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8").replace(/\r\n/g, "\n");
check(
  "the route chooses the model through the gate",
  /const experimentModel = testReplyModel\(replyModel, tenant\.settings\);/.test(route)
);
check(
  "and calls OpenAI for the reply only on that branch",
  (route.match(/openAIReply\(/g) ?? []).length === 1 && /if \(experimentModel\) \{\n\s+const reply = await openAIReply\(/.test(route)
);
check("Sonnet stays the default", /const CHAT_MODEL = "claude-sonnet-4-6";/.test(route));

// ── 2. The mapping ───────────────────────────────────────────────────
console.log("\n--- the OpenAI request carries exactly what Sonnet is sent ---");
const blocks = [
  { type: "text" as const, text: "IDENTITY AND KNOWLEDGE", cache_control: { type: "ephemeral" as const } },
  { type: "text" as const, text: "\n\nRETRIEVED" },
  { type: "text" as const, text: "\n\n<state>\nturn 3\n</state>" },
];
const req = toOpenAIReplyRequest(blocks, [
  { role: "assistant", content: "مرحباً!" },
  { role: "user", content: "كم السعر؟" },
]);
check(
  "instructions are the system blocks joined with no added separator",
  req.instructions === "IDENTITY AND KNOWLEDGE\n\nRETRIEVED\n\n<state>\nturn 3\n</state>",
  JSON.stringify(req.instructions)
);
check(
  "messages keep their roles and their exact text",
  JSON.stringify(req.input) === JSON.stringify([
    { role: "assistant", content: "مرحباً!" },
    { role: "user", content: "كم السعر؟" },
  ])
);
let threw = false;
try {
  toOpenAIReplyRequest(blocks, [{ role: "user", content: [{ type: "text", text: "x" }] }]);
} catch {
  threw = true;
}
check("a content-block message fails loudly instead of being dropped", threw);

// ── 3. Usage ─────────────────────────────────────────────────────────
console.log("\n--- usage maps onto our token columns without double counting ---");
const t = openAIUsageToTokens({
  input_tokens: 12000,
  output_tokens: 300,
  input_tokens_details: { cached_tokens: 7000, cache_write_tokens: 4000 },
});
check(
  "input_tokens includes reads and writes, so plain input is what is left",
  t.inputTokens === 1000 && t.cacheReadInputTokens === 7000 && t.cacheWriteInputTokens === 4000 && t.outputTokens === 300,
  JSON.stringify(t)
);
check(
  "no cache details means it is all plain input",
  openAIUsageToTokens({ input_tokens: 500, output_tokens: 10 }).inputTokens === 500
);

// ── 4. Lead extraction on OpenAI ─────────────────────────────────────
console.log("\n--- extraction: a real tenant never gets an experimental model ---");
let extractionLeaked = 0;
for (const settings of realTenants) {
  for (const requested of requests) {
    if (testExtractionModel(requested, settings as { is_test?: boolean }) !== null) extractionLeaked++;
  }
}
check(`no combination on a non-test tenant selects an extraction model (${realTenants.length * requests.length} tried)`, extractionLeaked === 0);
check("a test tenant that asks for gpt-6-luna gets it", testExtractionModel("gpt-6-luna", { is_test: true }) === "gpt-6-luna");
check("a test tenant asking for an unlisted model gets the default", testExtractionModel("gpt-4o", { is_test: true }) === null);
check(
  "the route passes extraction a model only through the gate",
  /testExtractionModel\(extractionModel, tenant\.settings\)/.test(route) && (route.match(/callLeadExtractionOpenAI\(/g) ?? []).length === 1
);
check(
  "and records the provider that actually ran",
  /provider: experimentModel \? "openai" : "anthropic",/.test(route) && /model: experimentModel \?\? LEAD_EXTRACTION_MODEL,/.test(route)
);

console.log("\n--- extraction: OpenAI reads exactly what Sonnet reads ---");
const turns = [
  { role: "assistant", content: "مرحباً!" },
  { role: "user", content: "اسمي أحمد، رقمي ٠٥٤٤٩٨٧٦٥٤٣" },
  { role: "assistant", content: "شكراً أحمد" },
];
const ex = toOpenAIExtractionRequest("Turkish", turns);
check("instructions are the same extraction prompt", ex.instructions === buildLeadExtractionPrompt("Turkish"));
check(
  "one input part per turn, with the same text as the Anthropic blocks",
  JSON.stringify(ex.parts.map((p) => p.text)) === JSON.stringify(transcriptBlocks(turns).map((b) => b.text))
);
// No explicit breakpoint: OpenAI caches the prefix automatically. The
// explicit marker on the last part read the cache 0% of the time.
check("no part carries an explicit cache breakpoint", ex.parts.every((p) => !("prompt_cache_breakpoint" in p)));
const input = toOpenAIExtractionInput(ex);
check(
  "one input message per turn, all from the user, each holding exactly that turn’s text",
  input.length === ex.parts.length && input.every((m, i) => m.role === "user" && m.content.length === 1 && m.content[0].text === ex.parts[i].text)
);
const extractionSrc = readFileSync(join(__dirname, "..", "lib", "lead-extraction.ts"), "utf8");
check(
  "OpenAI's contact digits are normalised exactly like Sonnet's",
  (extractionSrc.match(/extracted: normaliseContactDigits\(JSON\.parse\(jsonText\)\)/g) ?? []).length === 2
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nthe experiment is test-tenant only, and the mapping is faithful");
