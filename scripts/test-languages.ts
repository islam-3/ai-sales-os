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
  searchLanguages,
} from "../lib/languages";

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

console.log(bad ? `\n${bad} FAILING` : "\nall language tests passed");
process.exit(bad ? 1 : 0);
