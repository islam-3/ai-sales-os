// The welcome message, as one piece of prose and a list of buttons.
//
//   npx tsx scripts/test-greeting-prose.ts
//
// What this replaced: fifteen separately translatable strings — an
// opener, an opener with a city in it, a line inviting the visitor to
// write, and a label for each category we could recognise — assembled at
// render time with {business} and {place} substituted in. Every piece
// existed because WE needed it translatable independently, and the
// business owner paid for it with a fifteen-field form for a welcome
// message.
//
// The three decisions worth holding still are all tested here:
//
//   1. the prose is LITERAL. No placeholders, no inference about which
//      words are the business name. A rename is handled by telling the
//      owner, not by rewriting their sentence.
//   2. chips ABSENT means derive, chips EMPTY means none. Without that
//      distinction, deleting every chip regenerates them.
//   3. a machine translation is the ONLY thing that waits for approval.
//      Anything the owner typed is theirs and goes live.

import { buildChatIntro, deriveChips, firstSentenceOf } from "../lib/chat-intro";
import { readFileSync } from "fs";
import { join } from "path";
import {
  greetingNeedsReview,
  storedGreetingFor,
  translationSourceFor,
  type StoredGreeting,
} from "../lib/chat-intro-i18n";
import { buildGreetingSuggestionPrompt, buildGreetingTranslationPrompt } from "../lib/greeting-prompts";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
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

const withGreeting = (greetings: Record<string, unknown>, language = "en") =>
  buildChatIntro({
    ...BUSINESS,
    settings: parseTenantSettings({
      chat_language: language,
      location: { city: "Istanbul" },
      chat_intro: { language, sourceHash: "x", strings: { help: "h" }, greetings },
    }),
  });

console.log("--- the owner's prose is what a visitor reads ---");
const PROSE = "Welcome to Prof Clinic in Istanbul. We look after patients from all over the world. What brings you here?";
const live = withGreeting({ en: { text: PROSE, approved: true } });
check("word for word, with nothing substituted", live.greeting === PROSE, live.greeting);
check(
  "the business name is just words in the sentence",
  !live.greeting.includes("{business}") && !live.greeting.includes("{place}"),
  "no placeholder survives into anything a visitor sees"
);
check(
  "the first sentence becomes the headline",
  live.title === "Welcome to Prof Clinic in Istanbul.",
  live.title
);
check("and the rest is the body", live.sub.startsWith("We look after"), live.sub);

console.log("\n--- it beats the old fifteen-string assembly ---");
check(
  "prose wins when it exists",
  withGreeting({ en: { text: PROSE, approved: true } }).greeting === PROSE
);
const noProse = buildChatIntro({
  ...BUSINESS,
  settings: parseTenantSettings({ chat_language: "en", location: { city: "Istanbul" } }),
});
check(
  "and the old assembly still runs when it does not",
  noProse.greeting === "Hi! We're Prof Clinic in Istanbul. We treat international patients in Istanbul. How can we help you today?",
  // A tenant this migration misses keeps exactly today's greeting
  // rather than getting a blank page.
  noProse.greeting
);
check(
  "a greeting stored for ANOTHER language is not used",
  withGreeting({ ar: { text: "مرحبا", approved: true } }, "en").greeting !== "مرحبا"
);
check("an empty one is treated as absent", withGreeting({ en: { text: "   ", approved: true } }).greeting !== "   ");

console.log("\n--- approval is only for words we wrote ---");
check(
  "an unread machine translation is NOT shown",
  withGreeting({ en: { text: PROSE, approved: false } }).greeting !== PROSE,
  "it is in a language we cannot check and nobody has read it"
);
check(
  "what the owner saved IS shown",
  withGreeting({ en: { text: PROSE, approved: true } }).greeting === PROSE
);

console.log("\n--- chips: absent, set, or deliberately none ---");
check(
  "absent means derive from the knowledge base",
  withGreeting({ en: { text: PROSE, approved: true } }).chips.includes("Dental treatment"),
  JSON.stringify(withGreeting({ en: { text: PROSE, approved: true } }).chips)
);
check(
  "a stored list is used exactly",
  JSON.stringify(withGreeting({ en: { text: PROSE, chips: ["One", "Two"], approved: true } }).chips) ===
    JSON.stringify(["One", "Two"])
);
check(
  "an EMPTY list means no buttons at all",
  withGreeting({ en: { text: PROSE, chips: [], approved: true } }).chips.length === 0,
  "without this, deleting every chip regenerates them and reads as a bug"
);
check(
  "and the derived list is still available to offer",
  deriveChips({
    ...BUSINESS,
    settings: parseTenantSettings({ chat_language: "en" }),
  }).includes("Dental treatment")
);

