// Guided data entry: the question set, and what state each one is in.
//
//   npx tsx scripts/test-guided-questions.ts
//
// The problem: businesses paste their website's marketing copy into the
// knowledge base and do not realise the operational answers customers
// actually ask about are missing. The assistant looks weak and the
// platform gets blamed.
//
// Everything below is pure. The question set is fixed in code and will
// later define when a lead is complete, so it has to be stable and
// testable rather than generated per tenant.

import {
  ALL_CATEGORIES,
  CORE_QUESTIONS,
  INDUSTRY_PACKS,
  packForIndustry,
  questionByKey,
  questionsFor,
} from "../lib/guided-questions";
import { guidedProgress, type Declines, type GuidedEntry } from "../lib/guided-progress";

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ─────────────────────────────────────────────────────────────────────
// The core set stands on its own
// ─────────────────────────────────────────────────────────────────────

console.log("--- a business whose industry has no pack ---");

for (const industry of ["Plumber", "Law firm", "Car rental", "Bakery", "", null]) {
  check(
    `${JSON.stringify(industry).padEnd(14)} gets the full core set, not a reduced one`,
    questionsFor(industry).length === CORE_QUESTIONS.length,
    `got ${questionsFor(industry).length}, core is ${CORE_QUESTIONS.length}`
  );
}
check("and no pack is claimed for it", packForIndustry("Plumber") === null);
check(
  "with the neutral wording intact",
  questionsFor("Plumber").find((q) => q.key === "people")?.prompt ===
    CORE_QUESTIONS.find((q) => q.key === "people")?.prompt
);
check("ten core questions", CORE_QUESTIONS.length === 10, `${CORE_QUESTIONS.length}`);
check(
  "every one has a prompt, a reason, a title and examples",
  CORE_QUESTIONS.every((q) => q.prompt && q.why && q.entryTitle && q.examples)
);
check(
  "and their keys are unique",
  new Set(CORE_QUESTIONS.map((q) => q.key)).size === CORE_QUESTIONS.length
);

console.log("\n--- a pack is an overlay, never a replacement ---");
const clinic = questionsFor("Dental clinic");
check("every core question survives", CORE_QUESTIONS.every((c) => clinic.some((q) => q.key === c.key)));
check("the clinic pack adds two", clinic.length === CORE_QUESTIONS.length + 2, `${clinic.length}`);
check(
  "wording is overridden where the pack says so",
  clinic.find((q) => q.key === "people")?.prompt.includes("doctors") === true,
  clinic.find((q) => q.key === "people")?.prompt
);
check(
  "and kept where it does not",
  clinic.find((q) => q.key === "if_wrong")?.entryTitle ===
    CORE_QUESTIONS.find((q) => q.key === "if_wrong")?.entryTitle
);
check(
  "an override cannot drop a required field",
  clinic.every((q) => q.prompt && q.why && q.entryTitle && q.examples)
);
for (const industry of ["Dental clinic", "dentist", "Hair transplant", "Aesthetic surgery", "medical centre"]) {
  check(`${industry.padEnd(20)} matches the clinic pack`, packForIndustry(industry)?.id === "clinic");
}
check("a plumber does not", packForIndustry("Plumber") === null);
check(
  "no pack adds more than two questions",
  INDUSTRY_PACKS.every((p) => (p.extra ?? []).length <= 2),
  "a pack that adds six is a second core set"
);

// ─────────────────────────────────────────────────────────────────────
// "We don't offer this" only where it is a fact about the business
// ─────────────────────────────────────────────────────────────────────

console.log("\n--- where a negative is offered, and its exact words ---");

const core = (k: string) => CORE_QUESTIONS.find((q) => q.key === k)!;

