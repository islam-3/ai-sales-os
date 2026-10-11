// Does a classifier read visitor signals better than the regexes?
//
//   RUNS=3 DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/classify-eval.ts
//
// Nothing is deleted on the strength of an idea. The regexes being
// replaced work on English and are dead everywhere else — measured, not
// assumed — so the bar is: match or beat them on English, and actually
// work on the other five classes. Run more than once, because a single
// pass hid a real defect here before.
//
// Reports precision and recall per signal per class, and prints the
// disagreements so a bad LABEL can be told from a bad prediction.
//
// ── WHAT THE FIRST RUN FOUND, stated plainly ─────────────────────────
// The regexes score ZERO recall on every signal in Arabic, Russian,
// Chinese, Turkish and Spanish. Not degraded - zero. Every control built
// on them was switched off for any visitor not writing English.
//
// But do not read that as "English works and other languages do not".
// Measured against a realistic catalogue, the English picture is:
//
//   "can I see the before and after gallery?"   -> sends       (quotes a title)
//   "can I see photos of your work?"            -> no match    (detected, nothing matched)
//   "do you have a photo of the implants brand?"-> no request  (not even detected)
//
// So the honest summary is that ONLY a visitor who happens to quote an
// entry title close to verbatim ever gets a photo, in any language. The
// feature was barely working at all, not merely failing abroad. Whoever
// reads this next should know which of those two it was.

import { anthropic } from "../lib/anthropic";
import {
  SIGNAL_PROMPT,
  SIGNAL_PROMPT_FOUR_KEY,
  SIGNAL_PROMPT_KEYS,
} from "../lib/visitor-signals";
import { CASES, ORIGINAL_CASES, SIGNAL_KEYS, type Case, type Signals } from "./classify-cases";
import { detectHesitation, detectImpatience } from "../lib/conversation-state";

const MODEL = process.env.CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001";
const RUNS = Number(process.env.RUNS ?? 3);

// The REAL prompt, imported rather than copied, so this cannot drift
// from what production sends. Which variant is measured is chosen by
// SIGNAL_PROMPT_VARIANT, the same switch the route reads.
const PROMPT = SIGNAL_PROMPT;

// Only the keys the live prompt actually asks for. A two-signal prompt
// scored on four would read 0% recall on the two it was never asked
// about, which is a harness fault reported as a model regression.
const SCORED = SIGNAL_KEYS.filter((k) => SIGNAL_PROMPT_KEYS.includes(k));

// ── The paired before/after arm ──────────────────────────────────────
//
// PAIRED=1 also runs the four-key prompt over the SAME cases in the
// SAME run, and reports the four original keys side by side.
//
// Comparing against a logged number from a previous month would not do.
// It was a different case list and possibly a different model build, so
// a drop could be either, and "either" is not a finding. This project
// has twice measured that changing which keys a classifier is asked for
// moves the others — direct_request 100% → 55%, hesitation 95% → 57%,
// both from REMOVING a key. Adding one pulls the same lever.
const PAIRED = process.env.PAIRED === "1";
const FOUR_KEYS = SIGNAL_KEYS.filter((k) => k !== "asking_for_information");

/** The first balanced {...}; the model explains itself after the JSON. */
function firstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("unbalanced JSON object in response");
}

type Prediction = Signals & { failed?: true };

/** Why calls failed, so a harness problem is not read as a model result. */
const FAILURE_REASONS: string[] = [];

