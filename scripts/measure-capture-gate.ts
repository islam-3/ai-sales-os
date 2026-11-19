// The "no answer yet" capture gate under the six-key classifier.
//
//   LIVE=1 DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-capture-gate.ts | tee docs/capture-gate-<date>.log
//
// PAID, Haiku: the six-key prompt on 156 cases x 2 runs = 312 calls.
// $0.22 at $0.00072 a call, the average measured over Phase 0's 552 real
// calls with the same prompt and cases (docs/classifier-price-key-*).
//
// The gate is shouldJudge (lib/capture-unanswered.ts):
//   asking_for_information || direct_request || asks_about_price
// scored against the asking_for_information LABEL, which is what the
// "no answer yet" list exists to catch. Compared with the figure of
// record for the five-key gate (asking_for_information || direct_request):
// precision 100%, recall 97.7% on 120 cases (docs/HANDOFF.md §6.2, from
// docs/classifier-five-key-2026-10-11.log). The same 120 cases are
// reported separately for that comparison, and the gate WITHOUT the
// price key is scored in the same run to show what it adds.

import type Anthropic from "@anthropic-ai/sdk";
import { CASES, PRICE_CASES, type Case } from "./classify-cases";
import { shouldJudge } from "../lib/capture-gate";

const RUNS = Number(process.env.RUNS ?? 2);
// CLASSIFIER_PROVIDER=openai scores the gate on classifySignalsOpenAI
// (CLASSIFIER_MODEL, default gpt-6-luna) with the same prompt and input.
// Bar for that arm, set before its first run (2026-11-19): gate precision
// and recall each within 5 points of Haiku's gate (100% / 100% on 156,
// docs/capture-gate-2026-11-12.log), and no failed call. From 2026-11-19 the
// bar applies to the CURRENT gate (shouldJudge, which skips an accepted
// offer unless it asks the price); the gate before that is scored in the
// same run, side by side.
const OPENAI = process.env.CLASSIFIER_PROVIDER === "openai";
const OPENAI_MODEL = process.env.CLASSIFIER_MODEL ?? "gpt-6-luna";

function firstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) return "{}";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return "{}";
}

let cost = 0, failures = 0;

async function classify(client: Anthropic, model: string, prompt: string, c: Case): Promise<Record<string, boolean>> {
  const user = c.prior ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}` : `Visitor's message: ${c.text}`;
  try {
    const res = await client.messages.create({ model, max_tokens: 200, system: prompt, messages: [{ role: "user", content: user }] });
    cost += (res.usage.input_tokens * 1 + res.usage.output_tokens * 5) / 1e6;
    const block = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(firstJsonObject(block?.type === "text" ? block.text : "")) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v === true]));
  } catch {
    failures++;
    return {};
  }
}