check("included has one", core("included").notOffered?.sentence === "The price covers just the service itself. Nothing else is bundled with it.");
check("excluded has its OWN, not a shared one", core("excluded").notOffered?.sentence === "There are no extra costs beyond the quoted price.");
check(
  "and the two differ",
  core("included").notOffered!.sentence !== core("excluded").notOffered!.sentence,
  "they are different questions and need different answers"
);
check(
  "guarantee has one",
  core("guarantee").notOffered?.sentence === "This business does not offer a guarantee or warranty on this."
);
check(
  "materials has NONE",
  core("materials").notOffered === undefined,
  // "This business has not named particular brands" is a fact about the
  // form, not about the business, and a visitor reading it hears an
  // unserious operation. Silence is better.
  "a visitor must never be told the owner left a field blank"
);
for (const key of ["pricing", "duration", "if_wrong", "people", "not_a_fit", "to_quote"]) {
  check(
    `${key.padEnd(10)} has no negative — every business has an answer`,
    core(key).notOffered === undefined,
    "offering one invites a skip where the truth is 'I have not written it yet'"
  );
}
check(
  "the clinic travel question has one, for a clinic with no travellers",
  questionByKey("travel", "Dental clinic")?.notOffered?.sentence ===
    "This business does not arrange travel, transfers or accommodation."
);
check(
  "every negative sentence is a statement about the BUSINESS",
  [...CORE_QUESTIONS, ...(INDUSTRY_PACKS[0].extra ?? [])]
    .filter((q) => q.notOffered)
    .every((q) => !/not (yet )?(written|filled|answered|provided)/i.test(q.notOffered!.sentence)),
  "never a statement about the form being incomplete"
);

// ─────────────────────────────────────────────────────────────────────
// Pricing shapes
// ─────────────────────────────────────────────────────────────────────

console.log("\n--- the three pricing shapes ---");
const shapes = core("pricing").shapes ?? [];
check("there are three", shapes.length === 3, `${shapes.length}`);
check("fixed, range, on assessment", shapes.map((s) => s.id).join(",") === "fixed,range,on_assessment");
check("fixed asks for the figures", shapes[0].needsText === true);
check("range asks for the drivers", shapes[1].needsText === true);
check(
  "quoting on assessment needs no typing at all",
  shapes[2].needsText === false,
  "the confident version of 'it depends' has to be words we chose"
);
check(
  "and carries a sentence of its own",
  (shapes[2].sentence ?? "").length > 60 && !/unfortunately|sorry|cannot/i.test(shapes[2].sentence ?? ""),
  shapes[2].sentence
);
check(
  "which states it as a method, not a refusal",
  /priced individually/i.test(shapes[2].sentence ?? "") && /exact/i.test(shapes[2].sentence ?? "")
);
check(
  "and routes to what the business needs in order to quote",
  shapes[2].thenAsk === "to_quote",
  "quoting on assessment is only honest if the business says what it needs"
);
check("the other two route nowhere", !shapes[0].thenAsk && !shapes[1].thenAsk);

// ─────────────────────────────────────────────────────────────────────
// The state table
// ─────────────────────────────────────────────────────────────────────

console.log("\n--- the five states ---");

const entry = (over: Partial<GuidedEntry> = {}): GuidedEntry => ({
  id: "e1",
  questionKey: "guarantee",
  category: "Dental treatment",
  answerKind: "answered",
  content: "20 years on the crowns.",
  ...over,
});

const progressOf = (entries: GuidedEntry[], declines: Declines = {}, categories = ["Dental treatment", "Hair transplant"]) =>
  guidedProgress(questionsFor("Dental clinic"), entries, declines, categories);

const stateOf = (p: ReturnType<typeof progressOf>, key: string) =>
  p.questions.find((q) => q.question.key === key)!;

check("open: nothing said", stateOf(progressOf([]), "guarantee").byCategory.length === 0);
check("open is not resolved", stateOf(progressOf([]), "guarantee").resolved === false);
check("answered", stateOf(progressOf([entry()]), "guarantee").byCategory[0].state === "answered");
check(
  "we don't offer this",
  stateOf(progressOf([entry({ answerKind: "not_offered" })]), "guarantee").byCategory[0].state === "not_offered"
);
check(
  "an entry that already existed, confirmed by the owner",
  stateOf(progressOf([entry({ answerKind: "existing" })]), "guarantee").byCategory[0].state === "existing"
);
check(
  "prefer not to say",
  stateOf(progressOf([], { guarantee: ["Dental treatment"] }), "guarantee").byCategory[0].state === "declined"
);
check(
  "and it stores NO content",
  stateOf(progressOf([], { guarantee: ["Dental treatment"] }), "guarantee").byCategory[0].content === undefined,
  "silence has to be silent — a row saying the owner declined would reach a customer"
);
check(
  "all four resolve the question",
  (["answered", "not_offered", "existing"] as const).every(
    (k) => stateOf(progressOf([entry({ answerKind: k })]), "guarantee").resolved
  ) && stateOf(progressOf([], { guarantee: [null] }), "guarantee").resolved,
  "a decline is the owner dealing with it, not ignoring it"
);
check(
  "an answer beats a decline for the same category",
  stateOf(progressOf([entry()], { guarantee: ["Dental treatment"] }), "guarantee").byCategory.length === 1,
  "if they wrote something and once declined, the thing they wrote is the truth"
);