async function classify(c: Case, prompt: string = PROMPT): Promise<Prediction> {
  const user = c.prior
    ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}`
    : `Visitor's message: ${c.text}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: prompt,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    // The FIRST balanced {...}, not the whole response. Haiku reliably
    // emits correct JSON and then explains itself underneath, and parsing
    // the lot threw on 36 of 210 calls - every one of which was counted
    // as "no signal" and quietly depressed recall. A harness fault read
    // as a model result is the worst kind of measurement error.
    const parsed = JSON.parse(firstJsonObject(raw)) as Record<string, unknown>;
    return {
      accepts_offer: parsed.accepts_offer === true,
      direct_request: parsed.direct_request === true,
      hesitation: parsed.hesitation === true,
      impatience: parsed.impatience === true,
      asking_for_information: parsed.asking_for_information === true,
    };
  } catch (error) {
    FAILURE_REASONS.push(String((error as Error).message).slice(0, 120));
    // A failure is a wrong answer, not a skipped case: on the critical
    // path this would mean no signal at all, so it must count against.
    return {
      accepts_offer: false,
      direct_request: false,
      hesitation: false,
      impatience: false,
      asking_for_information: false,
      failed: true,
    };
  }
}

/**
 * What the CURRENT regexes say, for the same message.
 *
 * The media half of this comparison is gone: image sending was removed
 * from the chat, so decideMedia no longer exists and accepts_offer and
 * direct_request no longer decide anything. What remains is hesitation
 * and impatience, which is the classifier's whole job now.
 */
function regexBaseline(c: Case): Signals {
  const history = [
    ...(c.prior ? [{ role: "assistant" as const, content: c.prior }] : []),
    { role: "user" as const, content: c.text },
  ];
  return {
    accepts_offer: false,
    direct_request: false,
    hesitation: detectHesitation(history).hesitating,
    impatience: detectImpatience(history).impatient,
    // There is no regex arm for this one, and deliberately no attempt at
    // one. The gate it replaces is a question mark, which scores 0% on
    // prof-clinic's 57 messages because none of them has one — so the
    // honest baseline here is zero, and a word list would be the
    // detector this project already measured at zero recall in five of
    // six scripts.
    asking_for_information: false,
  };
}

type Tally = { tp: number; fp: number; fn: number; tn: number };
const empty = (): Tally => ({ tp: 0, fp: 0, fn: 0, tn: 0 });

