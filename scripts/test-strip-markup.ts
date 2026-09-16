// Tests for the reply sanitizer.
//
// The visitor's chat surface renders plain text, so anything markdown the
// model emits arrives literally. The prompt forbids markdown; it also
// forbade image placeholders, and one still shipped. This is the
// enforcement.
//
//   npx tsx scripts/test-strip-markup.ts

import { enforceSingleQuestion, stripMarkup } from "../lib/strip-markup";

const cases: [string, string, string][] = [
  ["bold survives as words", "a **lifetime warranty** on the implants", "a lifetime warranty on the implants"],
  ["the reported failure", "Our number is **+90 542 150 2222**", "Our number is +90 542 150 2222"],
  ["underscore bold", "a __lifetime warranty__ here", "a lifetime warranty here"],
  ["italic asterisk", "that is *really* important", "that is really important"],
  ["italic underscore", "that is _really_ important", "that is really important"],
  ["inline code", "ask for `Dr Mehmet`", "ask for Dr Mehmet"],
  ["link keeps the words", "see [our results](https://x.test/a) today", "see our results today"],
  ["image embed is removed entirely", "![Before and after]\n\nThe difference shows.", "The difference shows."],
  ["image with url removed", "![alt](https://x.test/a.jpg)\n\nHere it is.", "Here it is."],
  ["legacy tag removed", "[[MEDIA:https://x.test/a.jpg]] hello", "hello"],
  ["heading marker", "## Our packages\nAll included.", "Our packages\nAll included."],
  ["bullet list becomes lines", "- implants\n- crowns", "implants\ncrowns"],
  ["numbered list becomes lines", "1. implants\n2. crowns", "implants\ncrowns"],
  ["quote marker", "> we are open 24/7", "we are open 24/7"],
  ["multiplication is left alone", "roughly 5 * 3 implants", "roughly 5 * 3 implants"],
  ["snake_case is left alone", "the field is media_url here", "the field is media_url here"],
  ["parentheses untouched", "Straumann crowns (known worldwide) look natural.", "Straumann crowns (known worldwide) look natural."],
  ["square brackets untouched", "implants [single or full arch] differ", "implants [single or full arch] differ"],
  ["plain prose untouched", "Line one.\n\nLine two.", "Line one.\n\nLine two."],
  ["bold inside a sentence with a hyphen", "we use **Straumann zirconia** crowns - they last", "we use Straumann zirconia crowns - they last"],
];

let bad = 0;
for (const [name, input, want] of cases) {
  const got = stripMarkup(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n         got ${JSON.stringify(got)}`);
}

// Property: no markdown emphasis or image syntax may survive.
const survivors = cases
  .map(([, input]) => stripMarkup(input))
  .filter((s) => /\*\*|!\[|\]\(|`|^#{1,6} /m.test(s));
if (survivors.length) {
  bad += survivors.length;
  console.log(`FAIL  markup survived: ${JSON.stringify(survivors)}`);
} else {
  console.log("  ok  no markup survives any case");
}


console.log("\n--- enforceSingleQuestion ---");

const qCases: [string, string, string][] = [
  [
    "two asks: keeps the closing one",
    "Would you be comfortable sharing a photo? But first, could I get your name?",
    "But first, could I get your name?",
  ],
  [
    "two asks across paragraphs",
    "That helps, thank you.\n\nAre you travelling from abroad? And what is your name?",
    "That helps, thank you.\n\nAnd what is your name?",
  ],
  [
    "statements before the question are kept",
    "Ten years is a long time. What was the hardest part of it? And where are you based?",
    "Ten years is a long time. And where are you based?",
  ],
  [
    "a single question is untouched",
    "That sounds right. Where are you travelling from?",
    "That sounds right. Where are you travelling from?",
  ],
  [
    "no question at all is untouched",
    "We use Straumann zirconia crowns. They look natural.",
    "We use Straumann zirconia crowns. They look natural.",
  ],
  [
    "RHETORICAL: a reply not ending on a question is left alone",
    "What makes the difference? The Swiss precision we use.",
    "What makes the difference? The Swiss precision we use.",
  ],
  [
    "RHETORICAL mid-reply, statement ending",
    "So what changes? Everything, really. The team will walk you through it.",
    "So what changes? Everything, really. The team will walk you through it.",
  ],
];

for (const [name, input, want] of qCases) {
  const got = enforceSingleQuestion(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n         got ${JSON.stringify(got)}`);
}

// Property: when a reply ends on a question, exactly one may remain.
for (const [, input] of qCases) {
  const out = enforceSingleQuestion(input);
  if (!/\?\s*$/.test(out.trim())) continue;
  if ((out.match(/\?/g) ?? []).length > 1) {
    bad++;
    console.log(`FAIL  more than one question survived: ${JSON.stringify(out)}`);
  }
}

const totalTests = cases.length + 1 + qCases.length;
console.log(bad ? `\n${bad} FAILING` : `\n${totalTests}/${totalTests} passed`);
process.exit(bad ? 1 : 0);