console.log("\n--- progress counts resolved, not answered ---");
const mixed = progressOf(
  [entry({ id: "a", questionKey: "pricing" }), entry({ id: "b", questionKey: "included", answerKind: "not_offered" })],
  { materials: [null] }
);
check("three dealt with", mixed.resolved === 3, `${mixed.resolved}`);
check("out of twelve for a clinic", mixed.total === 12, `${mixed.total}`);
check("and ten for everyone else", guidedProgress(questionsFor("Plumber"), [], {}, []).total === 10);

// ─────────────────────────────────────────────────────────────────────
// Category scoping, including negatives
// ─────────────────────────────────────────────────────────────────────

console.log("\n--- an answer belongs to a category ---");

const dentalOnly = progressOf([entry({ category: "Dental treatment" })]);
check(
  "answering for one category leaves the other open",
  stateOf(dentalOnly, "guarantee").openCategories.join(",") === "Hair transplant",
  stateOf(dentalOnly, "guarantee").openCategories.join(",")
);
check(
  "but the question is resolved — one service line is enough",
  stateOf(dentalOnly, "guarantee").resolved === true,
  "a business with one category must not sit at nine out of ten forever"
);
check(
  "a second answer for the same question is a second row",
  stateOf(
    progressOf([entry({ id: "a" }), entry({ id: "b", category: "Hair transplant", content: "No guarantee on grafts." })]),
    "guarantee"
  ).byCategory.length === 2
);
check(
  "and then nothing is left open",
  stateOf(
    progressOf([entry({ id: "a" }), entry({ id: "b", category: "Hair transplant" })]),
    "guarantee"
  ).openCategories.length === 0
);

console.log("\n--- a NEGATIVE is scoped exactly like an answer ---");
const negDental = progressOf([entry({ answerKind: "not_offered", category: "Dental treatment" })]);
check(
  "\"we don't offer a guarantee\" on dental says nothing about hair",
  negDental.questions.find((q) => q.question.key === "guarantee")!.openCategories.join(",") === "Hair transplant",
  // The failure this prevents: a warranty answered in dental terms
  // served to a hair-transplant visitor as fact.
  "a negative must not leak across service lines any more than an answer does"
);
check(
  "a declined category is scoped too",
  stateOf(progressOf([], { guarantee: ["Dental treatment"] }), "guarantee").openCategories.join(",") ===
    "Hair transplant"
);

console.log("\n--- all categories is an explicit choice ---");
const everywhere = progressOf([entry({ category: ALL_CATEGORIES })]);
check("stored as null, not a magic string", entry({ category: ALL_CATEGORIES }).category === null);
check(
  "it closes every category at once",
  stateOf(everywhere, "guarantee").openCategories.length === 0
);
check("and shows as one row, not one per category", stateOf(everywhere, "guarantee").byCategory.length === 1);
check(
  "a tenant with no categories has no per-category gaps",
  stateOf(progressOf([], {}, []), "guarantee").openCategories.length === 0,
  "there is nothing to scope to, which is correct rather than a hole"
);
check(
  "category matching ignores case and spacing",
  stateOf(progressOf([entry({ category: " dental TREATMENT " })]), "guarantee").openCategories.join(",") ===
    "Hair transplant"
);

console.log(bad ? `\n${bad} FAILING` : "\nall guided-question tests passed");
process.exit(bad ? 1 : 0);
