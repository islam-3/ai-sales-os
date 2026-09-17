// Nothing internal may reach a visitor.
//
// A live conversation received the entire computed state block verbatim —
// prior offers, media instructions, the list of entries the assistant was
// permitted to offer — followed by the model's own reasoning ("I need to
// show the implants brand photo... the system says THIS REPLY CARRIES NO
// IMAGE"), and only then the actual reply. A real clinic's customer saw
// the machinery.
//
// The block was in the right place. It is pushed into `system`, never
// into `messages`, and it always has been. The model simply reproduced it
// and kept going. That is the point: we cannot stop a model emitting
// text, so the guarantee has to be that such text cannot get out. The
// prompt already said "never explain the block or refer to it", and the
// instruction that leaked was itself the sentence "That is information
// for you, not for the visitor".
//
// So this is a gate, not a request. Every reply passes through it on the
// single path that feeds the HTTP response, the stored transcript and the
// lead extractor alike. When a reply cannot be cleaned with confidence it
// is thrown away rather than trimmed — a contaminated generation has
// already demonstrated it is not following instructions, and no part of
// it is trustworthy.

/** Wraps the per-turn state block so a verbatim echo is detectable exactly. */
export const INTERNAL_STATE_OPEN = "<<<INTERNAL-ONLY — NEVER OUTPUT>>>";
export const INTERNAL_STATE_CLOSE = "<<<END INTERNAL-ONLY>>>";

/**
 * Text that only ever appears in our own instructions.
 *
 * Every entry is a phrase the assistant has no reason to say to a
 * visitor. Matching is deliberately broad: a false positive costs one
 * generic reply, a false negative shows a customer our internals.
 */
const INTERNAL_MARKERS: RegExp[] = [
  /<<<INTERNAL-ONLY/i,
  /<<<END INTERNAL-ONLY/i,
  /CONVERSATION STATE \(computed/i,
  /THIS REPLY CARRIES NO IMAGE/i,
  /AN IMAGE IS ATTACHED TO THIS REPLY/i,
  /You (?:have ALREADY made these offers|may OFFER to show the visitor)/i,
  /You have NOT yet told them about/i,
  /information for you, not for the visitor/i,
  /An offer is a question, not a delivery/i,
  /Do not make any of these offers again/i,
  /Share one of these now/i,
  /This overrides the checklist/i,
  /FORBIDDEN in this reply/i,
  /computed, this turn only/i,
  /the state block/i,
];

/** First-person planning about our own machinery, rather than speech to a visitor. */
const REASONING_MARKERS: RegExp[] = [
  /\bthe system (?:says|tells|is telling)\b/i,
  /\bI (?:can|can't|cannot) (?:only )?attach\b/i,
  /\bI (?:should|must) not promise\b/i,
  /\bI'?ll (?:just )?(?:continue|acknowledge|move the conversation)\b/i,
  /\bcovering another category\b/i,
  /\bI need to show the\b/i,
  /\bin the next reply\b/i,
  /\bthis turn\b.*\b(?:image|photo|attach)\b/i,
];

const hits = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

/** Comparable form: case, quote style, dashes and spacing all flattened. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whole sentences from text we injected, long enough to be unmistakable.
 *
 * This is the detector the marker list could never be. The list was
 * written by hand from the sections that existed at the time, so every
 * section added later was invisible to it: an echo of the impatience or
 * repeated-hesitation instructions passed through to a visitor while the
 * guard reported the reply clean, and the property test agreed, because it
 * judged the output with the same list.
 *
 * Matching against what was actually sent cannot drift. Whole sentences
 * only, because the instructions deliberately contain material the model
 * is meant to relay in its own words — a coverage gap carries the reason
 * a detail matters, and the reply should give that reason. A shared
 * phrase is expected; a whole sentence of our instructions is not.
 *
 * Bullet lines are skipped. They quote the assistant's own earlier offers
 * back to it, and repeating its own sentence is a repetition problem, not
 * a leak.
 */
function injectedSentences(injected: string[]): string[] {
  const sentences: string[] = [];
  for (const block of injected) {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || /^[•\-*]\s/.test(trimmed)) continue;
      for (const sentence of trimmed.split(/(?<=[.!?:])\s+/)) {
        const flat = normalise(sentence);
        if (flat.length >= 40) sentences.push(flat);
      }
    }
  }
  return sentences;
}

const echoes = (text: string, sentences: string[]) => {
  if (sentences.length === 0) return false;
  const flat = normalise(text);
  return sentences.some((sentence) => flat.includes(sentence));
};

/**
 * Whether a reply contains anything that was meant only for the model.
 *
 * Pass `injected` — the instruction text actually sent this turn — on
 * every real call. The marker list alone is a fallback that is known to
 * be incomplete.
 */
export function containsInternalState(text: string, injected: string[] = []): boolean {
  return hits(text, INTERNAL_MARKERS) || echoes(text, injectedSentences(injected));
}

/**
 * Whether a reply is mostly a bullet list.
 *
 * The offerable-titles list leaks as bare bullets with no instruction
 * wording attached to recognise it by — "• Crowns brand / • Implants
 * brand" contains nothing incriminating on its own, and that shape
 * reached a visitor. So the shape is the tell: the assistant writes
 * conversational prose and is told never to use lists, which makes a
 * reply that is mostly bullets not a reply at all.
 */
function isMostlyBullets(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const bullets = lines.filter((line) => /^[•\-*]\s/.test(line)).length;
  return bullets / lines.length >= 0.5;
}

/**
 * A reply with all internal content removed, or null when that cannot be
 * done safely.
 *
 * Null is not a failure mode to paper over — it means the model produced
 * something we will not show, and the caller must substitute rather than
 * salvage.
 *
 * Only paragraphs are removed, and only leading ones. In the leak the
 * real answer was a clean suffix ("With 15 years of experience behind
 * us..."), with the machinery and the thinking stacked in front of it.
 * Trimming from the front preserves whole sentences; cutting inside a
 * paragraph would leave fragments that read as bugs of their own.
 */
export function stripInternalState(text: string, injected: string[] = []): string | null {
  const sentences = injectedSentences(injected);
  const internal = (chunk: string) =>
    hits(chunk, INTERNAL_MARKERS) || hits(chunk, REASONING_MARKERS) || echoes(chunk, sentences);

  if (!internal(text) && !isMostlyBullets(text)) return text;

  const paragraphs = text.split(/\n\n+/);

  // Drop every leading paragraph that is instruction or planning, plus
  // the bullet lists that hang off them.
  let start = 0;
  while (start < paragraphs.length) {
    const paragraph = paragraphs[start];
    if (!internal(paragraph) && !/^\s*[•\-*]\s/m.test(paragraph)) break;
    start += 1;
  }

  const kept = paragraphs.slice(start).join("\n\n").trim();

  // Whatever survived must be clean, non-trivial prose. Anything else is
  // discarded: showing half a leak is still showing a leak.
  if (!kept) return null;
  if (internal(kept)) return null;
  if (isMostlyBullets(kept)) return null;
  if (kept.length < 40) return null;

  return kept;
}

/**
 * Shown when a generation has to be discarded.
 *
 * Deliberately bland and true. It says nothing about the business, makes
 * no offer and asks for nothing, so it is safe in any conversation at any
 * point — including after a close, or to someone who has just said they
 * need to think about it.
 */
export const SAFE_FALLBACK =
  "Sorry — could you say that once more? I want to make sure I answer you properly.";
