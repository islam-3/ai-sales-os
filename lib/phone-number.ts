// Can a rep abroad actually dial what we stored?
//
// These are medical-tourism clinics. A visitor in Riyadh types "0532 111
// 2233" because that is how they would write it to a friend, the rep in
// Istanbul dials it and reaches nobody, and a lead that cost real money
// to generate is a wrong number.
//
// Two halves, and this is the second. The assistant now asks for the full
// international form when it asks for a number at all (see
// lib/business-prompt.ts). This is what notices when it got one anyway,
// so the rep checks rather than discovers it on the call.
//
// ── Derived, not stored ──────────────────────────────────────────────
// Deliberately a pure function over the stored value, computed where it
// is displayed, rather than a column written at extraction time. A flag
// in the database would be wrong the moment a rep corrects the number,
// would need a backfill for every lead taken before today, and would be
// a second copy of a fact the first copy already holds.

/** Arabic-Indic, Extended Arabic-Indic and full-width digits, to ASCII. */
const DIGIT_OFFSETS: [number, number][] = [
  [0x0660, 0x0669], // ٠-٩  Arabic-Indic
  [0x06f0, 0x06f9], // ۰-۹  Extended Arabic-Indic (Persian/Urdu)
  [0xff10, 0xff19], // ０-９ full-width
];

/**
 * The same number written in any script, as ASCII digits and nothing else
 * but the separators that matter.
 *
 * A Saudi visitor typing ٠٥٣٢ and an English one typing 0532 have written
 * the same thing, and a check that only reads ASCII would call the first
 * one "no digits at all" and silently pass it.
 */
export function normaliseDigits(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const range = DIGIT_OFFSETS.find(([lo, hi]) => code >= lo && code <= hi);
    out += range ? String(code - range[0]) : char;
  }
  return out;
}

/** The longest run of digits, ignoring the spaces and dashes inside it. */
function longestNumber(text: string): { run: string; index: number } | null {
  const matches = Array.from(normaliseDigits(text).matchAll(/[\d][\d\s().\-]*/g));
  let best: { run: string; index: number } | null = null;
  for (const m of matches) {
    const run = m[0].replace(/[\s().-]+$/, "");
    const digits = run.replace(/\D/g, "");
    if (!best || digits.length > best.run.replace(/\D/g, "").length) {
      best = { run, index: m.index! };
    }
  }
  return best;
}

/**
 * Whether this contact detail holds a phone number we could not dial
 * from another country.
 *
 * False for anything that is not a number at all — an email address, a
 * Telegram handle, an empty field. Those are not a missing country code,
 * they are a different kind of contact, and flagging them would train a
 * rep to ignore the flag.
 *
 * True only when a number is present and carries no international
 * prefix. "+90..." and "0090..." are fine. "0532..." is not: the leading
 * zero is a national trunk code, which is exactly the digit that has to
 * be dropped when dialling from abroad.
 *
 * A bare "90532..." with no prefix is also flagged, deliberately. It may
 * well be a complete Turkish number, but nothing in the string says so,
 * and "the rep should check" is the honest answer rather than a guess
 * that reads as certainty.
 */
export function needsCountryCode(contactInfo: string | null | undefined): boolean {
  if (!contactInfo) return false;

  const found = longestNumber(contactInfo);
  if (!found) return false;

  // Short runs are years, ages, house numbers and the "4" in "4 months" —
  // never a phone number. The shortest national numbers in use are around
  // seven digits, and a country code pushes a dialable one past eight.
  const digits = found.run.replace(/\D/g, "");
  if (digits.length < 7) return false;

  // What immediately precedes the digits. A "+" may be separated from
  // them by nothing at all, so this looks at the raw text before the run
  // rather than at the run itself.
  const before = normaliseDigits(contactInfo).slice(0, found.index).trimEnd();
  if (before.endsWith("+")) return false;

  // 00 is the other international prefix, and it is part of the run.
  if (digits.startsWith("00")) return false;

  return true;
}
