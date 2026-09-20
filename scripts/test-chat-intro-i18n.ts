// Tests for the greeting and starter chips in the tenant's own language.
//
// The rule these all circle: only FIXED strings are translated. The
// business's name, city, description and its own category names are the
// owner's words and pass through untouched, which is what makes it
// impossible for a generated translation to invent a business detail.
//
//   npx tsx scripts/test-chat-intro-i18n.ts

import { buildChatIntro } from "../lib/chat-intro";
import {
  CHAT_INTRO_SOURCE,
  buildChatIntroTranslationPrompt,
  builtInTranslation,
  chatIntroSourceHash,
  isRtlText,
  resolveChatIntroStrings,
  translationIsCurrent,
  validateTranslation,
  type ChatIntroStrings,
  type ChatIntroTranslation,
} from "../lib/chat-intro-i18n";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const BUSINESS = {
  businessName: "Prof Clinic",
  industry: "Dental clinic",
  description: "We treat international patients in Istanbul.",
  categories: ["Dental treatment", "Our history", "before_after"],
};

const intro = (settings: Record<string, unknown>) =>
  buildChatIntro({ ...BUSINESS, settings: parseTenantSettings(settings) });

console.log("--- English is unchanged for every existing tenant ---");
const english = intro({});
check(
  "the opener is exactly what it was",
  english.title === "Hi! We're Prof Clinic.",
  english.title
);
check("the sub still ends with the help line", english.sub.endsWith("How can we help you today?"), english.sub);
check(
  "the opener uses the city when there is one",
  intro({ location: { city: "Istanbul" } }).title === "Hi! We're Prof Clinic in Istanbul."
);
check(
  "recognised categories become English labels",
  english.chips.includes("About the business") && english.chips.includes("See before & after"),
  JSON.stringify(english.chips)
);
// "Dental treatment" matches no pattern, so it is the owner's own wording
// and is shown as they wrote it - in English here, but in their language
// for a tenant who writes their categories in one.
check(
  "an unrecognised category keeps the owner's own words",
  english.chips.includes("Dental treatment"),
  JSON.stringify(english.chips)
);

console.log("\n--- a chosen language, with no translation stored yet ---");
const turkish = intro({ chat_language: "Turkish", location: { city: "Istanbul" } });
check("falls back to the hand-written Turkish", turkish.sub.includes("Size nasıl yardımcı olabiliriz?"), turkish.sub);
check("the business name is NOT translated", turkish.title.includes("Prof Clinic"), turkish.title);
check("the city is NOT translated", turkish.title.includes("Istanbul"), turkish.title);
check(
  "the owner's description passes through as written",
  turkish.sub.includes("We treat international patients in Istanbul."),
  turkish.sub
);
check("recognised chips come through translated", turkish.chips.includes("Öncesi ve sonrası"), JSON.stringify(turkish.chips));
check(
  "and an owner-written category is still never translated",
  turkish.chips.includes("Dental treatment"),
  JSON.stringify(turkish.chips)
);

const arabic = intro({ chat_language: "Arabic" });
check("Arabic falls back to the hand-written Arabic", arabic.sub.includes("كيف يمكننا مساعدتك اليوم؟"), arabic.sub);
check("and still names the business in its own name", arabic.title.includes("Prof Clinic"), arabic.title);

const german = intro({ chat_language: "Deutsch" });
check(
  "a language with no hand-written table falls back to English",
  german.title === "Hi! We're Prof Clinic." && german.sub.endsWith("How can we help you today?"),
  german.title
);

console.log("\n--- a stored translation is only used when it is signed off ---");
const strings: ChatIntroStrings = { ...CHAT_INTRO_SOURCE, help: "Wie können wir helfen?", opener: "Hallo! Wir sind {business}." };
const stored = (over: Partial<ChatIntroTranslation>): ChatIntroTranslation => ({
  language: "Deutsch",
  sourceHash: chatIntroSourceHash(),
  strings,
  source: { ...CHAT_INTRO_SOURCE },
  approved: true,
  ...over,
});

