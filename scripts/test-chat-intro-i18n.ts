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
  blockedFromPublishing,
  buildChatIntroTranslationPrompt,
  builtInTranslation,
  chatIntroStatus,
  chatIntroSourceHash,
  isRtlText,
  ownLabel,
  resolveChatIntroStrings,
  resolveIntroLine,
  staleKeys,
  translationIsCurrent,
  validateTranslation,
  type ChatIntroStrings,
  type ChatIntroTranslation,
} from "../lib/chat-intro-i18n";
import { parseTenantSettings } from "../lib/tenant-settings";
import { detectScript, scriptForLanguage } from "../lib/visitor-language";
import { chipPlanFor, deriveIntroLine } from "../lib/chat-intro";
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

console.log("\n--- the owner can see what visitors are actually getting ---");
// A tenant that picks Russian and never approves is greeting Russian
// visitors in English. The only thing worse than that is it being
// invisible on the dashboard.
const status = (over: Record<string, unknown>) =>
  chatIntroStatus(parseTenantSettings(over) as { chat_language?: string; chat_intro?: ChatIntroTranslation });

const none = status({});
check("no language chosen reads as plain English", none.showing === "english" && none.pending === null);

const ungenerated = status({ chat_language: "Russian" });
check(
  "a language with nothing generated is flagged, not silently English",
  ungenerated.showing === "english" && ungenerated.pending === "not-generated",
  JSON.stringify(ungenerated)
);

const builtInPending = status({ chat_language: "Turkish" });
check(
  "a hand-written fallback is reported as such",
  builtInPending.showing === "built-in" && builtInPending.pending === "not-generated",
  JSON.stringify(builtInPending)
);

const unapproved = status({ chat_language: "Deutsch", chat_intro: stored({ approved: false }) });
check(
  "generated but unapproved is NOT live",
  unapproved.showing === "english" && unapproved.pending === "awaiting-approval",
  JSON.stringify(unapproved)
);

const approved = status({ chat_language: "Deutsch", chat_intro: stored({}) });
check("approved is live", approved.showing === "approved" && approved.pending === null);

const outOfDate = status({ chat_language: "Deutsch", chat_intro: stored({ sourceHash: "old" }) });
check(
  "an out-of-date translation is flagged",
  outOfDate.pending === "out-of-date",
  JSON.stringify(outOfDate)
);

const switched = status({ chat_language: "Russian", chat_intro: stored({}) });
check(
  "switching language invalidates the old translation",
  switched.pending === "not-generated",
  JSON.stringify(switched)
);

console.log("\n--- only the strings whose English changed are stale ---");
check("nothing stale when the source matches", staleKeys(stored({})).length === 0);
const drifted = stored({ source: { ...CHAT_INTRO_SOURCE, help: "How may we help?" } });
check(
  "exactly the changed string is stale",
  JSON.stringify(staleKeys(drifted)) === JSON.stringify(["help"]),
  JSON.stringify(staleKeys(drifted))
);
check(
  "a translation stored without its source is wholly stale, not wrongly trusted",
  staleKeys(stored({ source: {} })).length === Object.keys(CHAT_INTRO_SOURCE).length
);

console.log("\n--- English can never be published as another language ---");
// The card pre-filled its fields with the English fallback and kept them
// after a successful generation, so one press of "Approve & make live"
// would have stored English AND marked it live as the Arabic greeting.
const blocked = (language: string, strings: ChatIntroStrings) =>
  blockedFromPublishing(language, strings, (text) => detectScript([text]), scriptForLanguage);

const arabicStrings: ChatIntroStrings = {
  ...CHAT_INTRO_SOURCE,
  opener_with_place: "أهلاً! نحن {business} في {place}.",
  opener: "أهلاً! نحن {business}.",
  // Deliberately NOT the same wording as the hand-written Arabic table:
  // an identical string would make "was the generated one used?" and "was
  // the fallback used?" indistinguishable.
  help: "كيف نستطيع خدمتك؟",
};

