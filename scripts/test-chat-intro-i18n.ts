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
  builtInTranslation,
  chatIntroSourceHash,
  isRtlText,
  labelsForLanguage,
  ownLabel,
  resolveChatIntroStrings,
  resolveIntroLine,
  translationIsCurrent,
  type ChatIntroStrings,
  type ChatIntroTranslation,
} from "../lib/chat-intro-i18n";
import { parseTenantSettings } from "../lib/tenant-settings";
import { detectScript, scriptForLanguage } from "../lib/visitor-language";

import { readFileSync } from "fs";
import { join } from "path";

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
  ownLabels: {},
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

console.log("\n--- the owner's own words, in their own language ---");
const arabicStrings: ChatIntroStrings = {
  ...CHAT_INTRO_SOURCE,
  opener_with_place: "أهلاً! نحن {business} في {place}.",
  opener: "أهلاً! نحن {business}.",
  // Deliberately NOT the hand-written Arabic table's wording: an
  // identical string would make "was the stored one used?" and "was the
  // fallback used?" indistinguishable.
  help: "كيف نستطيع خدمتك؟",
};

// An Arabic greeting above buttons reading "Dental treatment", beside a
// city reading "Istanbul", is half-translated. These are business details
// though, so nothing but the owner may write them.
const withLabels = parseTenantSettings({
  chat_language: "Arabic",
  location: { city: "Istanbul" },
  chat_intro: stored({
    language: "Arabic",
    strings: arabicStrings,
    ownLabels: { ar: { Istanbul: "إسطنبول", "Dental treatment": "زراعة الأسنان" } },
  }),
});
const localised = buildChatIntro({ ...BUSINESS, settings: withLabels });
check("the city reads in the chat language", localised.title.includes("إسطنبول"), localised.title);
check("the business name still does not", localised.title.includes("Prof Clinic"), localised.title);
check(
  "an owner-written category chip reads in the chat language",
  localised.chips.includes("زراعة الأسنان"),
  JSON.stringify(localised.chips)
);

const partial = parseTenantSettings({
  chat_language: "Arabic",
  location: { city: "Istanbul" },
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { ar: { Istanbul: "إسطنبول" } } }),
});
const partialIntro = buildChatIntro({ ...BUSINESS, settings: partial });
check(
  "anything left empty keeps the original, never a guess",
  partialIntro.chips.includes("Dental treatment"),
  JSON.stringify(partialIntro.chips)
);

check("a blank label falls back", ownLabel("Istanbul", { Istanbul: "   " }) === "Istanbul");
check("a missing one falls back", ownLabel("Istanbul", {}) === "Istanbul");
check("no labels at all falls back", ownLabel("Istanbul", undefined) === "Istanbul");

const unapprovedLabels = parseTenantSettings({
  chat_language: "Arabic",
  location: { city: "Istanbul" },
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, approved: false, ownLabels: { ar: { Istanbul: "إسطنبول" } } }),
});
const unapprovedIntro = buildChatIntro({ ...BUSINESS, settings: unapprovedLabels });
check(
  "owner-written labels apply without waiting for sign-off",
  unapprovedIntro.title.includes("إسطنبول"),
  "there is nothing generated to review in them"
);
check(
  "while the generated greeting still waits for it",
  !unapprovedIntro.sub.includes(arabicStrings.help),
  unapprovedIntro.sub
);

const otherLanguage = parseTenantSettings({
  chat_language: "Russian",
  location: { city: "Istanbul" },
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { ar: { Istanbul: "إسطنبول" } } }),
});
check(
  "labels written for another language are not reused",
  !buildChatIntro({ ...BUSINESS, settings: otherLanguage }).title.includes("إسطنبول")
);

check(
  "they survive a settings round-trip",
  parseTenantSettings({ chat_intro: stored({ ownLabels: { ar: { Istanbul: "إسطنبول" } } }) })
    .chat_intro?.ownLabels.ar.Istanbul === "إسطنبول"
);

console.log("\n--- own words belong to a language ---");

const ARABIC_WORDS = {
  Istanbul: "اسطنبول",
  "Dental treatment": "علاج الاسنان",
  [BUSINESS.description]: "نعالج المرضى الدوليين.",
};

