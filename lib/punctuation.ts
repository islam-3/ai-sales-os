// Sentence endings, in every script we might meet.
//
// Every rule in this codebase that asks "is this a question?" or "where
// does this sentence end?" used ASCII `.`, `!` and `?`. Measured against
// a real conversation, that meant:
//
//   - Arabic ends questions with U+061F, so endsWithQuestion was false
//     for 8 of 9 replies in a live Arabic conversation, and the state
//     block told the model every single turn that it had not been
//     ending on questions;
//   - CJK ends sentences with U+3002 and U+FF1F and puts no space after
//     them, so a three-sentence Chinese message split into one;
//   - single-question enforcement never fired outside Latin at all,
//     which is why an Arabic reply could ask two questions at once.
//
// None of that is a language feature. It is one regex, written once,
// against one script, and inherited everywhere.
//
// ── Why these are numbers ────────────────────────────────────────────
// Every mark below is declared by CODEPOINT, not as a literal and not as
// a \u escape. Two reasons, both learned the hard way in this file:
//
//   1. U+037E, the Greek question mark, is visually IDENTICAL to an
//      ASCII semicolon. A semicolon in this set would end a sentence
//      mid-clause in most of the languages we serve, and no reviewer can
//      see the difference between the safe character and the dangerous
//      one. A number can be read.
//   2. Escapes in this file have twice been rewritten into literals by
//      tooling in transit. A number survives that; an escape does not.

/** Builds a string from codepoints. */
const chars = (...codes: number[]) => codes.map((c) => String.fromCharCode(c)).join("");

/** Escapes a set of characters for safe use inside a regex [...] class. */
const charClass = (text: string) => text.replace(/[\\\]^-]/g, "\\$&");

const QUESTION_MARKS = chars(
  0x003f, // ? ASCII
  0xff1f, // full-width, CJK
  0x061f, // Arabic
  0x037e, // Greek — looks exactly like ";"
  0x055e, // Armenian
  0x2e2e // reversed
);

const STOPS = chars(
  0x002e, // .
  0x0021, // !
  0x3002, // ideographic full stop
  0xff01, // full-width exclamation
  0x06d4, // Arabic / Urdu full stop
  0x0964, // Devanagari danda
  0x0965, // Devanagari double danda
  0x2026 // ellipsis
);

/**
 * Characters that end a sentence.
 *
 * Opening marks are deliberately absent: Spanish begins a question with
 * U+00BF and an exclamation with U+00A1, and neither may ever end one.
 */
const SENTENCE_ENDS = STOPS + QUESTION_MARKS;

/** Trailing quotes and brackets that may sit after the mark. */
const CLOSERS = chars(
  0x0022, // "
  0x0027, // '
  0x2019, // curly apostrophe
  0x201d, // curly close quote
  0x00bb, // guillemet
  0x203a, // single guillemet
  0x0029, // )
  0x005d, // ]
  0x007d, // }
  0x300d, // CJK corner bracket
  0x300f,
  0xff09 // full-width )
);

const Q = charClass(QUESTION_MARKS);
const S = charClass(SENTENCE_ENDS);
const C = charClass(CLOSERS);

/** Whether text ends on a question, whatever script it is written in. */
export const ENDS_WITH_QUESTION = new RegExp(`[${Q}][${C}]*\\s*$`);

/** Whether text ends on any sentence-ending mark. */
export const ENDS_WITH_SENTENCE = new RegExp(`[${S}][${C}]*\\s*$`);

/**
 * One sentence, including the mark that ends it and any space after.
 *
 * Used where the pieces must rejoin into the original text exactly —
 * dropping a question from a reply, for instance — so unlike
 * splitSentences() this keeps the trailing whitespace rather than
 * trimming it.
 */
export const SENTENCE_CHUNK = new RegExp(`[^${S}]+[${S}]+(?:\\s|$)|[^${S}]+$`, "g");

/** Marks that need no following space, because their scripts use none. */
const NO_SPACE_ENDS = charClass(chars(0x3002, 0xff01, 0xff1f));
/** Everything else, which does. */
const SPACED_ENDS = charClass(chars(0x002e, 0x0021, 0x06d4, 0x0964, 0x0965) + QUESTION_MARKS);

/**
 * Splits text into sentences.
 *
 * Two rules, because two families of script punctuate differently:
 *
 *   - after an ASCII-style ender, only when whitespace follows, which is
 *     what keeps "Dr. Smith" and "4.5 mm" in one piece;
 *   - after a full-width CJK ender, always: those scripts put no space
 *     after U+3002 or U+FF1F, and requiring one collapsed every Chinese
 *     and Japanese message into a single sentence.
 *
 * Arabic needs no special case. It uses U+061F and U+06D4 with ordinary
 * spacing, so it only ever needed those characters to be in the list.
 */
export function splitSentences(text: string): string[] {
  const splitter = new RegExp(`(?<=[${SPACED_ENDS}][${C}]?)\\s+|(?<=[${NO_SPACE_ENDS}][${C}]?)`);
  return text
    .replace(/\s+/g, " ")
    .split(splitter)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Han, kana and Hangul: scripts that write no spaces between words. */
const CJK_RANGES: [number, number][] = [
  [0x3040, 0x30ff], // kana
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified
  [0xac00, 0xd7af], // Hangul
];
const CJK_CHAR = new RegExp(
  `[${CJK_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`,
  "g"
);

/**
 * Roughly how many characters make a word in those scripts.
 *
 * An approximation, and meant to be. The alternative on offer is not a
 * better number — it is a number wrong by a factor of forty.
 */
const CJK_CHARS_PER_WORD = 1.5;

/**
 * A token counts as a word only if it holds a letter or a digit, so
 * stray dashes and punctuation are not counted. Explicit ranges rather
 * than a unicode property escape: this compiles to a target without the
 * flag those escapes require.
 */
const LETTER_RANGES: [number, number][] = [
  [0x0030, 0x0039], // digits
  [0x0041, 0x005a], // A-Z
  [0x0061, 0x007a], // a-z
  [0x00aa, 0x02af], // Latin supplement and extended
  [0x0370, 0x05ff], // Greek, Cyrillic, Hebrew
  [0x0600, 0x08ff], // Arabic and friends
  [0x0e00, 0x0e7f], // Thai
];
const HAS_LETTER_OR_DIGIT = new RegExp(
  `[${LETTER_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`
);

/**
 * Words, counted so the number means the same thing in every script.
 *
 * Scripts that separate words with spaces are split on whitespace.
 * Scripts that do not have no boundary to split on, and splitting anyway
 * returns 1 for an entire paragraph: measured, a 57-character Chinese
 * message counted as ONE word against a real length of about forty, so
 * every length band and every minimum-words threshold took the wrong
 * branch on every single turn.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const cjkChars = (trimmed.match(CJK_CHAR) ?? []).length;
  const spaced = trimmed
    .replace(CJK_CHAR, " ")
    .split(/\s+/)
    .filter((word) => HAS_LETTER_OR_DIGIT.test(word)).length;

  return spaced + Math.round(cjkChars / CJK_CHARS_PER_WORD);
}
