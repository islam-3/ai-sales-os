// What the visitor's message is doing, read by a model rather than by
// keyword lists.
//
// The lists it replaces scored ZERO recall on every signal in Arabic,
// Russian, Chinese, Turkish and Spanish — not degraded, zero — so every
// control built on them was switched off for any visitor not writing
// English. Measured over 70 labelled cases, three runs: this reaches
// 100% recall on all six failure classes, and 95-100% precision.
// See scripts/classify-eval.ts and docs/classifier-measurement-*.log.
//
// Its job is now hesitation and impatience only. Nothing else reads a
// signal from here: image sending is gone, and with it the only consumer
// of accepts_offer and direct_request. Those two keys stay in the PROMPT
// regardless, and the note above SIGNAL_PROMPT records the two separate
// measurements that say why removing them is not free.
//
// Hesitation and impatience have as many forms as there are ways to be
// uncertain or annoyed, which is what a model is actually needed for.
//
// ── The budget ───────────────────────────────────────────────────────
// This sits before the reply, so a visitor waits for it. It is started
// as early as possible so it overlaps the database work that has to
// happen anyway, and abandoned once the budget is spent. A turn without
// signals behaves exactly as every non-English turn behaved until now,
// which is to say: the assistant still answers, it is just less sharp.
// That is a far better trade than a visitor watching a spinner.

import { anthropic } from "./anthropic";

export type VisitorSignals = {
  /**
   * Asking, unprompted, to be shown something.
   *
   * NOTHING READS THIS ANY MORE. The direct-request route was removed
   * after every photo bug in testing came from it - a reply's own "if
   * you can share a photo of your teeth" read as the visitor asking for
   * one, and an ambiguous request returning hair-transplant photos in a
   * dental conversation.
   *
   * It is still asked for, on purpose, and so is accepts_offer. Removing
   * either one costs precision on whatever is left, because the model has
   * nowhere to put what it is seeing: measured twice, at 100% -> 55% on
   * direct_request and 95% -> 57% on hesitation. See the note above
   * SIGNAL_PROMPT. A classifier needs a box for each thing, even a box
   * nobody reads.
   */
  direct_request: boolean;
  /** Stepping back: needs to think, wants to consult someone. */
  hesitation: boolean;
  /** Frustrated: repeating a question, or saying they were not answered. */
  impatience: boolean;
};

/** Every signal false. The shape returned whenever we do not know. */
export const NO_SIGNALS: VisitorSignals = {
  direct_request: false,
  hesitation: false,
  impatience: false,
};

export const SIGNAL_MODEL = "claude-haiku-4-5-20251001";

/**
 * How long a visitor may wait for this, counted from the start of the
 * turn so the database work runs inside it rather than after it.
 *
 * Was 900ms, which I set from the measured p50 of 916ms without noticing
 * that a budget AT the p50 is a coin flip. Measured on the real text it
 * aborted 2 calls in 3, so the signal was usually absent and an Arabic
 * request for photos got nothing - the feature failing for a reason that
 * had nothing to do with language.
 *
 * 2000ms leaves room for the p95 of 1216ms plus the queries it overlaps.
 * The end-to-end cost of that is measured, not assumed: see
 * docs/latency-*.txt.
 */
export const SIGNAL_BUDGET_MS = Number(process.env.SIGNAL_BUDGET_MS ?? 2000);

/**
 * The instruction, exported so scripts/classify-eval.ts measures the
 * REAL one rather than a copy that can drift from it.
 *
 * A shorter variant lives beside it because most of the ~900ms this call
 * costs is time to first token, and a shorter prompt is the cheapest
 * thing to try. Which one is used is decided by measurement, not by
 * preference: see SIGNAL_PROMPT below.
 */
export const SIGNAL_PROMPT_LONG = `You read ONE message from a visitor to a business's chat and report what it does.

Reply with ONLY this JSON object, no other text:
{"accepts_offer": bool, "direct_request": bool, "hesitation": bool, "impatience": bool}

accepts_offer — the visitor is taking up something the assistant JUST offered to show them. "Yes" answering "what is your name?" is not this.
direct_request — the visitor is asking to be shown something: photos, results, examples. A visitor offering to send THEIR OWN photo is not this; they are sending, not asking to see.
hesitation — the visitor is stepping back: needs to think, wants to consult someone, is not ready to decide.
impatience — the visitor is frustrated: repeating a question, or saying they were not answered.

The message may be in any language. Judge what it does, not what words it uses. Several can be true; usually none are.`;

/**
 * The same job in about half the tokens.
 *
 * Both dead keys are kept here too, for the reason recorded under
 * SIGNAL_PROMPT: they are what stops the model filing "yes" and "can I
 * see photos?" as hesitation.
 */
