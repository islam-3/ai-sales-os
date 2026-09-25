// Canonical language codes, and the migration off free text.
//
//   npx tsx scripts/test-languages.ts

import {
  DEFAULT_LANGUAGE_CODE,
  LANGUAGES,
  isRtlLanguageCode,
  languageByCode,
  languageLabel,
  resolveLanguageCode,
  languageName,
  searchLanguages,
} from "../lib/languages";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

console.log("--- the list itself ---");
const codes = LANGUAGES.map((l) => l.code);
check("every code is unique", new Set(codes).size === codes.length);
check("every code is two lowercase letters", codes.every((c) => /^[a-z]{2}$/.test(c)));
check("every entry has a name and a native name", LANGUAGES.every((l) => l.name && l.native));
check("the default is on the list", languageByCode(DEFAULT_LANGUAGE_CODE) !== undefined);
check(
  "every name is unique, so a search cannot be ambiguous",
  new Set(LANGUAGES.map((l) => l.name)).size === LANGUAGES.length
);

console.log("\n--- right to left ---");
check("Arabic is RTL", isRtlLanguageCode("ar"));
check("Hebrew is RTL", isRtlLanguageCode("he"));
check("Persian is RTL", isRtlLanguageCode("fa"));
check("Urdu is RTL", isRtlLanguageCode("ur"));
check("English is not", !isRtlLanguageCode("en"));
check("Turkish is not", !isRtlLanguageCode("tr"));
check("an unknown code is not", !isRtlLanguageCode("qq"));
check("null is not", !isRtlLanguageCode(null));

console.log("\n--- resolving what is already stored ---");
// Every value this project actually has in its database today. Surveyed,
// not guessed: chat_language, lead_language, languages[] and
// chat_intro.language across every tenant, plus every visitor_language
// on every lead.
const STORED: [string, string][] = [
  ["Arabic", "ar"],
  ["English", "en"],
  ["French", "fr"],
  ["Spanish", "es"],
  ["Turkish", "tr"],
  ["Chinese", "zh"],
  ["Russian", "ru"],
];
STORED.forEach(([stored, code]) => {
  check(`"${stored}" -> ${code}`, resolveLanguageCode(stored) === code, String(resolveLanguageCode(stored)));
});

check("a code passes through", resolveLanguageCode("ar") === "ar");
check("case does not matter", resolveLanguageCode("ARABIC") === "ar");
check("surrounding space does not matter", resolveLanguageCode("  Turkish  ") === "tr");
check("the native name resolves", resolveLanguageCode("العربية") === "ar");
check("Türkçe resolves", resolveLanguageCode("Türkçe") === "tr");
check("Русский resolves", resolveLanguageCode("Русский") === "ru");
check("中文 resolves", resolveLanguageCode("中文") === "zh");

console.log("\n--- and refusing to guess ---");
// The important half. A wrong code routes a lead to a salesperson who
// does not speak the language; an unresolved one leaves it unlabelled,
// which is visibly incomplete rather than quietly wrong.
check("an unknown language is null", resolveLanguageCode("Klingon") === null);
check("empty is null", resolveLanguageCode("") === null);
check("null is null", resolveLanguageCode(null) === null);
check("whitespace is null", resolveLanguageCode("   ") === null);
check(
  "a near-miss is not forced onto a code",
  resolveLanguageCode("Arabish") === null,
  "prefix matching here would relabel languages that merely start alike"
);

console.log("\n--- aliases owners actually type ---");
check("Mandarin -> zh", resolveLanguageCode("Mandarin") === "zh");
check("Farsi -> fa", resolveLanguageCode("Farsi") === "fa");
check("Brazilian Portuguese -> pt", resolveLanguageCode("Brazilian Portuguese") === "pt");
check("Tagalog -> tl", resolveLanguageCode("Tagalog") === "tl");

console.log("\n--- searching ---");
check("a two-letter code ranks first", searchLanguages("ar")[0].code === "ar", searchLanguages("ar")[0].code);
check("a prefix finds the language", searchLanguages("turk")[0].code === "tr");
check("the native name finds it", searchLanguages("Türkçe")[0].code === "tr");
check("Arabic script finds Arabic", searchLanguages("العرب")[0].code === "ar");
check("an empty query returns everything", searchLanguages("").length === LANGUAGES.length);
check("nonsense returns nothing", searchLanguages("zzzzz").length === 0);
check(
  "a substring still matches, just lower",
  searchLanguages("ish").some((l) => l.code === "en"),
  "English, Spanish, Turkish and Polish all contain it"
);

console.log("\n--- labels ---");
check("a label shows both names", languageLabel(languageByCode("ar")!) === "Arabic — العربية");
check(
  "and not twice when they are the same",
  languageLabel(languageByCode("en")!) === "English",
  "\"English — English\" reads like a bug"
);

console.log("\n--- codes are for matching, names are for reading ---");
// The split that makes this safe: everything stored and compared is a
// code, and everything a person or a model reads is a name. Mixing them
// is how "ar" ends up in a prompt, or on a lead card in front of a rep.
check("a code becomes a name", languageName("ar") === "Arabic");
check("a name stays a name", languageName("Arabic") === "Arabic");
check("a native name becomes the English name", languageName("العربية") === "Arabic");
check("an alias becomes the canonical name", languageName("Mandarin") === "Chinese");
check(
  "an unrecognised value passes through unchanged",
  languageName("Klingon") === "Klingon",
  "degrading to the old free-text behaviour beats showing nothing"
);
check("empty stays empty", languageName("") === "");
check("null becomes empty", languageName(null) === "");

console.log("\n--- settings normalise on the single read path ---");
check(
  "chat_language becomes a code",
  parseTenantSettings({ chat_language: "Arabic" }).chat_language === "ar"
);
check(
  "languages spoken become codes",
  JSON.stringify(parseTenantSettings({ languages: ["Arabic", "Türkçe", "en"] }).languages) ===
    JSON.stringify(["ar", "tr", "en"])
);
check(
  "an unresolvable language survives as written",
  JSON.stringify(parseTenantSettings({ languages: ["Arabic", "Klingon"] }).languages) ===
    JSON.stringify(["ar", "Klingon"])
);

// The one that would break silently: chat_intro.language is COMPARED
// against chat_language to decide whether an approved translation still
// applies. Moving one to codes without the other marks every translation
// stale and drops every greeting back to English, with nothing on screen
// to say why.
const withIntro = parseTenantSettings({
  chat_language: "Arabic",
  chat_intro: {
    language: "Arabic",
    sourceHash: "abc",
    strings: { help: "كيف يمكننا مساعدتك اليوم؟" },
    approved: true,
  },
});
check(
  "chat_intro.language moves to a code with chat_language",
  withIntro.chat_intro?.language === "ar",
  String(withIntro.chat_intro?.language)
);
check(
  "so the two still match",
  withIntro.chat_intro?.language === withIntro.chat_language,
  "a mismatch here silently falls every greeting back to English"
);

console.log(bad ? `\n${bad} FAILING` : "\nall language tests passed");
process.exit(bad ? 1 : 0);