check(
  "the untouched English source cannot go live as Arabic",
  blocked("Arabic", { ...CHAT_INTRO_SOURCE }) === "unchanged-from-english"
);
check(
  "nor as German, where script cannot tell them apart",
  blocked("Deutsch", { ...CHAT_INTRO_SOURCE }) === "unchanged-from-english",
  "the equality rule is what covers Latin-script languages"
);
check(
  "an English greeting with one chip edited is still caught by script",
  blocked("Arabic", { ...CHAT_INTRO_SOURCE, chip_team: "الفريق" }) === "wrong-script"
);
check("a real Arabic translation publishes", blocked("Arabic", arabicStrings) === null);
check(
  "chips left in English do not block a translated greeting",
  blocked("Arabic", { ...arabicStrings, chip_hours: "Opening hours" }) === null,
  "a one-word chip is a wording choice; a whole greeting in English is not"
);
check(
  "a language with no script rule is not blocked on script",
  blocked("Swahili", { ...CHAT_INTRO_SOURCE, help: "Tunawezaje kukusaidia?" }) === null
);

console.log("\n--- the server refuses it too, not just the button ---");
const actionsSrc = readFileSync(join(process.cwd(), "app/dashboard/business/actions.ts"), "utf8");
check(
  "approval is checked server-side",
  /if \(approved\) \{[\s\S]{0,400}blockedFromPublishing\(/.test(actionsSrc),
  "a disabled button is a suggestion"
);
check("and says why it refused", /still the English wording/.test(actionsSrc));

console.log("\n--- only the chips a tenant actually shows ---");
const dental = chipPlanFor(["Dental treatment", "Our history", "before_after", "pricing"]);
check(
  "recognised categories map to keys",
  dental.keys.includes("chip_about") && dental.keys.includes("chip_before_after"),
  JSON.stringify(dental)
);
check(
  "an owner-written category is listed separately and never translated",
  dental.ownWords.includes("Dental treatment"),
  JSON.stringify(dental.ownWords)
);
check(
  "never more than a visitor sees",
  dental.keys.length + dental.ownWords.length <= 4,
  JSON.stringify(dental)
);
const empty = chipPlanFor([]);
check(
  "a tenant with no categories falls back",
  empty.keys.length === 3 && empty.ownWords.length === 0,
  JSON.stringify(empty)
);
check(
  "the same label is never offered twice",
  new Set(chipPlanFor(["our_history", "about", "story"]).keys).size ===
    chipPlanFor(["our_history", "about", "story"]).keys.length
);

console.log("\n--- the owner's own words, in their own language ---");
// An Arabic greeting above buttons reading "Dental treatment", beside a
// city reading "Istanbul", is half-translated. These are business details
// though, so nothing but the owner may write them.
const withLabels = parseTenantSettings({
  chat_language: "Arabic",
  location: { city: "Istanbul" },
  chat_intro: stored({
    language: "Arabic",
    strings: arabicStrings,
    ownLabels: { Istanbul: "إسطنبول", "Dental treatment": "زراعة الأسنان" },
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
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { Istanbul: "إسطنبول" } }),
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
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, approved: false, ownLabels: { Istanbul: "إسطنبول" } }),
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
  chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: { Istanbul: "إسطنبول" } }),
});
check(
  "labels written for another language are not reused",
  !buildChatIntro({ ...BUSINESS, settings: otherLanguage }).title.includes("إسطنبول")
);

check(
  "they survive a settings round-trip",
  parseTenantSettings({ chat_intro: stored({ ownLabels: { Istanbul: "إسطنبول" } }) }).chat_intro
    ?.ownLabels.Istanbul === "إسطنبول"
);

console.log("\n--- translating again must not discard them ---");
const actionsSrc2 = readFileSync(join(process.cwd(), "app/dashboard/business/actions.ts"), "utf8");
check(
  "generation carries the owner's labels across",
  /ownLabels:\s*\n?\s*settings\.chat_intro\?\.language/.test(actionsSrc2),
  "they are not something the model produced, so regenerating must not throw them away"
);
check(
  "saving drops an empty label rather than storing it",
  /if \(trimmed\) cleanedLabels\[key\] = trimmed;/.test(actionsSrc2)
);

