// The languages a business can be configured in, with canonical codes.
//
// These were free-text fields, and free text meant "Arabic", "العربية"
// and "ar" were three different languages as far as the code was
// concerned. Every feature that keys off language had to guess: script
// detection, lead routing, RTL layout, and whether a cached translation
// still matched the chosen language. A code removes the guessing.
//
// ISO 639-1, two letters, lowercase. Each entry carries the English name
// (what the owner searches for) and the native name (what they recognise
// their own language by), because a picker showing only one of those is
// harder to use in exactly the cases that matter.
//
// The list is deliberately finite. A picker backed by a fixed list is the
// point: it is what stops a typo becoming a language nobody can match.

export type Language = {
  /** ISO 639-1, lowercase. */
  code: string;
  /** English name, e.g. "Arabic". */
  name: string;
  /** The language's own name for itself, e.g. "العربية". */
  native: string;
  /** Written right to left. */
  rtl?: true;
};

export const LANGUAGES: readonly Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "sr", name: "Serbian", native: "Српски" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "bs", name: "Bosnian", native: "Bosanski" },
  { code: "sq", name: "Albanian", native: "Shqip" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "ps", name: "Pashto", native: "پښتو", rtl: true },
  { code: "ku", name: "Kurdish", native: "Kurdî" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycanca" },
  { code: "kk", name: "Kazakh", native: "Қазақша" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha" },
  { code: "hy", name: "Armenian", native: "Հայերեն" },
  { code: "ka", name: "Georgian", native: "ქართული" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "km", name: "Khmer", native: "ខ្មែរ" },
  { code: "my", name: "Burmese", native: "မြန်မာ" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "is", name: "Icelandic", native: "Íslenska" },
  { code: "ga", name: "Irish", native: "Gaeilge" },
  { code: "mt", name: "Maltese", native: "Malti" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "eu", name: "Basque", native: "Euskara" },
  { code: "gl", name: "Galician", native: "Galego" },
] as const;

/** The default when nothing has been chosen. */
export const DEFAULT_LANGUAGE_CODE = "en";

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Lookup by code, or undefined for anything not on the list. */
export function languageByCode(code: string | null | undefined): Language | undefined {
  return BY_CODE.get((code ?? "").trim().toLowerCase());
}

/** "Arabic — العربية", or just the name when the two are the same. */
export function languageLabel(language: Language): string {
  return language.name === language.native
    ? language.name
    : `${language.name} — ${language.native}`;
}

/** Whether a code names a right-to-left language. */
export function isRtlLanguageCode(code: string | null | undefined): boolean {
  return languageByCode(code)?.rtl === true;
}

// Built once. Maps every spelling we might already have stored — the
// code, the English name, the native name — onto the code.
const LOOKUP = new Map<string, string>();
for (const language of LANGUAGES) {
  LOOKUP.set(language.code, language.code);
  LOOKUP.set(language.name.toLowerCase(), language.code);
  LOOKUP.set(language.native.toLowerCase(), language.code);
}

/**
 * Spellings that are not the language's own name but appear in the wild,
 * mostly from owners typing what they call it.
 */
const ALIASES: Record<string, string> = {
  mandarin: "zh",
  cantonese: "zh",
  "chinese (simplified)": "zh",
  "chinese (traditional)": "zh",
  farsi: "fa",
  persian: "fa",
  castilian: "es",
  flemish: "nl",
  "brazilian portuguese": "pt",
  "portuguese (brazil)": "pt",
  bokmal: "no",
  nynorsk: "no",
  filipino: "tl",
  tagalog: "tl",
  "serbo-croatian": "sr",
  deutsch: "de",
  espanol: "es",
  francais: "fr",
  turkce: "tr",
  russkiy: "ru",
};

/**
 * The canonical code for whatever was stored before, or null.
 *
 * Null is the honest answer for something unrecognised, and the caller
 * decides. Guessing here would quietly relabel a language, and a lead
 * routed to the wrong salesperson is worse than one that is unlabelled.
 */
export function resolveLanguageCode(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return LOOKUP.get(raw) ?? ALIASES[raw] ?? null;
}

/**
 * Languages matching a search, ordered so the closest match is first.
 *
 * Matches on code, English name and native name, so an owner can type
 * "ar", "arabic" or "العربية" and find the same row.
 */
export function searchLanguages(query: string, pool: readonly Language[] = LANGUAGES): Language[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...pool];

  const scored = pool
    .map((language) => {
      const name = language.name.toLowerCase();
      const native = language.native.toLowerCase();
      // Exact code first, then anything starting with the query, then
      // anything containing it. A two-letter query is nearly always a
      // code, and burying "ar" under "Bulgarian" would be perverse.
      if (language.code === q) return { language, rank: 0 };
      if (name.startsWith(q) || native.startsWith(q)) return { language, rank: 1 };
      if (name.includes(q) || native.includes(q)) return { language, rank: 2 };
      return null;
    })
    .filter((x): x is { language: Language; rank: number } => x !== null);

  return scored
    .sort((a, b) => a.rank - b.rank || a.language.name.localeCompare(b.language.name))
    .map((x) => x.language);
}
