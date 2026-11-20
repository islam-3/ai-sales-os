// Resilience inside OpenAI: retry, then the second model, then the safe fallback.
//
//   npx tsx scripts/test-openai-fallback.ts
//
// FREE. The model call is a fake that fails on cue, and the clock and
// sleep are fakes, so no request is made and nothing waits.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AllModelsFailed, withOpenAIFallback } from "../lib/openai-fallback";
import { REPLY_MODELS, replyModelChain } from "../lib/reply-openai";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/** An error shaped like the SDK's: a status and a message. */
const apiError = (status: number, message = `status ${status}`) => Object.assign(new Error(message), { status });

/** A fake call: each model answers from its own script of outcomes, in order. */
function fake(script: Record<string, (Error | string)[]>) {
  const calls: string[] = [];
  const call = async (model: string) => {
    calls.push(model);
    const next = script[model]?.shift();
    if (next === undefined) throw new Error(`fake: no outcome left for ${model}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { call, calls };
}
const fast = { sleep: async () => {}, now: () => 0 };

async function main() {
  {
    const f = fake({ a: ["hello"] });
    const r = await withOpenAIFallback(["a", "b"], f.call, fast);
    check("a working first model answers, once, and nothing else is called", r.value === "hello" && r.model === "a" && f.calls.join() === "a");
  }
  {
    const f = fake({ a: [apiError(429), "second try"] });
    const r = await withOpenAIFallback(["a", "b"], f.call, fast);
    check("rate limited: the SAME model is retried once and answers", r.model === "a" && f.calls.join() === "a,a" && r.attempts.length === 2);
  }
  {
    const f = fake({ a: [apiError(503), apiError(503)], b: ["from b"] });
    const r = await withOpenAIFallback(["a", "b"], f.call, fast);
    check("still failing after the retry: the second model answers", r.model === "b" && r.value === "from b" && f.calls.join() === "a,a,b");
  }
  {
    const f = fake({ a: [new Error("Request timed out."), "after the timeout"] });
    const r = await withOpenAIFallback(["a", "b"], f.call, fast);
    check("a timeout counts as worth retrying on the same model", r.model === "a" && f.calls.join() === "a,a", f.calls.join());
  }
  {
    const f = fake({ a: [apiError(400, "invalid model")], b: ["from b"] });
    const r = await withOpenAIFallback(["a", "b"], f.call, fast);
    check("a bad request is NOT retried: straight to the second model", r.model === "b" && f.calls.join() === "a,b");
  }
  {
    const f = fake({ a: [apiError(429, "You exceeded your current quota: insufficient_quota")], b: [apiError(429, "insufficient_quota")] });
    let thrown: unknown;
    try { await withOpenAIFallback(["a", "b"], f.call, fast); } catch (e) { thrown = e; }
    check("no credit is not retried on the same model, and when both fail it throws", thrown instanceof AllModelsFailed && f.calls.join() === "a,b");
  }
  {
    const f = fake({ a: [apiError(500), apiError(500)], b: [apiError(500)] });
    let thrown: unknown;
    try { await withOpenAIFallback(["a", "b"], f.call, fast); } catch (e) { thrown = e; }
    const attempts = thrown instanceof AllModelsFailed ? thrown.attempts : [];
    check(
      "every model failing throws, bounded: two attempts on the first, one on the second",
      thrown instanceof AllModelsFailed && f.calls.join() === "a,a,b" && attempts.every((a) => !a.ok)
    );
  }
  {
    let slept = 0;
    const f = fake({ a: [apiError(429), "ok"] });
    await withOpenAIFallback(["a", "b"], f.call, { sleep: async (ms) => { slept += ms; }, now: () => 0, retryDelayMs: 400 });
    check("it waits before the retry, and only then", slept === 400, String(slept));
  }

  // The chain itself: OpenAI only, by decision.
  check("the reply chain starts with the chosen model and tries the other next", replyModelChain("gpt-6.1-terra").join() === "gpt-6.1-terra,gpt-6-luna" && replyModelChain("gpt-6-luna").join() === "gpt-6-luna,gpt-6.1-terra");
  check("no Claude model is anywhere in the reply chain", !REPLY_MODELS.some((m) => /claude|sonnet|haiku|opus/i.test(m)));

  // Wiring, read from the source.
  const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8");
  const replySrc = readFileSync(join(__dirname, "..", "lib", "reply-openai.ts"), "utf8");
  // The chain is built first, so the test-only drill can bend it
  // (testFallbackDrill); on a real tenant it is replyModelChain unchanged.
  check(
    "the route's OpenAI reply goes through withOpenAIFallback over replyModelChain",
    /const chain = replyModelChain\(experimentModel\)\.map\(/.test(route) && /withOpenAIFallback\(chain,/.test(route)
  );
  check("usage is recorded against the model that actually answered", /model: answeredBy,/.test(route));
  check("the SDK's own silent retries are off on the reply call", /\{ maxRetries: 0[ ,]/.test(replySrc));
  check("a final failure still reaches the safe fallback (handleChat's catch serves degradedReply)", /catch \(error\) \{[\s\S]{0,900}degradedReply\(body\)/.test(route));

  if (bad > 0) {
    console.log(`\n${bad} failed`);
    process.exitCode = 1;
    return;
  }
  console.log("\nretry, then the second OpenAI model, then the safe fallback");
}

main();
