// Sentence endings and word counts, across failure classes.
//
//   npx tsx scripts/test-punctuation.ts

import { ENDS_WITH_QUESTION, countWords, splitSentences } from "../lib/punctuation";
import { shapeOf } from "../lib/conversation-state";
import { enforceSingleQuestion } from "../lib/strip-markup";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const Q = (code: number) => String.fromCharCode(code);
const ASCII_Q = "?";
const FULLWIDTH_Q = Q(0xff1f);
const ARABIC_Q = Q(0x061f);
const IDEO_STOP = Q(0x3002);

console.log("--- a question is a question in any script ---");
const QUESTIONS: [string, string][] = [
  ["English", "What matters most to you about the result?"],
  ["Arabic", `كم تستغرق العملية${ARABIC_Q}`],
  ["Russian", "Сколько времени занимает весь процесс?"],
  ["Chinese", `整个过程需要多长时间${FULLWIDTH_Q}`],
  ["Turkish", "Tüm süreç ne kadar sürüyor?"],
  ["Spanish", "¿Cuánto tarda todo el proceso?"],
];
QUESTIONS.forEach(([label, text]) => {
  check(`${label}: detected as a question`, ENDS_WITH_QUESTION.test(text), text);
  check(`${label}: shapeOf agrees`, shapeOf(text).endsWithQuestion, text);
});

console.log("\n--- and a statement is not ---");
check("a full stop is not a question", !ENDS_WITH_QUESTION.test("We use Swiss implants."));
check(
  "an ideographic full stop is not either",
  !ENDS_WITH_QUESTION.test(`我们使用瑞士种植体${IDEO_STOP}`)
);
// The trap this file exists to avoid: U+037E is invisible next to an
// ASCII semicolon, and Turkish, Spanish and English all use semicolons
// mid-sentence. If the wrong one were in the set, this would fail.
check(
  "an ASCII semicolon does NOT end a question",
  !ENDS_WITH_QUESTION.test("Tam implant dikkatli planlama gerektirir;"),
  "a semicolon in the question set would cut sentences mid-clause"
);
check(
  "an inverted opener does not end anything",
  !ENDS_WITH_QUESTION.test("¿Cuánto tarda"),
  "Spanish opens with it; only the closing mark may end a question"
);

console.log("\n--- sentences split where sentences actually end ---");
const THREE: [string, string][] = [
  ["English", "I lost my teeth. I want implants. How long does it take?"],
  [
    "Arabic",
    `فقدت أسناني. أريد زراعة. كم تستغرق${ARABIC_Q}`,
  ],
  ["Russian", "Я потерял зубы. Хочу импланты. Сколько времени?"],
  [
    "Chinese (no spaces)",
    `我失去了牙齿${IDEO_STOP}我想做种植${IDEO_STOP}需要多久${FULLWIDTH_Q}`,
  ],
  ["Turkish", "Dişlerimi kaybettim. İmplant istiyorum. Ne kadar sürer?"],
  ["Spanish", "Perdí mis dientes. Quiero implantes. ¿Cuánto tarda?"],
];
THREE.forEach(([label, text]) => {
  const n = splitSentences(text).length;
  check(`${label}: three sentences`, n === 3, `got ${n}: ${JSON.stringify(splitSentences(text))}`);
});
check(
  "a decimal does not split a sentence",
  splitSentences("The implant is 4.5 mm wide and lasts a lifetime.").length === 1,
  "no space after the dot, so it is not a sentence end"
);
// Known limitation, pre-dating this file and deliberately left: "Dr. "
// IS treated as a sentence end, because the only way to know otherwise
// is a list of abbreviations, and a per-language list is exactly the
// kind of rule that breaks on the next language. Splitting one sentence
// into two costs a slightly odd state-block entry; getting it wrong the
// other way would run sentences together in every script at once.
check(
  "an abbreviation still splits, as it always has",
  splitSentences("Dr. Smith placed the implants.").length === 2,
  "documenting real behaviour rather than asserting a fix nobody made"
);

console.log("\n--- words are counted comparably in every script ---");
// Each of these says roughly the same thing. The point is not the exact
// number; it is that no class is off by an order of magnitude, because
// every length band and minimum-words threshold reads this.
const SAME_MEANING: [string, string, number][] = [
  ["English", "I lost most of my upper teeth about five years ago and it affects my daily life", 16],
  [
    "Chinese",
    `我大约五年前失去了大部分上排牙齿，这影响了我的日常生活`,
    16,
  ],
];
SAME_MEANING.forEach(([label, text, expected]) => {
  const n = countWords(text);
  const ratio = n / expected;
  check(
    `${label}: within 2x of ${expected} words`,
    ratio >= 0.5 && ratio <= 2,
    `counted ${n}, expected about ${expected}`
  );
});
check("empty text is zero words", countWords("") === 0);
check("punctuation alone is zero words", countWords(" — ... ") === 0);

console.log("\n--- two questions get trimmed to one, in any script ---");
const TWO_QUESTIONS: [string, string][] = [
  ["English", "How long have you waited? And what is your name?"],
  [
    "Arabic",
    `منذ متى وأنت تنتظر${ARABIC_Q} وما اسمك الكريم${ARABIC_Q}`,
  ],
  ["Spanish", "¿Cuánto tiempo ha pasado? ¿Y cómo te llamas?"],
];
TWO_QUESTIONS.forEach(([label, text]) => {
  const out = enforceSingleQuestion(text);
  const remaining = splitSentences(out).filter((s) => ENDS_WITH_QUESTION.test(s)).length;
  check(`${label}: one question survives`, remaining === 1, `got ${remaining}: ${out}`);
});
check(
  "a reply that ends on a statement is left alone",
  enforceSingleQuestion("Is it worth it? Absolutely, and here is why.") ===
    "Is it worth it? Absolutely, and here is why.",
  "the rhetorical device must survive"
);

console.log(bad ? `\n${bad} FAILING` : "\nall punctuation tests passed");
process.exit(bad ? 1 : 0);
