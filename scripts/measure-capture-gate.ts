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

const RUNS = Number(process.env.RUNS ?? 2);

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
  const { SIGNAL_MODEL, SIGNAL_PROMPT } = await import("../lib/visitor-signals");
  const existing = new Set(CASES.filter((c) => !PRICE_CASES.includes(c)));

  const gate = { all: t0(), existing: t0() };
  const withoutPrice = { all: t0(), existing: t0() };
  const byClass = new Map<string, Tally>();
  const misses: string[] = [];
  for (let run = 1; run <= RUNS; run++) {
    process.stdout.write(`run ${run}: `);
    for (const c of CASES) {
      const got = await classify(anthropic, SIGNAL_MODEL, SIGNAL_PROMPT, c);
      const full = got.asking_for_information === true || got.direct_request === true || got.asks_about_price === true;
      const old = got.asking_for_information === true || got.direct_request === true;
      const label = c.asking_for_information;
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
  console.log(`\n  per class (six-key gate, all cases):`);
  for (const [k, t] of Array.from(byClass)) console.log(`    ${k.padEnd(9)} ${fmt(t)}`);
  if (misses.length) {
    console.log(`\n  disagreements (check the LABEL first):`);
    for (const m of misses) console.log(`   ${m}`);
  }
  console.log(`\ncall failures: ${failures}   cost: $${cost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
