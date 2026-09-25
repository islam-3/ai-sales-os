// The language the visitor actually wrote in.
//
// These clinics staff a sales rep per language, so this is a routing
// field: it decides who picks the lead up. Without it the owner has to
// open the conversation to find out, which is exactly the work the lead
// card exists to save.
//
// Stored in canonical English rather than in the team's language, unlike
// every other generated field. It is a key, not prose — one lead saying
// "Arapça" and another saying "Arabic" would quietly break filtering, and
// the point of the field is to pull all of a rep's leads together.
//
// Detection is shared between the model and this module, because neither
// can do it alone. Script is decidable in code and proves what a language
// ISN'T, but it cannot name one: Arabic script covers Persian and Urdu,
// Cyrillic covers Ukrainian and Bulgarian. The model can tell those
// apart. So the model proposes and the script vetoes.

import { languageName } from "./languages";

export type VisitorScript = "arabic" | "cyrillic" | "hebrew" | "greek" | "cjk" | "latin";

// Written as escapes on purpose: several of these bounds are invisible or
// direction-changing characters, and a literal one in the source is a
// character nobody can see to review.
const SCRIPT_RANGES: { script: VisitorScript; match: RegExp }[] = [
  { script: "arabic", match: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/ },
  { script: "hebrew", match: /[\u0590-\u05FF\uFB1D-\uFB4F]/ },
  { script: "greek", match: /[\u0370-\u03FF\u1F00-\u1FFF]/ },
  { script: "cyrillic", match: /[\u0400-\u052F]/ },
  { script: "cjk", match: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/ },
  { script: "latin", match: /[A-Za-z\u00C0-\u024F]/ },
];

/**
 * Messages long enough to say anything about language.
 *
 * "ok", "yes" and a phone number are not evidence, and letting them
 * decide would make the field depend on how a conversation happened to
 * end. A message with no letters at all never qualifies.
 */
const MIN_CHARS = 8;

/** Only the last few count, so a visitor who switches is routed where the conversation ended up. */
const RECENT_MESSAGES = 3;

export function qualifyingMessages(visitorMessages: string[]): string[] {
  const qualifying = visitorMessages
    .map((m) => m.trim())
    .filter((m) => m.length >= MIN_CHARS && SCRIPT_RANGES.some((s) => s.match.test(m)));
  return qualifying.slice(-RECENT_MESSAGES);
}

/**
 * The script the visitor is writing in, by letter count.
 *
 * Counting rather than testing is what handles the mixed case: an Arabic
 * message naming a Latin-script brand ("نستخدم غرسات Implant Swiss") is
 * still Arabic, because the Arabic letters outnumber the Latin ones.
 * Digits, punctuation and whitespace are ignored entirely.
 */
export function detectScript(visitorMessages: string[]): VisitorScript | null {
  const text = qualifyingMessages(visitorMessages).join(" ");
  if (!text) return null;

  const counts = new Map<VisitorScript, number>();
  for (const char of text) {
    for (const { script, match } of SCRIPT_RANGES) {
      if (match.test(char)) {
        counts.set(script, (counts.get(script) ?? 0) + 1);
        break;
      }
    }
  }

  let best: VisitorScript | null = null;
  let bestCount = 0;
  Array.from(counts.entries()).forEach(([script, count]) => {
    if (count > bestCount) {
      bestCount = count;
      best = script;
    }
  });
  return best;
}

/**
 * The script a named language is written in, where that is unambiguous.
 *
 * Only used to catch a contradiction, so it does not need to be complete:
 * a language missing from here is simply accepted as given. Adding one is
 * a line, and getting one wrong would reject a correct answer, so only
 * the clear cases are listed.
 */
const LANGUAGE_SCRIPT: { match: RegExp; script: VisitorScript }[] = [
  { match: /^(english|german|deutsch|french|fran[çc]ais|spanish|espa[ñn]ol|italian|italiano|dutch|nederlands|portuguese|portugu[êe]s|polish|polski|turkish|t[üu]rk[çc]e|romanian|swedish|norwegian|danish|finnish|czech|hungarian|croatian|albanian|azerbaijani)$/i, script: "latin" },
  { match: /^(russian|ukrainian|bulgarian|serbian|macedonian|belarusian|kazakh)$/i, script: "cyrillic" },
  { match: /^(arabic|persian|farsi|urdu|pashto|dari|kurdish)$/i, script: "arabic" },
  { match: /^(hebrew)$/i, script: "hebrew" },
  { match: /^(greek)$/i, script: "greek" },
  { match: /^(chinese|mandarin|cantonese|japanese|korean)$/i, script: "cjk" },
];

/**
 * The script a named language is written in, or null when we cannot say.
 *
 * Shared with greeting review, where it answers a different question:
 * whether a draft is still in English after the owner chose Arabic.
 */
export function scriptForLanguage(name: string): VisitorScript | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Accepts a canonical code as well as a name, since settings now store
  // codes: "ar" and "Arabic" must answer the same, or RTL layout and the
  // publish guard would disagree about the same tenant.
  const asName = languageName(trimmed) || trimmed;
  return (
    LANGUAGE_SCRIPT.find((entry) => entry.match.test(asName))?.script ??
    LANGUAGE_SCRIPT.find((entry) => entry.match.test(trimmed))?.script ??
    null
  );
}

export type VisitorLanguageResult =
  | { language: string | null; vetoed: false }
  | { language: null; vetoed: true; proposed: string; script: VisitorScript };

/**
 * The model's answer, unless the script proves it wrong.
 *
 * A lead labelled German that is actually Arabic goes to the wrong rep
 * and sits there, so a contradiction drops the value rather than storing
 * it. Missing beats wrong: an empty field sends the owner to the
 * conversation, which is where they were before this existed.
 */
export function resolveVisitorLanguage(
  proposed: string | null | undefined,
  visitorMessages: string[]
): VisitorLanguageResult {
  const name = proposed?.trim();
  if (!name) return { language: null, vetoed: false };

  const script = detectScript(visitorMessages);
  if (!script) return { language: name, vetoed: false };

  const expected = LANGUAGE_SCRIPT.find((entry) => entry.match.test(name))?.script;
  if (expected && expected !== script) {
    return { language: null, vetoed: true, proposed: name, script };
  }

  return { language: name, vetoed: false };
}