console.log("\n--- the prompt says what the ambiguous strings mean ---");
check(
  "about is explained as about the company",
  /about this company/.test(buildChatIntroTranslationPrompt("Arabic")),
  "a generated draft rendered it as \"about the project\", which reads oddly for a clinic"
);
check(
  "but the tenant's industry is never sent",
  !/industry/i.test(buildChatIntroTranslationPrompt("Arabic")),
  "business details in a cached translation would make changing one invalidate the other"
);

console.log("\n--- the line drawn from the description ---");
// It is a whole sentence of the owner's own prose. Nothing may translate
// it but them, and an English sentence sitting inside an Arabic greeting
// is worse than a greeting one sentence shorter.
const DERIVED = deriveIntroLine(BUSINESS.description, BUSINESS.businessName);
check("the dashboard can see the line the greeting derives", DERIVED === BUSINESS.description, String(DERIVED));
check("no description means no line to offer", deriveIntroLine(null, "Prof Clinic") === null);

const arabicIntro = (labels: Record<string, string>) =>
  buildChatIntro({
    ...BUSINESS,
    settings: parseTenantSettings({
      chat_language: "Arabic",
      chat_intro: stored({ language: "Arabic", strings: arabicStrings, ownLabels: labels }),
    }),
  });

const OWN_ARABIC = "نعالج المرضى الدوليين في إسطنبول.";
check(
  "the owner's own version is what the visitor reads",
  arabicIntro({ [BUSINESS.description]: OWN_ARABIC }).sub.includes(OWN_ARABIC),
  arabicIntro({ [BUSINESS.description]: OWN_ARABIC }).sub
);
check(
  "and the English it replaces is gone",
  !arabicIntro({ [BUSINESS.description]: OWN_ARABIC }).sub.includes(BUSINESS.description)
);
check(
  "left empty, an English sentence is dropped from an Arabic greeting",
  !arabicIntro({}).sub.includes(BUSINESS.description),
  arabicIntro({}).sub
);
check(
  "and the rest of the greeting still stands",
  arabicIntro({}).sub.includes(arabicStrings.help),
  "a missing sentence, not a missing greeting"
);
check(
  "a blank label counts as empty, not as a translation",
  !arabicIntro({ [BUSINESS.description]: "   " }).sub.includes(BUSINESS.description)
);

// English tenants are exactly where they were.
check(
  "a matching script keeps the line",
  intro({}).sub.includes(BUSINESS.description),
  intro({}).sub
);

// The rule in isolation: it may only drop what it can PROVE is wrong.
check(
  "a language whose script we cannot name keeps the line",
  resolveIntroLine("We treat patients.", {}, "Klingon") === "We treat patients."
);
check(
  "a line we cannot read a script from keeps it",
  resolveIntroLine("2024 — 100%.", {}, "Arabic") === "2024 — 100%."
);
check(
  "a proven mismatch, and only that, drops it",
  resolveIntroLine("We treat patients.", {}, "Arabic") === null
);
check(
  "the owner's own words are never second-guessed",
  resolveIntroLine("We treat patients.", { "We treat patients.": "Anything they wrote" }, "Arabic") ===
    "Anything they wrote",
  "even in the wrong script, it is their sentence to write"
);
check("no labels at all still applies the script rule", resolveIntroLine("We treat patients.", undefined, "Arabic") === null);

console.log("\n--- the preview shows what the chat shows ---");
// The English sentence reached a live Arabic greeting because the card
// never rendered this line at all.
const cardSrc = readFileSync(join(process.cwd(), "components/dashboard/business/ChatGreetingCard.tsx"), "utf8");
check("the preview resolves the line the same way the greeting does", /resolveIntroLine\(introLine, labels, language\)/.test(cardSrc));
check("and the owner can write it there", /onChange=\{\(e\) => onChange\(introLine, e\.target\.value\)\}/.test(cardSrc));

console.log(bad ? `\n${bad} FAILING` : "\nall chat-intro-i18n tests passed");




process.exit(bad ? 1 : 0);