console.log("\n--- storedGreetingFor is the only door ---");
const greetings = { ar: { text: "مرحبا", approved: true } as StoredGreeting };
check("a language with prose gets it", storedGreetingFor(greetings, "ar")?.text === "مرحبا");
check("a name resolves to the same bucket as a code", storedGreetingFor(greetings, "Arabic")?.text === "مرحبا");
check("a language without gets null", storedGreetingFor(greetings, "en") === null);
check("no greetings at all is null", storedGreetingFor(undefined, "ar") === null);
check("no language named is null", storedGreetingFor(greetings, "") === null);

console.log("\n--- a rename is told, never inferred ---");
const wrote = { businessName: "Prof Clinic", place: "Istanbul" };
const stored = (over: Partial<StoredGreeting> = {}): StoredGreeting => ({
  text: PROSE,
  approved: true,
  wroteWith: wrote,
  ...over,
});
check(
  "nothing changed, nothing said",
  greetingNeedsReview(stored(), { businessName: "Prof Clinic", place: "Istanbul" }) === null
);
check(
  "a renamed business is flagged, and named as the name",
  greetingNeedsReview(stored(), { businessName: "Prof Dental", place: "Istanbul" })?.name === true
);
check(
  "a moved business is flagged as the city",
  greetingNeedsReview(stored(), { businessName: "Prof Clinic", place: "Ankara" })?.place === true
);
check(
  "both at once",
  (() => {
    const r = greetingNeedsReview(stored(), { businessName: "X", place: "Y" });
    return r?.name === true && r?.place === true;
  })()
);
check(
  "a greeting from before the snapshot existed says nothing",
  greetingNeedsReview(stored({ wroteWith: undefined }), { businessName: "X", place: "Y" }) === null,
  "a reminder nobody can act on is worse than silence"
);
check(
  "and the prose is never rewritten",
  (() => {
    const renamed = buildChatIntro({
      ...BUSINESS,
      businessName: "Totally Different Name",
      settings: parseTenantSettings({
        chat_language: "en",
        chat_intro: {
          language: "en",
          sourceHash: "x",
          strings: { help: "h" },
          greetings: { en: { text: PROSE, approved: true } },
        },
      }),
    });
    return renamed.greeting === PROSE;
  })(),
  "only its author knows which words are the name"
);

console.log("\n--- the first sentence, in every script ---");
check("English", firstSentenceOf("Welcome to Prof Clinic. We help people.") === "Welcome to Prof Clinic.");
check(
  "Chinese, which puts no space after 。",
  firstSentenceOf("欢迎光临。我们可以帮您。") === "欢迎光临。",
  firstSentenceOf("欢迎光临。我们可以帮您。")
);
check(
  "Arabic, which may end on ؟",
  firstSentenceOf("كيف يمكننا مساعدتك؟ نحن هنا.") === "كيف يمكننا مساعدتك؟",
  firstSentenceOf("كيف يمكننا مساعدتك؟ نحن هنا.")
);
check("one sentence is all headline", firstSentenceOf("Welcome.") === "Welcome.");
check("no punctuation at all still works", firstSentenceOf("Welcome") === "Welcome");

console.log("\n--- what the model is allowed to do ---");
const suggestion = buildGreetingSuggestionPrompt({
  businessName: "Prof Clinic",
  industry: "Dental clinic",
  description: "We treat international patients.",
  city: "Istanbul",
  country: "Turkey",
  categories: ["Dental treatment"],
  language: "English",
});
check("it is given the business's own details", suggestion.includes("Prof Clinic"));
check(
  "and told to invent nothing",
  /Do not invent a service, a number, a guarantee/.test(suggestion),
  "the same rule as prices, phone numbers and photographs"
);
check(
  "told to write the name as ordinary words",
  /Do not use placeholders or brackets/.test(suggestion),
  "there is nothing to substitute into any more"
);
check("and to keep it short", /under \d+ characters/.test(suggestion));
check(
  "it is NOT asked for the chips",
  !/chip/i.test(suggestion),
  "a chip is a claim about what the business offers, and the categories already say"
);

