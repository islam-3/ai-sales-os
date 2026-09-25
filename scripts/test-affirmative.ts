// Is this message a yes?
//
//   npx tsx scripts/test-affirmative.ts
//
// Scored against the SAME labelled cases the classifier was measured on
// (scripts/classify-cases.ts), so this is directly comparable to the
// numbers in that measurement rather than to a set written to flatter it.

import { isAffirmative } from "../lib/affirmative";
import { CASES, OFFERS } from "./classify-cases";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

console.log("--- plain agreement, every failure class ---");
const YES: [string, string][] = [
  ["English", "yes please"],
  ["English", "go on then"],
  ["Arabic", "نعم من فضلك"],
  ["Arabic", "أكيد، أرني"],
  ["Russian", "да, покажите"],
  ["Russian", "давайте"],
  ["Chinese", "好的，麻烦您"],
  ["Chinese", "想看"],
  ["Turkish", "evet, lütfen"],
  ["Turkish", "olur, görmek isterim"],
  ["Spanish", "sí, por favor"],
  ["Spanish", "vale, enséñamelas"],
];
YES.forEach(([klass, text]) => check(`${klass}: "${text}"`, isAffirmative(text), "should be a yes"));

console.log("\n--- and declining is never a yes ---");
// Checked first and winning outright: sending a photo to someone who
// just declined is worse than missing an acceptance they can repeat.
const NO: [string, string][] = [
  ["English", "no thanks"],
  ["English", "no, not now"],
  ["Arabic", "لا شكراً"],
  ["Russian", "нет, спасибо"],
  ["Chinese", "不用了，谢谢"],
  ["Turkish", "hayır, teşekkürler"],
  ["Spanish", "no, gracias"],
  // The trap: a negative sitting next to an affirmative word.
  ["English", "not yet, thanks"],
  ["Turkish", "şimdilik gerek yok"],
  ["Russian", "нет, не надо"],
];
NO.forEach(([klass, text]) => check(`${klass}: "${text}"`, !isAffirmative(text), "should NOT be a yes"));

console.log("\n--- a yes must be a bare yes ---");
// A visitor writing at length is saying something more specific than
// "yes", and treating it as a bare acceptance is how "yes but only the
// crowns" became the wrong photo.
check(
  "a qualified acceptance is not a bare yes",
  !isAffirmative("yes but only the crowns, not the implants, and can you also tell me the price"),
  "too specific to treat as a plain acceptance"
);
check("a long Arabic sentence is not a bare yes", !isAffirmative("نعم أريد أن أعرف التفاصيل الكاملة عن الأسعار وعدد الزيارات المطلوبة"));

console.log("\n--- substring accidents ---");
check('"pressure" does not contain a yes', !isAffirmative("what about the pressure?"));
check('"notice" is not a negative', isAffirmative("yes, I noticed"));
check('"another" does not contain "no"', isAffirmative("yes, another one please"));
check("empty is not a yes", !isAffirmative(""));
check("whitespace is not a yes", !isAffirmative("   "));
check("a phone number is not a yes", !isAffirmative("+90 532 111 2233"));

console.log("\n--- scored against the labelled set, for comparison ---");
// Only cases where an OFFER is actually outstanding. This function is
// never asked otherwise, so scoring it on "yes" answering "what is your
// name?" would be measuring a question production never puts to it - and
// that is exactly the confusion the pending offer exists to remove.
const offered = CASES.filter((c) => c.prior && OFFERS.includes(c.prior));
let tp = 0;
let fp = 0;
let fn = 0;
offered.forEach((c) => {
  const got = isAffirmative(c.text);
  if (c.accepts_offer && got) tp++;
  else if (!c.accepts_offer && got) fp++;
  else if (c.accepts_offer && !got) fn++;
});
const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
console.log(
  `  over ${offered.length} cases with a pending offer: ` +
    `precision ${(precision * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%  (tp=${tp} fp=${fp} fn=${fn})`
);
check("recall is total", recall === 1, `missed ${fn}`);
check("precision is total", precision === 1, `${fp} false positives`);
check(
  "which beats the regexes it replaces",
  recall > 0.17,
  "the old cue lists managed 17% recall, English only"
);

console.log(bad ? `\n${bad} FAILING` : "\nall affirmative tests passed");
process.exit(bad ? 1 : 0);