type Tally = { tp: number; fp: number; fn: number };
const t0 = (): Tally => ({ tp: 0, fp: 0, fn: 0 });
const add = (t: Tally, label: boolean, got: boolean) => {
  if (label && got) t.tp++;
  else if (!label && got) t.fp++;
  else if (label && !got) t.fn++;
};
const fmt = (t: Tally) =>
  `precision ${(100 * (t.tp + t.fp ? t.tp / (t.tp + t.fp) : 1)).toFixed(1)}%  recall ${(100 * (t.tp + t.fn ? t.tp / (t.tp + t.fn) : 1)).toFixed(1)}%  (tp=${t.tp} fp=${t.fp} fn=${t.fn})`;

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(`(skipped: ${CASES.length * RUNS} Haiku calls, about $0.22 — set LIVE=1 to run it, after stating the cost)`);
    process.exit(0);
  }
  const { anthropic } = await import("../lib/anthropic");
  const { SIGNAL_MODEL, SIGNAL_PROMPT, classifySignalsOpenAI } = await import("../lib/visitor-signals");
  const { openai } = await import("../lib/openai");
  const { calculateCostUsd } = await import("../lib/ai-pricing");
  const classifyAny = async (c: Case): Promise<Record<string, boolean>> => {
    if (!OPENAI) return classify(anthropic, SIGNAL_MODEL, SIGNAL_PROMPT, c);
    const user = c.prior ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}` : `Visitor's message: ${c.text}`;
    try {
      const r = await classifySignalsOpenAI(openai, OPENAI_MODEL, user);
      if (r.tokens) cost += calculateCostUsd(OPENAI_MODEL, r.tokens);
      return r.parsed;
    } catch {
      failures++;
      return {};
    }
  };
  if (process.env.MEASURE_ONE === "1") {
    await classifyAny(CASES[0]);
    console.log(`one call on ${OPENAI ? OPENAI_MODEL : SIGNAL_MODEL}: ${cost.toFixed(6)}, failures ${failures}`);
    return;
  }
  console.log(`classifier: ${OPENAI ? `${OPENAI_MODEL} (OpenAI)` : `${SIGNAL_MODEL} (Anthropic)`}`);
  const existing = new Set(CASES.filter((c) => !PRICE_CASES.includes(c)));

  const gate = { all: t0(), existing: t0() };
  const withoutPrice = { all: t0(), existing: t0() };
  const current = { all: t0(), existing: t0() };
  const currentMisses: string[] = [];
  const byClass = new Map<string, Tally>();
  const misses: string[] = [];
  for (let run = 1; run <= RUNS; run++) {
    process.stdout.write(`run ${run}: `);
    for (const c of CASES) {
      const got = await classifyAny(c);
      const full = got.asking_for_information === true || got.direct_request === true || got.asks_about_price === true;
      const old = got.asking_for_information === true || got.direct_request === true;
      const label = c.asking_for_information;
      const now = shouldJudge({
        asking_for_information: got.asking_for_information === true,
        direct_request: got.direct_request === true,
        asks_about_price: got.asks_about_price === true,
        accepts_offer: got.accepts_offer === true,
      });
      add(current.all, label, now);
      if (existing.has(c)) add(current.existing, label, now);
      if (label !== now) currentMisses.push(`run ${run} [${c.klass}] labelled ${label}, current gate ${now}: ${JSON.stringify(c.text)}`);
      add(gate.all, label, full);
      add(withoutPrice.all, label, old);
      if (existing.has(c)) {
        add(gate.existing, label, full);
        add(withoutPrice.existing, label, old);
      }
      add(byClass.get(c.klass) ?? byClass.set(c.klass, t0()).get(c.klass)!, label, full);
      if (label !== full) misses.push(`run ${run} [${c.klass}] labelled ${label}, gate ${full}: ${JSON.stringify(c.text)}`);
      process.stdout.write(".");
    }
    process.stdout.write("\n");
  }

  console.log(`\n── capture gate, six-key classifier, ${RUNS} runs, against the asking_for_information label`);
  console.log(`  figure of record, five-key gate (2026-10-11): precision 100%  recall 97.7%  (120 cases)`);
  console.log(`  six-key gate, same 120 cases:                ${fmt(gate.existing)}`);
  console.log(`  six-key gate, all ${CASES.length} cases:               ${fmt(gate.all)}`);
  console.log(`  same run WITHOUT asks_about_price, 120:       ${fmt(withoutPrice.existing)}`);
  console.log(`  same run WITHOUT asks_about_price, ${CASES.length}:       ${fmt(withoutPrice.all)}`);
  console.log(`  CURRENT gate (skips an accepted offer unless it asks the price), 120: ${fmt(current.existing)}`);
  console.log(`  CURRENT gate, all ${CASES.length}:                ${fmt(current.all)}`);
  if (currentMisses.length) {
    console.log(`\n  current gate disagreements:`);
    for (const m of currentMisses) console.log(`   ${m}`);
  }
  console.log(`\n  per class (six-key gate, all cases):`);
  for (const [k, t] of Array.from(byClass)) console.log(`    ${k.padEnd(9)} ${fmt(t)}`);
  if (misses.length) {
    console.log(`\n  disagreements (check the LABEL first):`);
    for (const m of misses) console.log(`   ${m}`);
  }
  console.log(`\ncall failures: ${failures}   cost: ${cost.toFixed(4)}`);
  if (OPENAI) {
    const p = current.all.tp + current.all.fp ? (100 * current.all.tp) / (current.all.tp + current.all.fp) : 100;
    const r = current.all.tp + current.all.fn ? (100 * current.all.tp) / (current.all.tp + current.all.fn) : 100;
    const pass = p >= 95 && r >= 95 && failures === 0;
    console.log(pass ? "PASS: the current gate is within 5 points of Haiku's, no failed call" : `FAIL: gate precision ${p.toFixed(1)}%, recall ${r.toFixed(1)}%, ${failures} failed call(s)`);
    process.exitCode = pass ? 0 : 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
