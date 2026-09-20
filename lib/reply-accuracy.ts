// Figures in a reply that cannot be traced to anything the business said.
//
// This only watches, for now. On the reply path a false positive costs a
// whole visible message rather than a hidden field, so the rate and the
// shape of what it catches have to be known before anything is discarded
// on its say-so. Every other guard in this codebase was tuned against
// measurements rather than guesses, and the measurement comes first here
// too.
//
// The distinction that decides what enforcement should eventually do is
// invention versus reformatting. "We quote around 7,500 EUR" when nobody
// said 7,500 is a wrong price given to a patient. "5.000" where the entry
// says "5,000", or "2 visits" where it says "two visits", is the same
// figure wearing different clothes. Those want opposite answers, so both
// are recorded and told apart.

import { numbersNeedingSupport } from "./lead-language";
import { sentencesOf } from "./conversation-state";

export type FigureKind = "price" | "date" | "count" | "other";

export type UntracedFigure = {
  /** The figure exactly as the reply wrote it. */
  figure: string;
  kind: FigureKind;
  /** The sentence it appeared in, so the log can be read without the transcript. */
  sentence: string;
  /**
   * Whether the same digits appear in the source in some other form.
   *
   * True means the figure exists and was rewritten — a separator, a
   * decimal comma, a spelled-out number turned numeric. False means
   * nothing in the business's own material carries those digits at all.
   */
  digitsInSource: boolean;
};

const CURRENCY = /[$€£₺₽¥]|\b(?:eur|usd|gbp|try|rub|aed|sar)\b/i;
const MONEY_WORDS = /\b(?:price|cost|costs|fee|fees|budget|quote|quoted|package|deposit|pay|payment)\b/i;
const MONTHS =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/i;
const COUNT_UNITS =
  /\b(?:day|days|week|weeks|month|months|year|years|visit|visits|night|nights|teeth|tooth|implant|implants|crown|crowns|patient|patients|session|sessions|hour|hours)\b/i;

/**
 * What kind of figure this is, judged from the figure and the words
 * around it.
 *
 * The kind is what makes the log actionable: a stray count reads very
 * differently from a stray price, and only one of them is a number a
 * patient might act on.
 */
export function classifyFigure(figure: string, sentence: string): FigureKind {
  if (CURRENCY.test(sentence) || MONEY_WORDS.test(sentence)) return "price";
  // A bare four-digit number in this range is a year far more often than
  // it is a quantity.
  if (/^(?:19|20)\d{2}$/.test(figure) || MONTHS.test(sentence) || /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(figure)) {
    return "date";
  }
  if (COUNT_UNITS.test(sentence)) return "count";
  return "other";
}

/** Just the digits, so "5,000" and "5.000" and "5000" compare equal. */
const digitsOf = (text: string) => text.replace(/\D/g, "");

/**
 * Figures in `reply` that appear nowhere in `source`.
 *
 * `source` is everything the business has actually said — its knowledge
 * base and the conversation so far. A figure absent from all of it was
 * not taken from anywhere.
 */
export function untracedFigures(reply: string, source: string): UntracedFigure[] {
  const flatSource = source.replace(/\s+/g, " ");
  const sourceDigits = new Set((flatSource.match(/\d+(?:[.,:/\-]\d+)*/g) ?? []).map(digitsOf));

  const found: UntracedFigure[] = [];
  const seen = new Set<string>();

  for (const sentence of sentencesOf(reply)) {
    for (const figure of numbersNeedingSupport(sentence)) {
      if (flatSource.includes(figure)) continue;
      if (seen.has(figure)) continue;
      seen.add(figure);
      found.push({
        figure,
        kind: classifyFigure(figure, sentence),
        sentence: sentence.trim(),
        digitsInSource: sourceDigits.has(digitsOf(figure)),
      });
    }
  }

  return found;
}