const translation = buildGreetingTranslationPrompt({
  text: PROSE,
  chips: ["Dental treatment"],
  language: "Arabic",
});
check("translation names the target language", /into Arabic/.test(translation));
check(
  "it DOES carry the chips",
  /chips/.test(translation),
  "a button reading English under an Arabic greeting is the half-translated state"
);
check(
  "the business name is not translated",
  /NAME stays exactly as it is written/.test(translation)
);
check("and nothing may be added", /Do not add a service, a number or a claim/.test(translation));

// ─────────────────────────────────────────────────────────────────────
// The Translate button: when it appears, and what it translates FROM
//
// It used to translate whatever was in the editor into the chat
// language, with no notion of a source at all. On a tenant whose chat
// language was English and whose greeting was English, it offered to
// translate English into English.
//
// Decided entirely from which language key a greeting is filed under —
// never by reading the words. Guessing a language from prose is the
// interpretation that {business} placeholders were removed to avoid.
// ─────────────────────────────────────────────────────────────────────

console.log("\n--- is there anything to translate? ---");

const g = (over: Partial<StoredGreeting> = {}): StoredGreeting => ({
  text: "some words",
  approved: true,
  ...over,
});

check(
  "English greeting, English chat: nothing to do",
  translationSourceFor({ en: g() }, "en") === null,
  "this was the bug — it offered to translate English into English"
);
check(
  "English greeting, Arabic chat: translate from English",
  translationSourceFor({ en: g() }, "ar")?.language === "en"
);
check(
  "already translated and saved: nothing to do",
  translationSourceFor({ en: g(), ar: g({ origin: "translated" }) }, "ar") === null
);
check(
  "no greetings at all: nothing to do",
  translationSourceFor({}, "ar") === null,
  "there is nothing of the owner's to translate; Suggest wording is the action"
);
check("no chat language: nothing to do", translationSourceFor({ en: g() }, "") === null);
check(
  "a greeting that is only whitespace is not a source",
  translationSourceFor({ en: g({ text: "   " }) }, "ar") === null
);
check(
  "a language NAME resolves to the same answer as its code",
  translationSourceFor({ en: g() }, "Arabic")?.language === "en"
);

console.log("\n--- re-translating one that is not live yet ---");
const notLive = { en: g(), ar: g({ approved: false, origin: "translated" as const }) };
check(
  "normally there is nothing to do once a translation exists",
  translationSourceFor(notLive, "ar") === null
);
check(
  "but an UNAPPROVED one can be redone from the original",
  translationSourceFor(notLive, "ar", { ignoreExisting: true })?.language === "en",
  "redoing a bad translation must start from the original, not from itself"
);

console.log("\n--- never translating a translation ---");
// The case origin exists for: the owner writes English, approves an
// Arabic translation of it, then switches the chat language to Russian.
// Picking the most recent greeting would translate the ARABIC, which
// compounds whatever the first translation got wrong.
const compounded = {
  en: g({ origin: "written" as const, savedAt: 1000 }),
  ar: g({ origin: "translated" as const, savedAt: 2000 }),
};
check(
  "the authored English wins over the newer Arabic translation",
  translationSourceFor(compounded, "ru")?.language === "en",
  `got ${translationSourceFor(compounded, "ru")?.language}`
);
check(
  "a suggestion the owner saved counts as authored",
  translationSourceFor(
    {
      en: g({ origin: "translated" as const, savedAt: 3000 }),
      tr: g({ origin: "suggested" as const, savedAt: 1000 }),
    },
    "ru"
  )?.language === "tr",
  "they read it and saved it, so it is theirs"
);
check(
  "the most recent of two authored greetings wins",
  translationSourceFor(
    {
      en: g({ origin: "written" as const, savedAt: 1000 }),
      tr: g({ origin: "written" as const, savedAt: 5000 }),
    },
    "ru"
  )?.language === "tr"
);
check(
  "a translation is used only when there is nothing else",
  translationSourceFor(
    {
      ar: g({ origin: "translated" as const, savedAt: 1000 }),
      tr: g({ origin: "translated" as const, savedAt: 5000 }),
    },
    "ru"
  )?.language === "tr",
  "better than refusing to do anything"
);

