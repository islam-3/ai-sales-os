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
import {
  greetingNeedsReview,
  storedGreetingFor,
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

console.log(bad ? `\n${bad} FAILING` : "\nall greeting-prose tests passed");
process.exit(bad ? 1 : 0);