export const SIGNAL_PROMPT_SHORT = `Report what this visitor message does. Reply with JSON only:
{"accepts_offer": bool, "direct_request": bool, "hesitation": bool, "impatience": bool}

accepts_offer: agreeing to something just offered ("yes please", "go on").
direct_request: asking to be SHOWN something (photos, results, examples). Offering to send their own photo is not.
hesitation: stepping back - needs to think, wants to consult someone, not ready.
impatience: frustrated - repeating a question, or saying they were not answered.

Any language. Judge intent, not wording. Usually all false.`;

// ── The two-signal prompt, tried and rejected ────────────────────────
// Image sending is gone, so accepts_offer and direct_request decide
// nothing whatsoever, and asking for them looks like pure waste. Cutting
// them to just {"hesitation", "impatience"} was measured against the same
// 71 labelled cases over three runs — docs/classifier-two-signal-2026-09-30.log
// — and it is a serious regression:
//
//   hesitation precision   95%  ->  57%    (Arabic 100% -> 35%)
//   impatience             100% -> 100%
//
// The false positives say exactly why. "نعم" ("yes"), "لا شكراً" ("no
// thank you"), "do you have pictures of the results?" and "¿tenéis
// imágenes de resultados?" were all filed as HESITATION. With no box for
// "they are saying yes" or "they are asking to be shown something", the
// model puts them in the nearest box it has left.
//
// That is the second time the same mistake has cost precision: it took
// direct_request from 100% to 55% when accepts_offer was first removed,
// and it now takes hesitation from 95% to 57%. A classifier needs a box
// for each thing it sees, even one nobody reads — the two dead keys are
// not waste, they are what keeps the live ones clean. The saving was
// going to be a few hundred output tokens on a Haiku call.
//
// A visitor who says "yes" being read as hesitating is not cosmetic: it
// suppresses pre-close coverage and adds a back-off instruction at the
// exact moment they agreed.

/**
 * Which one is live.
 *
 * Switched by measurement against the labelled set, never by preference.
 * Accuracy is not traded for speed: if precision or recall drops on ANY
 * failure class, the longer prompt stays.
 */
export const SIGNAL_PROMPT =
  process.env.SIGNAL_PROMPT_VARIANT === "short" ? SIGNAL_PROMPT_SHORT : SIGNAL_PROMPT_LONG;

/**
 * The keys the live prompt actually asks for.
 *
 * scripts/classify-eval.ts scores only these. A prompt never asked for
 * accepts_offer would otherwise score 0% recall on it and read as a
 * regression, which is a harness fault reported as a model result — the
 * exact mistake the JSON-parsing comment below records.
 */
export const SIGNAL_PROMPT_KEYS: readonly string[] = [
  "accepts_offer",
  "direct_request",
  "hesitation",
  "impatience",
];

// There was a second, much shorter budget here, for turns where
// direct_request could not change the reply anyway. It is gone with the
// feature: hesitation is read on every turn and always before the reply,
// so there is one budget and it always applies.

/**
 * The first balanced {...} in a response.
 *
 * Not JSON.parse on the whole thing: this model reliably emits correct
 * JSON and then explains itself underneath, and parsing the lot threw on
 * 36 of 210 calls while it was being measured. Every throw counted as
 * "no signal" and quietly depressed the numbers.
 */
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

let warnedAboutFailure = false;

/**
 * Reads the signals, or gives up.
 *
 * NEVER throws and never returns a partial answer. On a timeout, a
 * malformed response, a missing key or any error at all, every signal
 * reads false and the reply still goes out — the assistant simply behaves
 * as it did for every non-English visitor before this existed.
 *
 * False is the safe direction for both live signals. False hesitation
 * means coverage is still checked and the close still held, rather than a
 * lead let go because we thought they were stepping back; false
 * impatience means no special handling, which is the ordinary path.
 */
export async function readVisitorSignals(
  message: string,
  options: { budgetMs?: number; startedAt?: number } = {}
): Promise<VisitorSignals> {
  const budget = options.budgetMs ?? SIGNAL_BUDGET_MS;
  const startedAt = options.startedAt ?? Date.now();
  const remaining = budget - (Date.now() - startedAt);
  if (remaining <= 0) return NO_SIGNALS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);

  try {
    const res = await anthropic.messages.create(
      {
        model: SIGNAL_MODEL,
        max_tokens: 150,
        system: SIGNAL_PROMPT,
        messages: [{ role: "user", content: message }],
      },
      { signal: controller.signal }
    );
    const block = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(
      firstJsonObject(block?.type === "text" ? block.text : "")
    ) as Record<string, unknown>;
    return {
      direct_request: parsed.direct_request === true,
      hesitation: parsed.hesitation === true,
      impatience: parsed.impatience === true,
    };
  } catch (error) {
    // Once per instance. A degraded classifier looks exactly like a
    // quiet assistant, so it has to say something; a line per request
    // would bury the logs it is trying to draw attention to.
    if (!warnedAboutFailure) {
      warnedAboutFailure = true;
      console.warn("[signals] unavailable, continuing without:", String((error as Error)?.message).slice(0, 120));
    }
    return NO_SIGNALS;
  } finally {
    clearTimeout(timer);
  }
}