console.log("\n--- rows written before origin and savedAt existed ---");
check(
  "a greeting with no origin counts as authored",
  translationSourceFor(
    { en: g({ savedAt: 1000 }), ar: g({ origin: "translated" as const, savedAt: 9000 }) },
    "ru"
  )?.language === "en",
  "it is what the owner had live, so it is as close to authored as we have"
);
check(
  "a missing savedAt sorts last rather than first",
  translationSourceFor(
    { en: g({ origin: "written" as const }), tr: g({ origin: "written" as const, savedAt: 1 }) },
    "ru"
  )?.language === "tr",
  "an unknown date is not evidence of recency"
);
check(
  "two unknown dates prefer the source language",
  translationSourceFor({ ar: g(), en: g(), tr: g() }, "ru")?.language === "en",
  // Every migrated row has no savedAt, so without this the winner came
  // from JSON key order. On a real tenant that picked a 633-character
  // Arabic greeting over the English it had been derived from.
  `got ${translationSourceFor({ ar: g(), en: g(), tr: g() }, "ru")?.language}`
);
check(
  "and with no English, alphabetically rather than arbitrarily",
  translationSourceFor({ tr: g(), ar: g() }, "ru")?.language === "ar",
  "key order in a JSON object is not a decision"
);
check(
  "a real savedAt still beats the source-language preference",
  translationSourceFor({ en: g(), tr: g({ savedAt: 5000 }) }, "ru")?.language === "tr",
  "the tie-break is only for ties"
);

console.log("\n--- the card and the server agree on the source ---");
const cardSrc = readFileSync(
  join(process.cwd(), "components/dashboard/business/ChatGreetingCard.tsx"),
  "utf8"
);
const actionsSrc = readFileSync(join(process.cwd(), "app/dashboard/business/actions.ts"), "utf8");
check(
  "the card shows the button from translationSourceFor",
  /translationSourceFor\(greetings, language, \{\s*ignoreExisting: awaitingReview,?\s*\}\)/.test(cardSrc)
);
check(
  "and names both languages on it",
  /Translate from \$\{languageName\(translateFrom\.language\)/.test(cardSrc),
  "which language it is translating FROM is the thing that was missing"
);
check(
  "the server decides the source itself rather than trusting the client",
  /const source = translationSourceFor\(settings\.chat_intro\?\.greetings, language\)/.test(actionsSrc) &&
    /export async function translateGreeting\(\): Promise/.test(actionsSrc),
  "otherwise the label the owner read and the text actually sent could disagree"
);
check(
  "a save records where the words came from",
  /origin: fromSuggestion \? "suggested" : "written"/.test(actionsSrc)
);
check(
  "and a translation records that it is one",
  /origin: "translated"/.test(actionsSrc),
  "which is what stops it being used as a source later"
);
check(
  "typing in another language is deliberately not detected",
  /Deliberately not checked/.test(actionsSrc),
  "reading the prose to guess its language is the interpretation this card removed"
);

console.log("\n--- built from the page's own components ---");
check(
  "the shared SectionCard, not a local one",
  /<SectionCard/.test(cardSrc) && !/function Card\(/.test(cardSrc),
  "the local card had no bg-card or shadow, so it sat darker than the card above it"
);
check("the action sits in the footer strip", /<SectionCardFooter/.test(cardSrc));
check(
  "and says the same thing as every other card",
  /Save changes/.test(cardSrc)
);
check(
  "every button is size=sm, as the rest of the page is",
  (cardSrc.match(/<Button\b/g) ?? []).length ===
    (cardSrc.match(/size="sm"/g) ?? []).length + (cardSrc.match(/size="icon"/g) ?? []).length,
  "default-size buttons were visibly taller than Save changes above"
);
check(
  "the shared Textarea, not a raw one",
  /<Textarea/.test(cardSrc) && !/<textarea/.test(cardSrc)
);
check(
  "and notices use the dashboard's warning tokens, not one-off amber",
  /border-warning\/30 bg-warning\/10/.test(cardSrc) && !/amber-/.test(cardSrc),
  "hard-coded amber does not flip with the theme"
);

console.log(bad ? `\n${bad} FAILING` : "\nall greeting-prose tests passed");
process.exit(bad ? 1 : 0);
