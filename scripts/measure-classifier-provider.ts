// Can an OpenAI model read the visitor signals as well as Haiku?
//
//   LIVE=1 [MEASURE_ONE=1] DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-classifier-provider.ts | tee docs/classifier-openai-<date>.log
//
// PAID. The six-key prompt (SIGNAL_PROMPT) on the 156 cases in
// scripts/classify-cases.ts, sent exactly as measure-price-key sends them,
// RUNS times (default 2) per OpenAI model (ONLY_MODELS, default gpt-6-luna
// and gpt-6.1-terra). Plus HAIKU_LATENCY calls (default 20) to Haiku from
// this same machine, for latency only: Haiku's accuracy is the logged
// baseline, docs/classifier-price-key-2026-11-12.log (same cases, prompt
// and format, 2 runs).
//
// The bar, decided before the run:
//   - asks_about_price: no false positive, recall 100% (Haiku: 100/100);
//   - the other five keys, on the same 120 cases: precision and recall
//     each within 5 points of Haiku's;
//   - no failed call;
//   - p95 latency at most Haiku's p95 measured here + 300 ms. The call
//     sits on the reply's critical path with a 2,000 ms budget
//     (SIGNAL_BUDGET_MS).

import { CASES, PRICE_CASES, type Case, type Signals } from "./classify-cases";
import { calculateCostUsd } from "../lib/ai-pricing";

const RUNS = Number(process.env.RUNS ?? 2);
const MODELS = (process.env.ONLY_MODELS ?? "gpt-6-luna,gpt-6.1-terra").split(",");
const HAIKU_LATENCY = Number(process.env.HAIKU_LATENCY ?? 20);
const OLD_KEYS = ["accepts_offer", "direct_request", "hesitation", "impatience", "asking_for_information"] as const;
type Key = keyof Signals;

/** Haiku on the six-key prompt, from docs/classifier-price-key-2026-11-12.log ("after" column). */
const HAIKU: Record<string, { p: number; r: number }> = {
  accepts_offer: { p: 92, r: 100 },
  direct_request: { p: 100, r: 100 },
  hesitation: { p: 100, r: 100 },
  impatience: { p: 100, r: 100 },
  asking_for_information: { p: 100, r: 31 },
  asks_about_price: { p: 100, r: 100 },
};

/** Exactly as scripts/measure-price-key.ts sends a case. */
const userText = (c: Case) => (c.prior ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}` : `Visitor's message: ${c.text}`);

