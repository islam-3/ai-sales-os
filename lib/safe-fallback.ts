// What a visitor is shown when a generation has to be discarded.
//
// There was one sentence, in English, and an Arabic visitor who had
// written only Arabic received it — twice in a row. A conversation that
// has been in Arabic for five turns switching to English to apologise
// reads as broken software, which is exactly what it was.
//
// The language is chosen from the visitor's own writing, never from what
// the assistant replied and never from the tenant's settings alone: the
// point is to answer the person in the language they are using.
//
// Script does the work, because script is structural — it does not
// depend on parsing words, and it is the same test in every language
// that uses that script. Where script cannot decide (Latin covers
// English, Turkish, Spanish and many more) the tenant's configured chat
// language breaks the tie, and English is the last resort.

import { detectScript } from "./visitor-language";
import { resolveLanguageCode } from "./languages";

/**
 * Deliberately bland and true in every language here: it says nothing
 * about the business, makes no offer and asks for nothing, so it is safe
 * at any point in any conversation — including after a close, or to
 * someone who has just said they need to think about it.
 */
const FALLBACKS: Record<string, string> = {
  en: "Sorry — could you say that once more? I want to make sure I answer you properly.",
  ar: "عذراً، هل يمكنك أن تعيد ما قلته مرة أخرى؟ أريد أن أتأكد من أنني أجيبك بشكل صحيح.",
  ru: "Извините, не могли бы вы повторить? Хочу убедиться, что отвечу вам правильно.",
  tr: "Affedersiniz, bunu bir kez daha söyleyebilir misiniz? Size doğru cevap verdiğimden emin olmak istiyorum.",
  es: "Perdona, ¿podrías repetirlo? Quiero asegurarme de responderte bien.",
  zh: "抱歉，能再说一遍吗？我想确保准确地回答您。",
  ja: "すみません、もう一度おっしゃっていただけますか？正しくお答えしたいので。",
};

/** The English default, for callers with nothing to go on. */
export const SAFE_FALLBACK = FALLBACKS.en;

/**
 * Scripts that name a language well enough on their own.
 *
 * Only well enough, not exactly: Cyrillic is not only Russian and the
 * CJK range is not only Chinese. This picks the most likely member and
 * accepts being occasionally wrong, because the alternative — English at
 * a visitor who is plainly not writing it — is wrong every time.
 */
const SCRIPT_LANGUAGE: Record<string, string> = {
  arabic: "ar",
  cyrillic: "ru",
  cjk: "zh",
};

/** Kana are Japanese and nothing else, which separates ja from the CJK bucket. */
const KANA = /[぀-ゟ゠-ヿ]/;

/** Free-text language names the owner may have typed, to a code. */
const NAMED: Record<string, string> = {
  english: "en",
  arabic: "ar",
  "العربية": "ar",
  russian: "ru",
  "русский": "ru",
  turkish: "tr",
  "türkçe": "tr",
  spanish: "es",
  "español": "es",
  chinese: "zh",
  "中文": "zh",
  japanese: "ja",
  "日本語": "ja",
};

/**
 * The apology, in the language the visitor is writing in.
 *
 * Falls back rather than guesses: an unknown script or an unrecognised
 * setting yields English, which is wrong for some visitors but never
 * gibberish for any of them.
 */
export function safeFallbackFor(
  visitorMessages: string[],
  chatLanguage?: string | null
): string {
  const script = detectScript(visitorMessages);
  if (script === "cjk" && visitorMessages.some((m) => KANA.test(m))) return FALLBACKS.ja;

  const fromScript = script ? SCRIPT_LANGUAGE[script] : undefined;
  if (fromScript && FALLBACKS[fromScript]) return FALLBACKS[fromScript];

  // Latin script cannot tell English from Turkish from Spanish, so the
  // tenant's own setting decides — it is the language this chat greets
  // people in, which is the best available guess for a Latin-script
  // visitor who has not said otherwise.
  // resolveLanguageCode first, because settings now store codes. The
  // NAMED table stays as the fallback for values stored before that, and
  // for anything typed by hand.
  const code =
    resolveLanguageCode(chatLanguage) ?? NAMED[(chatLanguage ?? "").trim().toLowerCase()];
  if (code && FALLBACKS[code]) return FALLBACKS[code];

  return FALLBACKS.en;
}

/** Every fallback string, so callers can recognise one after the fact. */
export function allSafeFallbacks(): string[] {
  return Object.values(FALLBACKS);
}
