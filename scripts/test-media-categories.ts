// Tests for matching photos by the category they are filed under.
//
// A business files entries into categories and reasonably expects that to
// mean something. One real tenant has "Before and after" under Hair
// transplant, beside "Before and after ( dental implants )" and "Before
// and after ( Hollywood smile )" under Dental treatment. Matching on
// titles alone meant the hair photo could never be matched or offered,
// and nothing told the owner why.
//
// The invariant these tests exist for: a category may RESOLVE an entry
// whose title names nothing, and must never OVERRIDE a title that does.
//
//   npx tsx scripts/test-media-categories.ts

import { decideMedia, rankByRequest, type MediaCandidate } from "../lib/chat-media";
import type { ChatTurn } from "../lib/conversation-state";

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

const u = (c: string): ChatTurn => ({ role: "user", content: c });
const a = (c: string): ChatTurn => ({ role: "assistant", content: c });
const img = (url: string) => ({ url, type: "image/jpeg" });

const BA_IMPLANTS = "https://example.test/ba-implants.jpg";
const BA_HOLLYWOOD = "https://example.test/ba-hollywood.jpg";
const BA_HAIR = "https://example.test/ba-hair.jpg";

/** The real tenant's shape: two labelled dental cases, one unlabelled hair case. */
const CATALOGUE: MediaCandidate[] = [
  {
    title: "Before and after ( dental implants )",
    category: "Dental treatment",
    content: "Before and after results from full mouth dental implant treatment.",
    media: [img(BA_IMPLANTS)],
  },
  {
    title: "Before and after ( Hollywood smile )",
    category: "Dental treatment",
    content: "Before and after results from Hollywood smile veneer treatment.",
    media: [img(BA_HOLLYWOOD)],
  },
  {
    title: "Before and after",
    category: "Hair transplant",
    content: "Before and after",
    media: [img(BA_HAIR)],
  },
  {
    title: "Hair transplant for male",
    category: "Hair transplant",
    content: "FUE hair transplant for male pattern baldness, with results visible within a year.",
    media: [],
  },
  {
    title: "Teeth whitening",
    category: "Dental treatment",
    content: "Professional whitening in a single appointment.",
    media: [],
  },
];

const HAIR_VISITOR = u("I'm looking into a hair transplant, my hairline has been receding for years");
const IMPLANT_VISITOR = u("I'm looking at full mouth dental implants, I've lost most of my upper teeth");
const VENEER_VISITOR = u("I want a hollywood smile, veneers on my front teeth");

const sendsUrl = (history: ChatTurn[]) => {
  const d = decideMedia(history, CATALOGUE, new Set());
  return d.send ? d.url : `nothing (${d.reason})`;
};

console.log("--- the category resolves an entry whose title names nothing ---");
check(
  "a hair visitor asking for before-and-afters gets the hair case",
  sendsUrl([HAIR_VISITOR, a("That's very common."), u("can I see some before and afters?")]) === BA_HAIR,
  sendsUrl([HAIR_VISITOR, a("That's very common."), u("can I see some before and afters?")])
);
check(
  "a hair visitor accepting a hair offer gets the hair case",
  sendsUrl([
    HAIR_VISITOR,
    a("Would you like to see a before and after from one of our hair transplant patients?"),
    u("yes please"),
  ]) === BA_HAIR
);

console.log("\n--- and never reaches visitors it does not belong to ---");
check(
  "an implant visitor still gets the implant case",
  sendsUrl([IMPLANT_VISITOR, a("That's very treatable."), u("can I see some before and afters?")]) === BA_IMPLANTS
);
check(
  "a veneers visitor still gets the Hollywood case",
  sendsUrl([VENEER_VISITOR, a("Lovely."), u("can I see some before and afters?")]) === BA_HOLLYWOOD
);
check(
  "the hair case scores zero for an implant visitor",
  (rankByRequest(IMPLANT_VISITOR.content, CATALOGUE).find((r) => r.entry.media[0]?.url === BA_HAIR)?.score ?? -1) === 0
);

console.log("\n--- the invariant: a category never touches a title that names something ---");
// Remove every labelled entry's category and nothing may move. Both dental
// cases share "Dental treatment"; if that counted, an implant visitor
// saying "dental" would reach the Hollywood case through it.
const withoutLabelledCategories = CATALOGUE.map((e) =>
  e.title === "Before and after" ? e : { ...e, category: null }
);
const requests = [
  IMPLANT_VISITOR.content,
  VENEER_VISITOR.content,
  "can I see a dental treatment before and after?",
  "I'd like to see your dental work",
  "show me the treatment results",
];
let moved = 0;
for (const request of requests) {
  const withCats = rankByRequest(request, CATALOGUE);
  const without = rankByRequest(request, withoutLabelledCategories);
  for (const entry of CATALOGUE.filter((e) => e.title !== "Before and after")) {
    const x = withCats.find((r) => r.entry.title === entry.title)!.score;
    const y = without.find((r) => r.entry.title === entry.title)!.score;
    if (Math.abs(x - y) > 1e-12) {
      moved++;
      console.log(`        moved: "${entry.title}" on "${request}": ${y.toFixed(3)} -> ${x.toFixed(3)}`);
    }
  }
}
check("no labelled entry's score changes because of its category", moved === 0, `${moved} changed`);

const dentalWord = rankByRequest("can I see a dental treatment before and after?", CATALOGUE);
check(
  "saying the category's own words does not lift a labelled case",
  dentalWord.find((r) => r.entry.title.includes("Hollywood"))!.score ===
    rankByRequest("can I see a dental treatment before and after?", withoutLabelledCategories).find((r) =>
      r.entry.title.includes("Hollywood")
    )!.score
);

console.log("\n--- a category-derived match never outranks a real title ---");
const withNamedHairCase: MediaCandidate[] = [
  ...CATALOGUE,
  {
    title: "Hair transplant results",
    category: "Hair transplant",
    content: "Results from FUE hair transplant patients.",
    media: [img("https://example.test/hair-named.jpg")],
  },
];
const hairRanked = rankByRequest("hair transplant", withNamedHairCase);
const named = hairRanked.find((r) => r.entry.title === "Hair transplant results")!.score;
const byCategory = hairRanked.find((r) => r.entry.title === "Before and after")!.score;
check(
  "a title naming hair transplant outranks one only filed under it",
  named > byCategory && byCategory > 0,
  `named ${named.toFixed(3)} vs category ${byCategory.toFixed(3)}`
);

console.log("\n--- what counts as naming nothing ---");
const labelless = (title: string): MediaCandidate[] => [
  ...CATALOGUE.filter((e) => e.media[0]?.url !== BA_HAIR),
  { title, category: "Hair transplant", content: "", media: [img(BA_HAIR)] },
];
for (const title of ["", "Our results", "Gallery", "Real patient photos"]) {
  const score = rankByRequest(HAIR_VISITOR.content, labelless(title)).find((r) => r.entry.media[0]?.url === BA_HAIR)!.score;
  check(`${JSON.stringify(title)} is reached through its category`, score > 0, score.toFixed(3));
}
const noCategory = CATALOGUE.map((e) => (e.title === "Before and after" ? { ...e, category: null } : e));
check(
  "with no category, an unlabelled entry is exactly as unreachable as before",
  (rankByRequest(HAIR_VISITOR.content, noCategory).find((r) => r.entry.media[0]?.url === BA_HAIR)?.score ?? -1) === 0
);

console.log(bad ? `\n${bad} FAILING` : "\nall category tests passed");
process.exit(bad ? 1 : 0);