type Tally = { tp: number; fp: number; fn: number };
const tally = (): Tally => ({ tp: 0, fp: 0, fn: 0 });
const add = (t: Tally, label: boolean, got: boolean) => {
  if (label && got) t.tp++;
  else if (!label && got) t.fp++;
  else if (label && !got) t.fn++;
};
const prec = (t: Tally) => (t.tp + t.fp ? (100 * t.tp) / (t.tp + t.fp) : 100);
const rec = (t: Tally) => (t.tp + t.fn ? (100 * t.tp) / (t.tp + t.fn) : 100);
const pct = (x: number) => `${Math.round(x)}%`.padStart(4);
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];
const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(`(skipped: paid, ${RUNS * CASES.length} calls per OpenAI model (${MODELS.join(", ")}) + ${HAIKU_LATENCY} Haiku — set LIVE=1 after stating the cost)`);
    return;
  }
  const { openai } = await import("../lib/openai");
  const { anthropic } = await import("../lib/anthropic");
  const { SIGNAL_MODEL, SIGNAL_PROMPT, classifySignalsOpenAI } = await import("../lib/visitor-signals");

  if (process.env.MEASURE_ONE === "1") {
    for (const m of MODELS) {
      const t0 = Date.now();
      const r = await classifySignalsOpenAI(openai, m, userText(CASES[0]));
      console.log(`${m.padEnd(14)} $${(r.tokens ? calculateCostUsd(m, r.tokens) : 0).toFixed(6)}  ${Date.now() - t0} ms  ${JSON.stringify(r.tokens)}  ${JSON.stringify(r.parsed)}`);
    }
    return;
  }

  // Haiku latency, same machine, same moment.
  const haikuMs: number[] = [];
  let haikuCost = 0;
  for (let i = 0; i < HAIKU_LATENCY; i++) {
    const c = CASES[(i * 7) % CASES.length];
    const t0 = Date.now();
    const res = await anthropic.messages.create({ model: SIGNAL_MODEL, max_tokens: 200, system: SIGNAL_PROMPT, messages: [{ role: "user", content: userText(c) }] });
    haikuMs.push(Date.now() - t0);
    haikuCost += calculateCostUsd(SIGNAL_MODEL, { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
  }
  console.log(`Haiku latency, ${HAIKU_LATENCY} calls from here: p50 ${p50(haikuMs)} ms, p95 ${p95(haikuMs)} ms ($${haikuCost.toFixed(4)})`);

  const existing = CASES.filter((c) => !PRICE_CASES.includes(c));
  let total = haikuCost;
  let allPass = true;
  for (const m of MODELS) {
    const keys = new Map<Key, Tally>();
    for (const k of [...OLD_KEYS, "asks_about_price" as const]) keys.set(k, tally());
    const priceByClass = new Map<string, Tally>();
    const mistakes: string[] = [];
    const ms: number[] = [];
    let cost = 0, failures = 0;
    for (let run = 1; run <= RUNS; run++) {
      process.stdout.write(`${m} run ${run}: `);
      for (const c of CASES) {
        const t0 = Date.now();
        let got: Record<string, boolean> = {};
        try {
          const r = await classifySignalsOpenAI(openai, m, userText(c));
          got = r.parsed;
          if (r.tokens) cost += calculateCostUsd(m, r.tokens);
        } catch (e) {
          failures++;
          mistakes.push(`run ${run} FAILED CALL: ${String((e as Error).message).slice(0, 100)}`);
        }
        ms.push(Date.now() - t0);
        if (existing.includes(c)) for (const k of OLD_KEYS) add(keys.get(k)!, c[k], got[k] === true);
        add(keys.get("asks_about_price")!, c.asks_about_price, got.asks_about_price === true);
        const t = priceByClass.get(c.klass) ?? priceByClass.set(c.klass, tally()).get(c.klass)!;
        add(t, c.asks_about_price, got.asks_about_price === true);
        for (const k of [...OLD_KEYS, "asks_about_price" as const]) {
          if (k !== "asks_about_price" && !existing.includes(c)) continue;
          if (c[k] !== (got[k] === true)) mistakes.push(`run ${run} [${c.klass}] ${k}: labelled ${c[k]}, got ${got[k] === true}: ${JSON.stringify(c.text).slice(0, 110)}`);
        }
        process.stdout.write(".");
      }
      process.stdout.write("\n");
    }
    total += cost;

    console.log(`\n── ${m}, ${RUNS} runs: precision / recall against Haiku (five keys on the same ${existing.length} cases; price on all ${CASES.length})`);
    console.log(`${"key".padEnd(24)} Haiku          ${m.padEnd(14)} within bar?`);
    let pass = failures === 0;
    for (const k of [...OLD_KEYS, "asks_about_price" as const]) {
      const t = keys.get(k)!, h = HAIKU[k];
      const ok = k === "asks_about_price" ? t.fp === 0 && rec(t) === 100 : prec(t) >= h.p - 5 && rec(t) >= h.r - 5;
      if (!ok) pass = false;
      console.log(`${k.padEnd(24)} ${pct(h.p)} / ${pct(h.r)}    ${pct(prec(t))} / ${pct(rec(t))}    ${ok ? "yes" : "NO"}   tp=${t.tp} fp=${t.fp} fn=${t.fn}`);
    }
    for (const [klass, t] of Array.from(priceByClass)) console.log(`  price ${klass.padEnd(9)} ${pct(prec(t))} / ${pct(rec(t))}  fp=${t.fp} fn=${t.fn}`);
    const latencyOk = p95(ms) <= p95(haikuMs) + 300;
    if (!latencyOk) pass = false;
    console.log(`latency p50 ${p50(ms)} ms, p95 ${p95(ms)} ms (Haiku here p95 ${p95(haikuMs)} ms; bar ${p95(haikuMs) + 300}) ${latencyOk ? "yes" : "NO"}`);
    console.log(`failed calls ${failures}   cost $${cost.toFixed(4)} ($${(cost / (RUNS * CASES.length)).toFixed(6)} a call)   ${pass ? "PASS" : "FAIL"}`);
    if (mistakes.length) {
      console.log("disagreements (check the LABEL first):");
      for (const x of mistakes) console.log(`   ${x}`);
    }
    if (!pass) allPass = false;
  }
  console.log(`\ntotal cost $${total.toFixed(4)}   ${allPass ? "every model passed" : "NOT every model passed"}`);
  process.exitCode = allPass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
