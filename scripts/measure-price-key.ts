// Does a sixth classifier key, asks_about_price, work without moving the other five?
//
//   LIVE=1 DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-price-key.ts | tee docs/classifier-price-key-<date>.log
//
// PAID, Haiku. 2 runs x (120 existing cases on the current five-key
// prompt + 156 cases on the new six-key prompt) = 552 calls, about $0.24.
//
// The bar, decided before the run:
//   - asks_about_price: no false positive in any run;
//   - the existing five keys: no drop in precision on the SAME 120 cases
//     between the two prompts.
// This project has measured key changes moving the other keys twice
// before (docs/classifier-two-signal-2026-09-30.log,
// docs/classifier-five-key-2026-10-11.log), so it is checked, not assumed.

import type Anthropic from "@anthropic-ai/sdk";
import { CASES, PRICE_CASES, type Case, type Signals } from "./classify-cases";

const RUNS = Number(process.env.RUNS ?? 2);
const OLD_KEYS = ["accepts_offer", "direct_request", "hesitation", "impatience", "asking_for_information"] as const;
type Key = keyof Signals;

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

let cost = 0;
let failures = 0;

/** Exactly as scripts/classify-eval.ts sends a case. */
async function classify(client: Anthropic, model: string, c: Case, prompt: string): Promise<Partial<Record<Key, boolean>>> {
  const user = c.prior
    ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}`
    : `Visitor's message: ${c.text}`;
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      system: prompt,
      messages: [{ role: "user", content: user }],
    });
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
const tally = () => ({ tp: 0, fp: 0, fn: 0 });
const add = (t: Tally, label: boolean, got: boolean) => {
  if (label && got) t.tp++;
  else if (!label && got) t.fp++;
  else if (label && !got) t.fn++;
};
const prec = (t: Tally) => (t.tp + t.fp ? t.tp / (t.tp + t.fp) : 1);
const rec = (t: Tally) => (t.tp + t.fn ? t.tp / (t.tp + t.fn) : 1);
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

async function main() {
  const existing = CASES.filter((c) => !PRICE_CASES.includes(c));
  if (process.env.LIVE !== "1") {
    console.log(`(skipped: ${RUNS * (existing.length + CASES.length)} Haiku calls, about $0.24 — set LIVE=1 to run it, after stating the cost)`);
    process.exit(0);
  }
  // Loaded only now: this module constructs the model and database
  // clients, which a closed LIVE gate must not do.
  const { anthropic } = await import("../lib/anthropic");
  const { SIGNAL_MODEL, SIGNAL_PROMPT, SIGNAL_PROMPT_FIVE_KEY } = await import("../lib/visitor-signals");
  console.log(`model ${SIGNAL_MODEL}, ${RUNS} runs; before: five-key prompt on ${existing.length} existing cases; after: six-key prompt on ${CASES.length} cases`);

  const before = new Map<Key, Tally>(), after = new Map<Key, Tally>();
  const priceByClass = new Map<string, Tally>();
  const priceMistakes: string[] = [];
  for (const k of OLD_KEYS) { before.set(k, tally()); after.set(k, tally()); }

  for (let run = 1; run <= RUNS; run++) {
    process.stdout.write(`run ${run}: `);
    for (const c of existing) {
      const got = await classify(anthropic, SIGNAL_MODEL, c, SIGNAL_PROMPT_FIVE_KEY);
      for (const k of OLD_KEYS) add(before.get(k)!, c[k], got[k] === true);
      process.stdout.write(".");
    }
    for (const c of CASES) {
      const got = await classify(anthropic, SIGNAL_MODEL, c, SIGNAL_PROMPT);
      // The old keys are compared on the same 120 cases only.
      if (existing.includes(c)) for (const k of OLD_KEYS) add(after.get(k)!, c[k], got[k] === true);
      const t = priceByClass.get(c.klass) ?? priceByClass.set(c.klass, tally()).get(c.klass)!;
      add(t, c.asks_about_price, got.asks_about_price === true);
      if (c.asks_about_price !== (got.asks_about_price === true)) {
        priceMistakes.push(`run ${run} [${c.klass}] labelled ${c.asks_about_price}, got ${got.asks_about_price === true}: ${JSON.stringify(c.text)}`);
      }
      process.stdout.write("+");
    }
    process.stdout.write("\n");
  }

  console.log(`\n── existing five keys, same ${existing.length} cases, ${RUNS} runs: precision / recall`);
  console.log(`${"key".padEnd(24)} before (5-key)   after (6-key)`);
  let precisionDrop = 0;
  for (const k of OLD_KEYS) {
    const b = before.get(k)!, a = after.get(k)!;
    if (prec(a) < prec(b)) precisionDrop++;
    console.log(`${k.padEnd(24)} ${pct(prec(b))} / ${pct(rec(b))}      ${pct(prec(a))} / ${pct(rec(a))}${prec(a) < prec(b) ? "   <-- precision dropped" : ""}`);
  }

  console.log(`\n── asks_about_price, ${CASES.length} cases (${CASES.filter((c) => c.asks_about_price).length} labelled true), ${RUNS} runs`);
  const all = tally();
  for (const [klass, t] of Array.from(priceByClass)) {
    all.tp += t.tp; all.fp += t.fp; all.fn += t.fn;
    console.log(`  ${klass.padEnd(9)} precision ${pct(prec(t))}  recall ${pct(rec(t))}   tp=${t.tp} fp=${t.fp} fn=${t.fn}`);
  }
  console.log(`  ${"ALL".padEnd(9)} precision ${pct(prec(all))}  recall ${pct(rec(all))}   tp=${all.tp} fp=${all.fp} fn=${all.fn}`);
  if (priceMistakes.length) {
    console.log(`\n  disagreements (check the LABEL first):`);
    for (const m of priceMistakes) console.log(`   ${m}`);
  }

  console.log(`\ncall failures: ${failures}   cost: $${cost.toFixed(4)}`);
  const pass = all.fp === 0 && precisionDrop === 0 && failures === 0;
  console.log(pass ? "\nPASS: no false price positives, no precision drop on the existing keys" : `\nFAIL: ${all.fp} false price positive(s), ${precisionDrop} key(s) lost precision, ${failures} failed call(s)`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
