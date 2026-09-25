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
import { CASES, SIGNAL_KEYS, type Case, type Signals } from "./classify-cases";
import { decideMedia } from "../lib/chat-media";
import { detectHesitation, detectImpatience } from "../lib/conversation-state";

const MODEL = process.env.CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001";
const RUNS = Number(process.env.RUNS ?? 3);

const PROMPT = `You read ONE message from a visitor to a business's chat and report what it does.

Reply with ONLY this JSON object, no other text:
{"accepts_offer": bool, "direct_request": bool, "hesitation": bool, "impatience": bool}

accepts_offer — the visitor is taking up something the assistant JUST offered to show them. Only true if the assistant's previous message actually offered to show something. "Yes" answering "what is your name?" is not this.
direct_request — the visitor is asking, unprompted, to be shown something: photos, results, examples. A visitor offering to send THEIR OWN photo is not this; they are sending, not asking to see.
hesitation — the visitor is stepping back: needs to think, wants to consult someone, is not ready to decide.
impatience — the visitor is frustrated: repeating a question, or saying they were not answered.

The message may be in any language. Judge what it does, not what words it uses. Several can be true; usually none are.`;

/** The first balanced {...} in a response, ignoring anything around it. */
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

async function classify(c: Case): Promise<Prediction> {
  const user = c.prior
    ? `Assistant's previous message: ${c.prior}\n\nVisitor's message: ${c.text}`
    : `Visitor's message: ${c.text}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: PROMPT,
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
    };
  } catch (error) {
    FAILURE_REASONS.push(String((error as Error).message).slice(0, 120));
    // A failure is a wrong answer, not a skipped case: on the critical
    // path this would mean no signal at all, so it must count against.
    return { accepts_offer: false, direct_request: false, hesitation: false, impatience: false, failed: true };
  }
}

/** What the CURRENT regexes say, for the same message. */
function regexBaseline(c: Case): Signals {
  const history = [
    ...(c.prior ? [{ role: "assistant" as const, content: c.prior }] : []),
    { role: "user" as const, content: c.text },
  ];
  const catalogue = [
    { title: "Before and after gallery", content: "photos of previous cases", media: [{ url: "x", type: "image/jpeg" }] },
  ];
  const decision = decideMedia(history, catalogue, new Set());
  return {
    // The regex layer does not separate these two: both end in "send a
    // photo". Scored against each label separately, which is generous to
    // it rather than harsh.
    accepts_offer: decision.send && decision.reason === "accepted-offer",
    direct_request: decision.send && decision.reason === "direct-request",
    hesitation: detectHesitation(history).hesitating,
    impatience: detectImpatience(history).impatient,
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

  console.log(`model: ${MODEL}   runs: ${RUNS}   cases: ${CASES.length}\n`);

  // ── the regexes, measured once: they are deterministic ──────────────
  console.log("═".repeat(72));
  console.log("  CURRENT REGEXES");
  console.log("═".repeat(72));
  const regexBySignal = new Map<string, Map<string, Tally>>();
  SIGNAL_KEYS.forEach((k) => regexBySignal.set(k, new Map(classes.map((c) => [c, empty()]))));
  for (const c of CASES) {
    const got = regexBaseline(c);
    SIGNAL_KEYS.forEach((k) => add(regexBySignal.get(k)!.get(c.klass)!, c[k], got[k]));
  }
  report(regexBySignal, classes);

  // ── the classifier, several times ───────────────────────────────────
  const modelBySignal = new Map<string, Map<string, Tally>>();
  SIGNAL_KEYS.forEach((k) => modelBySignal.set(k, new Map(classes.map((c) => [c, empty()]))));
  const disagreements: string[] = [];
  let failures = 0;

  for (let run = 1; run <= RUNS; run++) {
    process.stdout.write(`\nrun ${run}/${RUNS}: `);
    for (const c of CASES) {
      const got = await classify(c);
      if (got.failed) failures++;
      SIGNAL_KEYS.forEach((k) => {
        add(modelBySignal.get(k)!.get(c.klass)!, c[k], got[k]);
        if (c[k] !== got[k] && run === 1) {
          disagreements.push(
            `  [${c.klass}] ${k}: labelled ${c[k]}, model said ${got[k]}\n      "${c.text}"`
          );
        }
      });
      process.stdout.write(".");
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

  if (disagreements.length) {
    console.log(`\n${"─".repeat(72)}`);
    console.log(`  DISAGREEMENTS ON RUN 1 (${disagreements.length}) — check the LABEL first`);
    console.log("─".repeat(72));
    disagreements.forEach((d) => console.log(d));
  }
}

function report(bySignal: Map<string, Map<string, Tally>>, classes: string[]) {
  for (const key of SIGNAL_KEYS) {
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
