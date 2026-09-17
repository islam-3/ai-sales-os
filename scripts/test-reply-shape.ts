// Tests for the reply-shape signal.
//
// Reply form was the one thing in the conversation still left to prompt
// wording, and the wording ("let your replies look different") measurably
// did nothing. Shape is countable, so it is computed and stated as fact.
// These fixtures pin what counts as the same shape, what change is
// proposed, and — as importantly — every situation where the signal must
// stay out of the way.
//
//   npx tsx scripts/test-reply-shape.ts

import {
  buildConversationStateBlock,
  detectRepeatedShape,
  shapeChanges,
  shapeOf,
  type ChatTurn,
} from "../lib/conversation-state";

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
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

/** Two paragraphs, then a question — the exact mould that made conversations uniform. */
const INFO_THEN_ASK = (n = 60) => `${words(n / 2)}.\n\n${words(n / 2 - 5)} what matters most to you?`;
const ONE_LINE_STATEMENT = "That makes complete sense, and it is very common.";
const ONE_LINE_QUESTION = "Where are you travelling from?";

console.log("--- shapeOf ---");
check("counts two paragraphs", shapeOf(INFO_THEN_ASK()).paragraphs === 2);
check("counts one paragraph", shapeOf(ONE_LINE_STATEMENT).paragraphs === 1);
check("three or more collapse to 3", shapeOf("a.\n\nb.\n\nc.\n\nd.").paragraphs === 3);
check("detects a closing question", shapeOf(INFO_THEN_ASK()).endsWithQuestion);
check("a question mid-reply is not a closing question", !shapeOf("Why? Because it lasts.").endsWithQuestion);
check("short band", shapeOf(words(30)).length === "short");
check("medium band", shapeOf(words(60)).length === "medium");
check("long band", shapeOf(words(120)).length === "long");
check("blank lines with spaces still split paragraphs", shapeOf("one.\n  \ntwo.").paragraphs === 2);

console.log("\n--- detectRepeatedShape ---");
check(
  "two info-then-ask replies in a row repeat",
  detectRepeatedShape([u("hi"), a(INFO_THEN_ASK(60)), u("ok"), a(INFO_THEN_ASK(80)), u("and?")]) !== null
);
check(
  "different lengths in the same mould still repeat",
  detectRepeatedShape([u("hi"), a(INFO_THEN_ASK(40)), u("ok"), a(INFO_THEN_ASK(100)), u("and?")]) !== null
);
check(
  "a statement after a question breaks the pattern",
  detectRepeatedShape([u("hi"), a(INFO_THEN_ASK()), u("ok"), a(`${words(20)}.\n\n${words(20)}.`), u("and?")]) === null
);
check(
  "one paragraph after two breaks the pattern",
  detectRepeatedShape([u("hi"), a(INFO_THEN_ASK()), u("ok"), a(ONE_LINE_QUESTION), u("UK")]) === null
);
check("a single reply is not a pattern", detectRepeatedShape([u("hi"), a(INFO_THEN_ASK()), u("ok")]) === null);
check(
  "the opening greeting is not counted as a reply",
  detectRepeatedShape([a(INFO_THEN_ASK()), u("hi"), a(INFO_THEN_ASK()), u("ok")]) === null
);

console.log("\n--- shapeChanges ---");
const two = shapeOf(INFO_THEN_ASK(60));
check(
  "info-then-ask: drop the question and the second paragraph",
  JSON.stringify(shapeChanges(two, two, false)) ===
    JSON.stringify(["end it on a statement rather than a question", "keep it to a single paragraph"])
);
check(
  "a needed question is never taken away",
  !shapeChanges(two, two, true).some((c) => /statement/.test(c)) &&
    shapeChanges(two, two, true).includes("keep it to a single paragraph")
);
const longTwo = shapeOf(`${words(60)}.\n\n${words(60)}.`);
check("two long replies: make it shorter", shapeChanges(longTwo, longTwo, false).includes("make it clearly shorter than the last two"));
const bareQ = shapeOf(ONE_LINE_QUESTION);
check(
  "two bare questions while a question is needed: give it substance",
  shapeChanges(bareQ, bareQ, true).some((c) => /substance/.test(c))
);
const oneStatement = shapeOf(ONE_LINE_STATEMENT);
check(
  "two short statements are not a problem to fix",
  shapeChanges(oneStatement, oneStatement, false).length === 0
);

console.log("\n--- in the state block ---");
const repeatingHistory = [u("hi, I'm looking at implants"), a(INFO_THEN_ASK(60)), u("ok"), a(INFO_THEN_ASK(70)), u("right")];
const block = buildConversationStateBlock(repeatingHistory, [], null);
check("fires on a repeated shape", !!block && /same shape as each other/.test(block), block ?? "null");
check("states the shape as fact", !!block && /two paragraphs ending in a question/.test(block));
check("states the measured word counts", !!block && /at 60 and 70 words/.test(block));
check("names the specific change", !!block && /End it on a statement rather than a question/.test(block));
check("says it is about form, not content", !!block && /about form only/.test(block));

check(
  "silent when the shape varies",
  buildConversationStateBlock([u("hi"), a(INFO_THEN_ASK()), u("ok"), a(ONE_LINE_STATEMENT), u("right")], [], null) === null
);

const impatient = [...repeatingHistory.slice(0, -1), u("I ASKED how much it costs??")];
const impatientBlock = buildConversationStateBlock(impatient, [], null) ?? "";
check("silent while the visitor is impatient", !/same shape/.test(impatientBlock));

const hesitant = [...repeatingHistory.slice(0, -1), u("I need to think about it")];
const hesitantBlock = buildConversationStateBlock(hesitant, [], null) ?? "";
check("silent while the visitor is hesitating", !/same shape/.test(hesitantBlock));

console.log(bad ? `\n${bad} FAILING` : "\nall reply-shape tests passed");
process.exit(bad ? 1 : 0);
