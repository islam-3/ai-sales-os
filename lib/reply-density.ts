// How much a single reply asks the reader to absorb.
//
// One reply in a live Arabic test carried the implant brand, the crown
// brand, both warranties, all three treatment stages AND a question.
// That is a wall of text on a phone, to someone nervous about a decision
// that costs thousands — and it is the opposite of what the product is
// for, which is a conversation they come away from feeling they know the
// business.
//
// ── Why this is counted rather than asked for ────────────────────────
// "Keep it concise" is the shape of instruction this codebase has
// already measured doing nothing: telling the model to "let your replies
// look different" moved nothing, while counting the last two shapes and
// stating the repetition as a fact moved it. Density gets the same
// treatment — a number, computed from the reply, that an instruction can
// point at.
//
// ── What counts as something to absorb ───────────────────────────────
// A FIGURE or a NAME. Those are what a reader has to hold on to: "5
// days", "four months", "Straumann", "Istanbul", "March". Ordinary prose
// between them costs almost nothing to read; it is the facts that stack
// up.
//
// Both are counted in a way that survives the six failure classes:
//
//   figures   digit runs, after Arabic-Indic and full-width digits are
//             normalised, so ٥ أيام counts the same as 5 days.
//   names     Latin-script capitalised words that do not open a
//             sentence. Brands stay in Latin script in every language
//             this product sees — the Chinese replies in the smoke test
//             say "Implant Swiss" — so this finds them in CJK and Arabic
//             replies too, where there is no capitalisation to read.
//
// ── What it cannot see, stated plainly ───────────────────────────────
// A spelled-out number ("two visits", "دورتين") is not counted. Nor is a
// brand written in Chinese characters. So this UNDERCOUNTS, consistently
// — which is fine for a bar calibrated on the same measure, and would
// not be fine if the number were ever reported as "the number of facts".
// It is a proxy with a known lean, not a count.

import { normaliseDigits } from "./phone-number";
import { countWords, splitSentences } from "./punctuation";

/**
 * CR, LF or CRLF. Declared once so it cannot drift between its two uses.
 *
 * Built from escapes rather than written as a literal because this file
 * is edited by scripts as well as by hand, and a line-break literal
 * inside a regex literal is the one thing that cannot survive that.
 */
const LINE_BREAK = new RegExp("\\r?\\n");

export type ReplyDensity = {
  /** Distinct digit groups: "5 days ... 7 days" is two, "5 and 5" is one. */
  figures: number;
  /** Distinct non-sentence-initial Latin capitalised words. */
  names: number;
  /** figures + names — what the reader is being asked to hold. */
  units: number;
  /**
   * Non-empty lines.
   *
   * Counted separately from units because layout is its own kind of
   * overload: a reply broken into seven labelled blocks is a document,
   * and it reads as one on a phone however few facts it contains. The
   * reported wall was both at once — three stages laid out as a list,
   * plus brands and warranties inside them.
   */
  blocks: number;
  words: number;
};

/**
 * Every digit group, normalised, as a set.
 *
 * Distinct rather than total, because a reply that repeats "5 days" when
 * summarising has not added a second thing to remember.
 */
function figuresIn(text: string): Set<string> {
  const normalised = normaliseDigits(text);
  const found = new Set<string>();
  const pattern = /\d+(?:[.,]\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalised)) !== null) {
    found.add(match[0]);
  }
  return found;
}

/**
 * Capitalised Latin words that are not the first word of a sentence.
 *
 * The sentence-initial exclusion is what makes this usable on English at
 * all: without it every sentence contributes its opening word and an
 * ordinary three-sentence reply scores three names it does not contain.
 *
 * Single letters are excluded so English "I" is not a name.
 */