/** Exactly the reported situation: Arabic words, English chat language. */
const switchedToEnglish = parseTenantSettings({
  chat_language: "en",
  location: { city: "Istanbul" },
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { ar: ARABIC_WORDS } }),
});
const afterSwitch = buildChatIntro({ ...BUSINESS, settings: switchedToEnglish });

check(
  "the city reads in the chosen language, not the old one",
  afterSwitch.title.includes("Istanbul") && !afterSwitch.title.includes("اسطنبول"),
  afterSwitch.title
);
check(
  "the chips do too",
  afterSwitch.chips.includes("Dental treatment") && !afterSwitch.chips.some((c) => /[\u0600-\u06FF]/.test(c)),
  JSON.stringify(afterSwitch.chips)
);
check(
  "and the description line falls back to the original",
  afterSwitch.sub.includes(BUSINESS.description),
  // Asked for explicitly: an untranslated original beats another
  // language's words.
  afterSwitch.sub
);
check(
  "nothing Arabic survives anywhere in the greeting",
  !/[\u0600-\u06FF]/.test(afterSwitch.greeting),
  afterSwitch.greeting
);

const switchedBack = buildChatIntro({
  ...BUSINESS,
  settings: parseTenantSettings({
    chat_language: "ar",
    location: { city: "Istanbul" },
    chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { ar: ARABIC_WORDS } }),
  }),
});
check(
  "switching back restores them rather than having cleared them",
  switchedBack.title.includes("اسطنبول"),
  switchedBack.title
);

check(
  "two languages' words coexist",
  (() => {
    const both = parseTenantSettings({
      chat_language: "en",
      location: { city: "Istanbul" },
      chat_intro: stored({
        language: "English",
        strings: { ...CHAT_INTRO_SOURCE },
        ownLabels: { ar: { Istanbul: "اسطنبول" }, en: { Istanbul: "Istanbul, Türkiye" } },
      }),
    });
    return buildChatIntro({ ...BUSINESS, settings: both }).title.includes("Istanbul, Türkiye");
  })()
);

console.log("\n--- labelsForLanguage is the only door ---");
check("a language with words gets them", labelsForLanguage({ ar: { a: "ب" } }, "ar").a === "ب");
check("a language with none gets an empty map", Object.keys(labelsForLanguage({ ar: { a: "ب" } }, "en")).length === 0);
check("a name resolves to the same bucket as a code", labelsForLanguage({ ar: { a: "ب" } }, "Arabic").a === "ب");
check("no stored words at all is empty", Object.keys(labelsForLanguage(undefined, "ar")).length === 0);
check("no language named is empty", Object.keys(labelsForLanguage({ ar: { a: "ب" } }, "")).length === 0);

console.log("\n--- the old flat shape migrates, losing nothing ---");
const migrated = parseTenantSettings({
  chat_language: "en",
  chat_intro: stored({
    language: "Arabic",
    strings: arabicStrings,
    // The shape every existing row is in: flat, no language.
    ownLabels: { Istanbul: "اسطنبول", "Dental treatment": "علاج الاسنان" } as never,
  }),
});
check(
  "a flat map is filed under the translation's own language",
  migrated.chat_intro?.ownLabels.ar?.Istanbul === "اسطنبول",
  JSON.stringify(migrated.chat_intro?.ownLabels)
);
check(
  "so it does not leak into the newly chosen one",
  Object.keys(labelsForLanguage(migrated.chat_intro?.ownLabels, "en")).length === 0
);
check(
  "and the owner never has to retype it",
  Object.keys(labelsForLanguage(migrated.chat_intro?.ownLabels, "ar")).length === 2
);
check(
  "a language NAME as the outer key normalises to its code",
  parseTenantSettings({
    chat_intro: stored({ ownLabels: { Arabic: { Istanbul: "اسطنبول" } } as never }),
  }).chat_intro?.ownLabels.ar?.Istanbul === "اسطنبول",
  "otherwise 'Arabic' and 'ar' become two buckets for one language"
);

console.log(bad ? `\n${bad} FAILING` : "\nall chat-intro-i18n tests passed");
process.exit(bad ? 1 : 0);
