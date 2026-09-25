// Is this message a yes?
//
// The one text rule in this codebase that is safe to keep, because it is
// the only one whose class is CLOSED. "Yes" has a handful of forms per
// language and they change about as often as the numerals; hesitation and
// impatience have as many forms as there are ways to be uncertain or
// annoyed, which is why those go to a model instead.
//
// It answers a much narrower question than the old cue lists did. Those
// had to work out WHAT was being accepted by matching the visitor's words
// against entry titles — an Arabic "yes" against an English "Before and
// after gallery" — and scored zero outside English. The server now
// remembers what it offered (lib/pending-offer.ts), so the only thing
// left to ask is whether this message agrees. That question has no
// vocabulary problem.
//
// Deliberately NOT a general sentiment check. It is asked only when an
// offer is actually pending, so "yes" following "what is your name?" is
// never even put to it.

/** Affirmatives, by failure class rather than exhaustively by language. */
const AFFIRMATIVE_FORMS = [
  // Latin scripts
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please", "yes please",
  "go on", "go ahead", "sounds good", "id like that", "i would like that",
  "si", "sí", "claro", "vale", "por favor", "dale", "bueno",
  "oui", "bien sur", "bien sûr", "daccord", "d'accord", "volontiers",
  "ja", "jawohl", "gerne", "klar", "natürlich", "naturlich",
  "evet", "tabii", "olur", "lütfen", "lutfen", "isterim", "tamam",
  "sim", "claro que sim", "por favor",
  "tak", "oczywiście", "prosze", "proszę",
  "da", "sigurno",
  "ya", "iya", "boleh", "silakan",
  "sim por favor", "certo", "certamente", "volentieri",
  // Cyrillic
  "да", "давайте", "давай", "конечно", "покажите", "хочу", "ага", "ладно",
  // Arabic
  "نعم", "أجل", "اي", "ايوه", "أيوة", "طيب", "تمام", "أكيد", "اكيد",
  "من فضلك", "أرني", "ارني", "بالتأكيد", "موافق", "ماشي",
  // Hebrew / Persian / Urdu
  "כן", "בבקשה", "بله", "آری", "لطفا", "جی ہاں", "ہاں",
  // CJK — no spaces, so these are matched as substrings below
  "是", "是的", "好", "好的", "可以", "想看", "麻烦您", "请", "要",
  "はい", "ええ", "お願いします", "見たい", "うん",
  "네", "예", "좋아요", "부탁합니다",
  // Others
  "ναι", "παρακαλώ", "kylla", "kyllä", "ja tack", "jo", "igen", "ano",
  "hai", "haan", "हाँ", "हां", "ஆம்", "అవును", "አዎ", "ndiyo", "haa",
];

/** Words that turn a yes into a no, checked before anything else. */
const NEGATIVE_FORMS = [
  "no", "not", "nope", "nah", "dont", "don't", "cant", "can't", "never",
  "no thanks", "no thank you", "maybe later", "not now", "not yet",
  "nein", "nicht", "kein", "non", "pas", "nunca", "nada",
  "hayır", "hayir", "değil", "degil", "gerek yok",
  "нет", "не", "не надо", "не нужно",
  "لا", "ليس", "مش", "ما",
  "不", "不用", "不要", "没有", "いいえ", "いや", "けっこう", "아니요",
  "όχι", "nie", "ne", "nej", "nem",
];

/** Punctuation and spacing flattened; kept simple on purpose. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[!.,;:?¿¡؟？。！"'`()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** CJK writes no spaces, so its forms are matched as substrings. */
const HAS_CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

function containsForm(normalised: string, forms: string[]): boolean {
  if (HAS_CJK.test(normalised)) {
    // Substring matching, because there are no word boundaries to use.
    if (forms.some((f) => HAS_CJK.test(f) && normalised.includes(f))) return true;
  }
  const words = normalised.split(" ").filter(Boolean);
  if (words.length === 0) return false;

  // Whole words and whole phrases only. Substring matching on spaced
  // scripts would make "notice" a negative and "sure" match "pressure".
  if (forms.some((f) => !HAS_CJK.test(f) && words.includes(f))) return true;
  return forms.some((f) => !HAS_CJK.test(f) && f.includes(" ") && normalised.includes(f));
}

/**
 * Whether a message agrees, when something has been offered.
 *
 * Negatives are checked FIRST and win outright: "no thanks" contains no
 * affirmative, but "not yet, thanks" and "ma ashoof, la" could trip one,
 * and sending a photo to someone who declined is worse than missing an
 * acceptance they can simply repeat.
 *
 * Long messages are refused as well. A visitor writing three sentences is
 * saying something more specific than yes, and treating that as a bare
 * acceptance is how "yes but only the crowns" became a Hollywood-smile
 * photo. Let the classifier or the next turn handle those.
 */
const MAX_WORDS_FOR_A_BARE_YES = 8;

export function isAffirmative(text: string): boolean {
  const normalised = normalise(text);
  if (!normalised) return false;

  if (containsForm(normalised, NEGATIVE_FORMS)) return false;

  const wordCount = HAS_CJK.test(normalised)
    ? Math.ceil(normalised.replace(/\s/g, "").length / 1.5)
    : normalised.split(" ").filter(Boolean).length;
  if (wordCount > MAX_WORDS_FOR_A_BARE_YES) return false;

  return containsForm(normalised, AFFIRMATIVE_FORMS);
}

/** Exposed for the test, so the lists can be checked for overlap. */
export const AFFIRMATIVE_LIST = AFFIRMATIVE_FORMS;
export const NEGATIVE_LIST = NEGATIVE_FORMS;
