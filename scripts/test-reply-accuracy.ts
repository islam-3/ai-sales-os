// Tests for figures in a reply that cannot be traced to the business.
//
// Watching only, for now — so what matters most is that the log is
// readable enough to decide enforcement from. The distinction it has to
// get right is invention versus reformatting: a price nobody quoted is a
// wrong number given to a patient, while "5.000" where the entry says
// "5,000" is the same number rewritten. Those want opposite answers.
//
//   npx tsx scripts/test-reply-accuracy.ts

import { readFileSync } from "fs";
import { join } from "path";
import { classifyFigure, untracedFigures } from "../lib/reply-accuracy";

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

const SOURCE = [
  "Dental implants take two visits: five days for placement, then a healing period of four months,",
  "then seven days for the permanent crowns. Packages start at around 5,000 EUR and include a",
  "5-star hotel. We have 15 years of experience and a 20 year warranty on crowns.",
  "User: I'd come over in March 2026",
].join(" ");

console.log("--- figures that are in the material are left alone ---");
check(
  "a price quoted from the knowledge base",
  untracedFigures("Packages start at around 5,000 EUR.", SOURCE).length === 0
);
check(
  "a date the visitor themselves gave",
  untracedFigures("March 2026 works well for a first visit.", SOURCE).length === 0
);
check(
  "small counts are never flagged",
  untracedFigures("It runs across 2 visits with 7 days for the second.", SOURCE).length === 0,
  "these are re-renderings of words, not figures anyone acts on"
);
check("a reply with no figures at all", untracedFigures("We would be glad to help.", SOURCE).length === 0);

console.log("\n--- an invented figure is caught, with what it is ---");
const invented = untracedFigures("Our packages are around 7,500 EUR all in.", SOURCE);
check("it is reported", invented.length === 1, JSON.stringify(invented));
check("classified as a price", invented[0]?.kind === "price");
check("the sentence comes with it", invented[0]?.sentence.includes("7,500"), invented[0]?.sentence);
check(
  "and it is marked as NOT a reformatting",
  invented[0]?.digitsInSource === false,
  "nothing in the business's material carries those digits at all"
);

console.log("\n--- a reformatting is caught but told apart ---");
const localised = untracedFigures("Die Pakete beginnen bei etwa 5.000 EUR.", SOURCE);
check("it is reported", localised.length === 1, JSON.stringify(localised));
check(
  "but marked as the same digits in another form",
  localised[0]?.digitsInSource === true,
  "5,000 rewritten as 5.000 - the same figure, and a different decision from an invented one"
);

console.log("\n--- what kind of figure it is ---");
check("a currency symbol makes it a price", classifyFigure("7,500", "It costs €7,500 in total.") === "price");
check("so does the word cost", classifyFigure("7,500", "The cost is 7,500 all in.") === "price");
check("a year is a date", classifyFigure("2027", "You could come in 2027.") === "date");
check("a month name makes it a date", classifyFigure("2027", "March 2027 is open.") === "date");
check("a slashed date is a date", classifyFigure("12/03/2027", "On 12/03/2027.") === "date");
check("units make it a count", classifyFigure("120", "That is 120 implants placed.") === "count");
check("anything else is other", classifyFigure("9090", "Reference 9090 applies.") === "other");
check(
  "a price beats a count when both could apply",
  classifyFigure("5,000", "The package is 5,000 EUR for 12 days.") === "price",
  "the money is the number a patient acts on"
);

console.log("\n--- duplicates are reported once ---");
const repeated = untracedFigures("It is 7,500 EUR. Yes, 7,500 EUR all in.", SOURCE);
check("the same figure twice is one entry", repeated.length === 1, JSON.stringify(repeated));

console.log("\n--- structural: it observes and does not act ---");
const routeSrc = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
check("the route measures it", /const untraced = untracedFigures\(reply, figureSource\);/.test(routeSrc));
// Scoped to the code AFTER the measurement. The loose version of this
// check matched SAFE_FALLBACK in an unrelated import and proved nothing.
const afterMeasuring = routeSrc.slice(routeSrc.indexOf("const untraced ="));
check(
  "the reply is never reassigned once it has been measured",
  !/\breply\s*=[^=]/.test(afterMeasuring),
  "enforcement waits on the measurement"
);
check(
  "the finding is logged and nothing else",
  /console\.warn\("\[chat\] figures with no source"/.test(routeSrc) &&
    !/untraced\.length > 0[\s\S]{0,400}SAFE_FALLBACK/.test(routeSrc)
);
check(
  "the source is the business's own material and the conversation",
  /knowledgeEntries\.map\(\(e\) => `\$\{e\.title\} \$\{e\.content\}`\)/.test(routeSrc)
);

console.log(bad ? `\n${bad} FAILING` : "\nall reply-accuracy tests passed");
process.exit(bad ? 1 : 0);