function namesIn(text: string): Set<string> {
  const found = new Set<string>();
  // Each LINE is split separately, so a line break counts as a sentence
  // boundary. Without this a reply laid out as a list — "Visit 1 (5
  // days)" on its own line, with no full stop — ran as one long sentence
  // and every line's opening word scored as a name. A Turkish reply
  // measured 10 names it did not contain. The list-ness of such a reply
  // is real and is counted, but as `blocks` below, under its own name.
  const sentences = text
    .split(LINE_BREAK)
    .flatMap((line) => splitSentences(line));
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      // Leading and trailing punctuation stripped, so a quoted or
      // bracketed brand is still seen and "Straumann," matches
      // "Straumann".
      const bare = word.replace(/^[^0-9A-Za-zÀ-ɏ]+/, "").replace(/[^0-9A-Za-zÀ-ɏ]+$/, "");
      if (bare.length < 2) return;
      // The first word of a sentence is capitalised by grammar, not by
      // being a name. Without this exclusion an ordinary three-sentence
      // English reply scores three names it does not contain.
      if (i === 0) return;
      if (!isLatinUpper(bare.charAt(0))) return;
      if (!isAllLatin(bare)) return;
      found.add(bare.toLowerCase());
    });
  }
  return found;
}

/** Latin blocks only: basic, Latin-1, Extended-A/B, Extended Additional. */
function isLatinCodePoint(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xc0 && code <= 0x24f) ||
    (code >= 0x1e00 && code <= 0x1eff)
  );
}

function isAllLatin(word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i);
    // Digits are allowed inside a name - "Straumann BLX3" is one thing
    // to remember, not a name plus a figure.
    if (code >= 0x30 && code <= 0x39) continue;
    if (!isLatinCodePoint(code)) return false;
  }
  return true;
}

/**
 * Upper case, in a Latin script.
 *
 * Case is tested by round-tripping rather than by a range, because the
 * Latin Extended blocks interleave upper and lower case and a range
 * would catch both. Cyrillic and Greek have capitals too and are
 * excluded by isLatinCodePoint - in those languages a mid-sentence
 * capital is not a name marker the way it is in Latin script.
 */
function isLatinUpper(char: string): boolean {
  if (!isLatinCodePoint(char.charCodeAt(0))) return false;
  return char !== char.toLowerCase() && char === char.toUpperCase();
}

export function replyDensity(text: string): ReplyDensity {
  const trimmed = text.trim();
  const figures = figuresIn(trimmed).size;
  const names = namesIn(trimmed).size;
  const blocks = trimmed.split(LINE_BREAK).filter((line) => line.trim().length > 0).length;
  return { figures, names, units: figures + names, blocks, words: countWords(trimmed) };
}

/**
 * How many things one reply may ask the reader to hold.
 *
 * CALIBRATED against real replies across the six failure classes, not
 * chosen: see docs/reply-density-before.txt. An ordinary answer sits at
 * 0-4 units; the replies that read as walls sit at 8 and above.
 *
 * 6 is deliberately above the ordinary range rather than at the top of
 * it. This is a brake on the outlier, not a style guide — a reply that
 * genuinely needs five facts to answer what was asked should give five,
 * and a bar that fired on those would make the assistant evasive, which
 * is a worse failure than a long reply.
 */
export const DENSITY_MAX_UNITS = Number(process.env.DENSITY_MAX_UNITS ?? 6);

/**
 * How many lines a reply may be broken into.
 *
 * Also calibrated: an ordinary reply is 1-3 lines, and the ones that
 * read as documents run to 7 and beyond. A short list is fine — someone
 * who asked what the stages are deserves to see them separated — so this
 * sits above the normal range too.
 */
export const DENSITY_MAX_BLOCKS = Number(process.env.DENSITY_MAX_BLOCKS ?? 6);

/**
 * True when one reply carried more than one turn's worth.
 *
 * Either axis alone is enough. A dense paragraph and a sparse document
 * are different failures and a reader feels both.
 */
export function isOverloaded(text: string): boolean {
  const d = replyDensity(text);
  return d.units > DENSITY_MAX_UNITS || d.blocks > DENSITY_MAX_BLOCKS;
}