function score(t: Tally) {
  const precision = t.tp + t.fp === 0 ? 1 : t.tp / (t.tp + t.fp);
  const recall = t.tp + t.fn === 0 ? 1 : t.tp / (t.tp + t.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function add(t: Tally, expected: boolean, got: boolean) {
  if (expected && got) t.tp++;
  else if (!expected && got) t.fp++;
  else if (expected && !got) t.fn++;
  else t.tn++;
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

async function main() {
  const classes = Array.from(new Set(CASES.map((c) => c.klass)));
  const original = ORIGINAL_CASES;
  const isOriginal = new Set(ORIGINAL_CASES);

  const calls = CASES.length * RUNS * (PAIRED ? 2 : 1);
  console.log(`model: ${MODEL}   runs: ${RUNS}   cases: ${CASES.length}`);
  console.log(
    `${calls} model calls${PAIRED ? ` (paired: ${CASES.length * RUNS} five-key + ${CASES.length * RUNS} four-key)` : ""}\n`
  );

  // ── the regexes, measured once: they are deterministic ──────────────
  console.log("═".repeat(72));
  console.log("  CURRENT REGEXES");
  console.log("═".repeat(72));
  const regexBySignal = new Map<string, Map<string, Tally>>();
  SCORED.forEach((k) => regexBySignal.set(k, new Map(classes.map((c) => [c, empty()]))));
  for (const c of CASES) {
    const got = regexBaseline(c);
    SCORED.forEach((k) => add(regexBySignal.get(k)!.get(c.klass)!, c[k], got[k]));
  }
  report(regexBySignal, classes);

  // ── the classifier, several times ───────────────────────────────────
  const modelBySignal = new Map<string, Map<string, Tally>>();
  SCORED.forEach((k) => modelBySignal.set(k, new Map(classes.map((c) => [c, empty()]))));
  // The four original keys on the ORIGINAL cases only, under each
  // prompt. Same cases, same labels, so a difference is the key.
  const fiveKeyOnOriginal = new Map<string, Map<string, Tally>>();
  const fourKeyOnOriginal = new Map<string, Map<string, Tally>>();
  for (const m of [fiveKeyOnOriginal, fourKeyOnOriginal]) {
    FOUR_KEYS.forEach((k) => m.set(k, new Map(classes.map((c) => [c, empty()]))));
  }
  const disagreements: string[] = [];
  // Separated: a false positive on this key costs a judge call and puts
  // a non-question on an owner's dashboard. A false negative costs a row
  // nobody sees. They are not the same mistake and are not listed
  // together.
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  let failures = 0;

  for (let run = 1; run <= RUNS; run++) {
    process.stdout.write(`\nrun ${run}/${RUNS} (5-key): `);
    for (const c of CASES) {
      const got = await classify(c);
      if (got.failed) failures++;
      SCORED.forEach((k) => {
        add(modelBySignal.get(k)!.get(c.klass)!, c[k], got[k]);
        if (isOriginal.has(c) && FOUR_KEYS.includes(k as never)) {
          add(fiveKeyOnOriginal.get(k)!.get(c.klass)!, c[k], got[k]);
        }
        if (c[k] !== got[k] && run === 1) {
          disagreements.push(
            `  [${c.klass}] ${k}: labelled ${c[k]}, model said ${got[k]}\n      "${c.text}"`
          );
        }
      });
      const key = "asking_for_information" as const;
      if (!c[key] && got[key]) {
        falsePositives.push(`  [${c.klass}] run ${run}: "${c.text}"${c.prior ? `   (after: "${c.prior}")` : ""}`);
      }
      if (c[key] && !got[key]) {
        falseNegatives.push(`  [${c.klass}] run ${run}: "${c.text}"`);
      }
      process.stdout.write(".");
    }

    if (PAIRED) {
      process.stdout.write(`\nrun ${run}/${RUNS} (4-key): `);
      for (const c of original) {
        const got = await classify(c, SIGNAL_PROMPT_FOUR_KEY);
        if (got.failed) failures++;
        FOUR_KEYS.forEach((k) => add(fourKeyOnOriginal.get(k)!.get(c.klass)!, c[k], got[k]));
        process.stdout.write(".");
      }
    }
  }

  console.log(`\n\n${"═".repeat(72)}`);
  console.log(`  CLASSIFIER (${MODEL}, ${RUNS} runs, ${failures} call failures)`);
  if (FAILURE_REASONS.length) {
    const byReason = new Map<string, number>();
    FAILURE_REASONS.forEach((r) => byReason.set(r, (byReason.get(r) ?? 0) + 1));
    Array.from(byReason.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([r, n]) => console.log(`    ${n}x  ${r}`));
  }
  console.log("═".repeat(72));
  report(modelBySignal, classes);

  // ── The new key, by the cost of each mistake ────────────────────────
  console.log(`\n${"─".repeat(72)}`);
  console.log("  asking_for_information — the two mistakes are not equal");
  console.log("─".repeat(72));
  console.log(
    `  FALSE POSITIVES  ${falsePositives.length}/${RUNS * CASES.length} calls` +
      `   each one is a judge call AND a dashboard row`
  );
  falsePositives.forEach((f) => console.log(f));
  console.log(
    `\n  false negatives  ${falseNegatives.length}/${RUNS * CASES.length} calls` +
      `   each one is a question nobody sees`
  );
  falseNegatives.forEach((f) => console.log(f));

  // ── The four original keys, before and after ────────────────────────
  if (PAIRED) {
    console.log(`\n${"═".repeat(72)}`);
    console.log(`  THE FOUR ORIGINAL KEYS — four-key prompt vs five-key prompt`);
    console.log(`  Same ${original.length} cases, same labels, same run.`);
    console.log("═".repeat(72));

    let regressions = 0;
    for (const key of FOUR_KEYS) {
      const before = totalOf(fourKeyOnOriginal.get(key)!, classes);
      const after = totalOf(fiveKeyOnOriginal.get(key)!, classes);
      const b = score(before);
      const a = score(after);
      const dP = a.precision - b.precision;
      const dR = a.recall - b.recall;
      // A whole point is noise at this sample size; five is not.
      const bad = dP < -0.05 || dR < -0.05;
      if (bad) regressions++;
      console.log(
        `\n  ${key}` +
          `\n    precision  ${pct(b.precision)} -> ${pct(a.precision)}  ${delta(dP)}` +
          `\n    recall     ${pct(b.recall)} -> ${pct(a.recall)}  ${delta(dR)}` +
          (bad ? "    <-- REGRESSION" : "")
      );
      // Per class too: the two-signal experiment looked survivable
      // overall and had Arabic hesitation precision at 35%.
      for (const k of classes) {
        const cb = score(fourKeyOnOriginal.get(key)!.get(k)!);
        const ca = score(fiveKeyOnOriginal.get(key)!.get(k)!);
        const worse = ca.precision - cb.precision < -0.05 || ca.recall - cb.recall < -0.05;
        console.log(
          `      ${k.padEnd(9)} P ${pct(cb.precision).padStart(4)} -> ${pct(ca.precision).padStart(4)}` +
            `   R ${pct(cb.recall).padStart(4)} -> ${pct(ca.recall).padStart(4)}` +
            (worse ? "   <-- worse" : "")
        );
      }
    }

    console.log(`\n${"═".repeat(72)}`);
    if (regressions === 0 && falsePositives.length === 0) {
      console.log("  No regression on the four original keys, no false positives on the new one.");
    } else {
      console.log(
        `  ${regressions} regression(s) on the original keys, ` +
          `${falsePositives.length} false positive(s) on the new key.` +
          `\n  Per the standing rule, a regression means rethink, not ship.`
      );
    }
    console.log("═".repeat(72));
  } else {
    console.log(
      `\n  PAIRED=1 was not set, so the four original keys have no "before" arm` +
        `\n  in this run and nothing above says whether adding the key cost them` +
        `\n  anything. That is the question, so run it paired.`
    );
  }

  if (disagreements.length) {
    console.log(`\n${"─".repeat(72)}`);
    console.log(`  DISAGREEMENTS ON RUN 1 (${disagreements.length}) — check the LABEL first`);
    console.log("─".repeat(72));
    disagreements.forEach((d) => console.log(d));
  }
}

const delta = (d: number) =>
  d === 0 ? "(no change)" : `(${d > 0 ? "+" : ""}${(d * 100).toFixed(0)} pts)`;

function totalOf(perClass: Map<string, Tally>, classes: string[]): Tally {
  const total = empty();
  classes.forEach((k) => {
    const t = perClass.get(k)!;
    total.tp += t.tp;
    total.fp += t.fp;
    total.fn += t.fn;
    total.tn += t.tn;
  });
  return total;
}

function report(bySignal: Map<string, Map<string, Tally>>, classes: string[]) {
  for (const key of SCORED) {
    const perClass = bySignal.get(key)!;
    const total = empty();
    classes.forEach((k) => {
      const t = perClass.get(k)!;
      total.tp += t.tp;
      total.fp += t.fp;
      total.fn += t.fn;
      total.tn += t.tn;
    });
    const s = score(total);
    console.log(`\n${key}  —  precision ${pct(s.precision)}  recall ${pct(s.recall)}  F1 ${pct(s.f1)}`);
    classes.forEach((k) => {
      const t = perClass.get(k)!;
      const c = score(t);
      console.log(
        `    ${k.padEnd(9)} P ${pct(c.precision).padStart(4)}  R ${pct(c.recall).padStart(4)}` +
          `   tp=${t.tp} fp=${t.fp} fn=${t.fn}`
      );
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
