// Which stored numbers a rep abroad cannot dial.
//
//   npx tsx scripts/test-phone-number.ts
//
// The flag has to be quiet to be useful. A rep who sees it on every lead
// stops reading it, so the cases that must NOT fire matter at least as
// much as the ones that must: an email address, a house number in a note,
// an age, "4 months".

import { needsCountryCode, normaliseDigits } from "../lib/phone-number";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const flags = (input: string, expected: boolean, why: string) =>
  check(
    `${expected ? "FLAG " : "quiet"}  ${input.slice(0, 44).padEnd(44)} ${why}`,
    needsCountryCode(input) === expected,
    `got ${needsCountryCode(input)}`
  );

console.log("--- dialable from abroad: say nothing ---");
flags("+44 7700 900123", false, "plus and country code");
flags("+905321112233", false, "no spaces, still fine");
flags("00905321112233", false, "00 is the other international prefix");
flags("WhatsApp: +90 532 111 2233", false, "a label in front changes nothing");
flags("+86 138 0013 8000", false, "long number");
flags("‎+٩٠ ٥٣٢ ١١١ ٢٢٣٣", false, "Arabic-Indic digits with a plus");

console.log("\n--- not dialable: flag it ---");
flags("0532 111 2233", true, "national trunk zero, no country code");
flags("07700900123", true, "UK local form");
flags("532 111 2233", true, "no prefix at all");
flags("٠٥٣٢ ١١١ ٢٢٣٣", true, "same, in Arabic-Indic digits");
flags("905321112233", true, "may be complete, but nothing says so");
flags("tel 0532-111-2233", true, "a label does not supply a country code");

console.log("\n--- not a phone number: stay quiet ---");
flags("khalid@example.com", false, "an email is not a missing country code");
flags("", false, "empty");
flags("ask for me on reception", false, "no digits");
flags("@khalid_90", false, "a handle, two digits");
flags("he is 54 and lost them in 2019", false, "an age and a year");
flags("4 months of healing", false, "a count");
flags("room 221b", false, "short run");
check("null is quiet", needsCountryCode(null) === false);
check("undefined is quiet", needsCountryCode(undefined) === false);

console.log("\n--- digit normalisation ---");
check("Arabic-Indic becomes ASCII", normaliseDigits("٠٥٣٢") === "0532");
check("Persian becomes ASCII", normaliseDigits("۰۵۳۲") === "0532");
check("full-width becomes ASCII", normaliseDigits("０５３２") === "0532");
check("ASCII is untouched", normaliseDigits("0532") === "0532");
check(
  "and the rest of the string survives",
  normaliseDigits("رقمي ٠٥٣٢") === "رقمي 0532",
  normaliseDigits("رقمي ٠٥٣٢")
);

console.log(bad ? `\n${bad} FAILING` : "\nall phone-number tests passed");
process.exit(bad ? 1 : 0);
