// Every visitor turn is extracted, and what the model is sent can be cached.
//
//   npx tsx scripts/test-lead-extraction.ts
//
// FREE: no model call, no database. It cannot tell whether the model
// reads a lead correctly (scripts/measure-lead-extraction-format.ts does
// that, paid). It proves the two things that decide whether a final turn
// is extracted at all: nothing in the route can skip the call, and the
// final turn's exact words reach the model.
//
// The case is the one the old gate lost. A visitor's last message gives a
// name, a local number written in groups and the same number in
// Arabic-Indic digits. None of those matched the old CONTACT_HINT regex
// (no run of six ASCII digits, no "+", and \d is ASCII-only in
// JavaScript), and a conversation that ended there kept none of it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractionTurns,
  transcriptBlocks,
  transcriptText,
  type TranscriptTurn,
} from "../lib/lead-extraction";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8").replace(/\r\n/g, "\n");

// ── 1. No gate ───────────────────────────────────────────────────────
console.log("--- every turn is extracted ---");
check("the turn-pattern gate is gone", !/shouldExtractLead|LEAD_EXTRACTION_EVERY_N_TURNS/.test(route));
check("CONTACT_HINT no longer decides anything", !/CONTACT_HINT/.test(route));
// At handleChat's own indentation, not inside an if: two spaces in.
check(
  "extraction is called at the top level of the handler, unconditionally",
  /\n {2}keepAlive\(\n {4}extractAndSaveLead\(/.test(route),
  "extractAndSaveLead must not sit inside a condition"
);
const block = route.slice(
  route.indexOf("// The lead, read from the whole conversation"),
  route.indexOf("extractAndSaveLead(", route.indexOf("// The lead, read from the whole conversation"))
);
check("and no condition sits between its comment and the call", !/\bif\s*\(|\?\s*keepAlive/.test(block));

// ── 2. The final turn reaches the model, verbatim ────────────────────
console.log("\n--- a final turn with a name and two kinds of number ---");
const GREETING = "مرحباً! كيف يمكننا مساعدتك اليوم؟";
const FINAL = "اسمي أحمد، رقمي 0532 111 22 33 أو ٠٥٣٢١١١٢٢٣٣";
const earlier: TranscriptTurn[] = [
  { role: "assistant", content: GREETING },
  { role: "user", content: "زراعة الاسنان" },
  { role: "assistant", content: "تمام، كم سن تحتاج؟" },
  { role: "user", content: "كلها تقريباً" },
  { role: "assistant", content: "ممكن اسمك ورقمك؟" },
];
const finalTurns = extractionTurns(earlier, GREETING, FINAL, "شكراً أحمد!");
const blocks = transcriptBlocks(finalTurns);
check(
  "the final visitor message is its own block, word for word",
  blocks[blocks.length - 2]?.text === `User: ${FINAL}`,
  blocks[blocks.length - 2]?.text
);
for (const piece of ["أحمد", "0532 111 22 33", "٠٥٣٢١١١٢٢٣٣"]) {
  check(`"${piece}" is in what the model reads, unchanged`, blocks.some((b) => b.text.includes(piece)));
}
check(
  "the text checks (number guard) see the same transcript",
  transcriptText(finalTurns).includes(FINAL)
);

// ── 3. Cacheable ─────────────────────────────────────────────────────
console.log("\n--- the transcript can be cached turn by turn ---");
check(
  "the breakpoint is on the last block only",
  blocks.filter((b) => b.cache_control).length === 1 && Boolean(blocks[blocks.length - 1].cache_control)
);

// Simulate three turns of a conversation, storing what the route stores,
// and check each call's blocks begin with the previous call's.
const strip = (bs: ReturnType<typeof transcriptBlocks>) => bs.map((b) => b.text);
let stored: TranscriptTurn[] = [];
let previous: string[] | null = null;
let prefixHolds = true;
let detail = "";
const visitor = ["hello, implants?", "how much?", "Ahmed, 0532 111 22 33"];
for (let i = 0; i < visitor.length; i++) {
  const turns = extractionTurns(stored, i === 0 ? GREETING : null, visitor[i], `reply ${i + 1}`);
  const texts = strip(transcriptBlocks(turns));
  if (previous && texts.slice(0, previous.length).join("\u0000") !== previous.join("\u0000")) {
    prefixHolds = false;
    detail = `turn ${i + 1} does not begin with turn ${i}'s blocks`;
  }
  previous = texts;
  // What the insert writes: greeting first on turn 1, then the two rows.
  stored = turns;
}
check("each call's blocks begin with the previous call's, byte for byte", prefixHolds, detail);

const turn1 = strip(transcriptBlocks(extractionTurns([], GREETING, "hi", "hello")));
check("the greeting is in the turn-1 transcript", turn1[0] === `Assistant: ${GREETING}`, turn1[0]);
check(
  "with no greeting, turn 1 starts with the visitor",
  strip(transcriptBlocks(extractionTurns([], null, "hi", "hello")))[0] === "User: hi"
);
check(
  "the greeting is not repeated once it is stored",
  strip(transcriptBlocks(extractionTurns([{ role: "assistant", content: GREETING }], GREETING, "x", "y")))
    .filter((t) => t === `Assistant: ${GREETING}`).length === 1
);

// The stored order has to be stable for the prefix to be. The insert
// gives each row its own timestamp; rows sharing one came back in no
// guaranteed order.
check(
  "stored rows get distinct timestamps, in insert order",
  /\.map\(\(row, i\) => \(\{ \.\.\.row, created_at: new Date\(writtenAt \+ i\)\.toISOString\(\) \}\)\)/.test(route)
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nevery turn is extracted, and its transcript is cacheable");