check("an approved, current translation is used", resolveChatIntroStrings("Deutsch", stored({})).help === "Wie können wir helfen?");
check(
  "an UNAPPROVED one is never shown to a visitor",
  resolveChatIntroStrings("Deutsch", stored({ approved: false })).help === CHAT_INTRO_SOURCE.help,
  "the owner speaks the language and we do not; their sign-off is what makes it fit to display"
);
check(
  "one written for another language is not used",
  resolveChatIntroStrings("Deutsch", stored({ language: "Türkçe" })).help === CHAT_INTRO_SOURCE.help
);
check(
  "one translated from older English copy is not used",
  resolveChatIntroStrings("Deutsch", stored({ sourceHash: "stale" })).help === CHAT_INTRO_SOURCE.help
);
check(
  "language matching ignores case and spacing",
  translationIsCurrent(stored({ language: "  deutsch " }), "Deutsch")
);
check(
  "it survives a settings round-trip",
  parseTenantSettings({ chat_language: "Deutsch", chat_intro: stored({}) }).chat_intro?.strings.help ===
    "Wie können wir helfen?"
);
check(
  "an approval flag cannot be faked by a malformed row",
  parseTenantSettings({ chat_intro: { language: "x", sourceHash: "y", strings: { help: "h" } } }).chat_intro
    ?.approved === false
);

console.log("\n--- business details cannot invalidate a translation ---");
const withDetails = buildChatIntro({
  ...BUSINESS,
  businessName: "Renamed Clinic",
  description: "Something else entirely.",
  settings: parseTenantSettings({ chat_language: "Deutsch", chat_intro: stored({}), location: { city: "Ankara" } }),
});
check(
  "renaming the business still uses the same translation",
  withDetails.sub.includes("Wie können wir helfen?") && withDetails.title.includes("Renamed Clinic"),
  withDetails.title
);
check("and the new city is substituted, not translated", withDetails.title.includes("Ankara"), withDetails.title);

console.log("\n--- what a generated translation has to satisfy ---");
const valid = { ...CHAT_INTRO_SOURCE, opener: "Hallo! Wir sind {business}.", opener_with_place: "Hallo! Wir sind {business} in {place}." };
check("a well-formed translation is accepted", validateTranslation(valid) !== null);
check(
  "a placeholder replaced with a real name is rejected",
  validateTranslation({ ...valid, opener: "Hallo! Wir sind Prof Clinic." }) === null,
  "it would be cached and shown to every visitor of every tenant"
);
check("a dropped placeholder is rejected", validateTranslation({ ...valid, opener: "Hallo!" }) === null);
check("an extra placeholder is rejected", validateTranslation({ ...valid, help: "Hallo {place}?" }) === null);
check("a missing key is rejected", validateTranslation({ ...valid, chip_team: undefined }) === null);
check("an empty string is rejected", validateTranslation({ ...valid, chip_team: "   " }) === null);
check("a paragraph where a chip should be is rejected", validateTranslation({ ...valid, chip_team: "x".repeat(201) }) === null);
check("a non-object is rejected", validateTranslation("nope") === null);

console.log("\n--- the translation prompt ---");
const prompt = buildChatIntroTranslationPrompt("Deutsch");
check("names the target language", /into Deutsch/.test(prompt));
check("forbids substituting a real name", /never substitute a real name/i.test(prompt));
check("carries the exact source strings", prompt.includes(CHAT_INTRO_SOURCE.help));
check("asks for JSON only", /Respond with the JSON object only/.test(prompt));

console.log("\n--- editing the English source invalidates translations of it ---");
const changed = chatIntroSourceHash({ ...CHAT_INTRO_SOURCE, help: "How may we help?" });
check("the hash moves when a string changes", changed !== chatIntroSourceHash());
check("and is stable when nothing changes", chatIntroSourceHash() === chatIntroSourceHash());

console.log("\n--- direction is judged by script, not by a language name ---");
check("Arabic reads right-to-left", isRtlText(builtInTranslation("Arabic")!.help));
check("Hebrew reads right-to-left", isRtlText("כיצד נוכל לעזור?"));
check("Turkish does not", !isRtlText(builtInTranslation("Turkish")!.help));
check("English does not", !isRtlText(CHAT_INTRO_SOURCE.help));
check("a name in Latin script inside Arabic text still reads RTL", isRtlText("مرحباً! نحن Prof Clinic."));

console.log(bad ? `\n${bad} FAILING` : "\nall chat-intro-i18n tests passed");
process.exit(bad ? 1 : 0);
