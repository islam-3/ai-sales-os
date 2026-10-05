// What counts as one reply's worth, and what does not.
//
//   npx tsx scripts/test-reply-density.ts
//
// The number this produces decides whether a brake fires, so the number
// has to mean something. The first version of it did not: a reply laid
// out as a list ran as one long "sentence", every line's opening word
// scored as a proper name, and a Turkish reply measured 10 names it did
// not contain. It inflated exactly the replies that were walls, so the
// bar still looked right — which is the dangerous kind of wrong.

import { replyDensity, isOverloaded, DENSITY_MAX_UNITS, DENSITY_MAX_BLOCKS } from "../lib/reply-density";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

console.log("--- names are names, not sentence openings ---");
check(
  "an ordinary English reply scores no names",
  replyDensity("That makes sense. We can help with that. Take your time.").names === 0,
  JSON.stringify(replyDensity("That makes sense. We can help with that. Take your time."))
);
check(
  "a brand mid-sentence does",
  replyDensity("We use Straumann implants for that.").names === 1
);
check(
  "a line break is a sentence boundary",
  replyDensity("Visit one\nImplants are placed\nVisit two\nCrowns are fitted").names === 0,
  `got ${JSON.stringify(replyDensity("Visit one\nImplants are placed\nVisit two\nCrowns are fitted"))}` +
    " — each line opens a sentence, so none of those are names"
);
check(
  "and a brand inside a list line still counts",
  replyDensity("Visit two\nThe permanent Straumann crowns are fitted").names === 1
);
check(
  "English 'I' is not a name",
  replyDensity("Yes I can help with that.").names === 0
);
check(
  "repeats count once",
  replyDensity("We use Straumann implants, and we have used Straumann for years.").names === 1,
  // Both mentions are mid-sentence here, which is the case that matters:
  // a brand said twice is still one thing to remember. The first draft
  // of this test put the repeat at a sentence start, where it is skipped
  // for a different reason, so it proved nothing.
  JSON.stringify(replyDensity("We use Straumann implants, and we have used Straumann for years."))
);

console.log("\n--- figures ---");
check("digits are counted", replyDensity("It takes 5 days and then 7 days.").figures === 2);
check(
  "the same figure twice is one",
  replyDensity("5 days, and another 5 days.").figures === 1
);
check(
  "Arabic-Indic digits count the same",
  replyDensity("تستغرق ٥ أيام ثم ٧ أيام.").figures === 2,
  JSON.stringify(replyDensity("تستغرق ٥ أيام ثم ٧ أيام."))
);
check(
  "a spelled-out number is NOT counted",
  replyDensity("It takes two visits.").figures === 0,
  "a known and deliberate undercount — the bar is calibrated on the same measure"
);

console.log("\n--- non-Latin scripts ---");
check(
  "Cyrillic capitals are not names",
  replyDensity("Это Наша клиника. Мы поможем.").names === 0,
  `got ${replyDensity("Это Наша клиника. Мы поможем.").names}` +
    " — a mid-sentence capital is not a name marker in Russian"
);
check(
  "but a Latin brand inside a Chinese reply is",
  replyDensity("我们使用 Straumann 种植体。").names === 1,
  JSON.stringify(replyDensity("我们使用 Straumann 种植体。"))
);
check(
  "and inside an Arabic reply",
  replyDensity("نستخدم غرسات Straumann السويسرية.").names === 1
);

console.log("\n--- blocks ---");
check("one paragraph is one block", replyDensity("A single line.").blocks === 1);
check(
  "a seven-line list is seven",
  replyDensity("a\nb\nc\nd\ne\nf\ng").blocks === 7
);
check(
  "blank lines between paragraphs do not inflate it",
  replyDensity("First para.\n\nSecond para.").blocks === 2
);

console.log("\n--- the bar ---");
const ordinary = "That makes complete sense. Take the time you need, and the team will be here whenever you are ready.";
check("an ordinary reply is not overloaded", !isOverloaded(ordinary), JSON.stringify(replyDensity(ordinary)));

// The shape that was actually reported: stages, brands, warranties and a
// question, all in one.
const wall = [
  "Visit one (5 days)",
  "The Straumann implants are placed under sedation, with temporary teeth the same day.",
  "Healing (4 months)",
  "The implants fuse with the bone.",
  "Visit two (7 days)",
  "The permanent Zirkon crowns are fitted, with a 10 year guarantee on the crowns and a lifetime guarantee on the implants from Implant Swiss.",
  "Do you have a panoramic X-ray already?",
].join("\n");
check("the reported wall is", isOverloaded(wall), JSON.stringify(replyDensity(wall)));

const denseParagraph =
  "We use Straumann implants and Zirkon crowns from Implant Swiss, over 5 days then 7 days, 4 months apart, in Istanbul.";
check(
  "a dense paragraph with no layout is caught on units alone",
  isOverloaded(denseParagraph) && replyDensity(denseParagraph).blocks === 1,
  JSON.stringify(replyDensity(denseParagraph))
);
check(
  "and a sparse document is caught on layout alone",
  isOverloaded("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight"),
  JSON.stringify(replyDensity("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight"))
);

console.log(`\n(bars: ${DENSITY_MAX_UNITS} units, ${DENSITY_MAX_BLOCKS} blocks)`);
console.log(bad ? `\n${bad} FAILING` : "\nall reply-density tests passed");
process.exit(bad ? 1 : 0);
