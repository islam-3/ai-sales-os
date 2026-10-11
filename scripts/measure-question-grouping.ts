// Where should SAME_QUESTION_SIMILARITY sit?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-question-grouping.ts
//
// A threshold picked by intuition is the detector this project already
// rejected once. Cosine similarity on raw multilingual questions had no
// usable bar at all (docs/answerability-detection.txt) — overlap in all
// four languages, because similarity measures topic, not answerability.
//
// This is a DIFFERENT question, and an easier one. Grouping asks "are
// these two the same question", which is exactly what similarity
// measures, and it runs on the SHORT version, which is always in the
// team's one language — so the language-bound magnitude that sank the
// other use does not apply here.
//
// Easier is not the same as proven. The pairs below are labelled by
// hand: SAME means an owner would be annoyed to see both lines on the
// dashboard, DIFFERENT means collapsing them would hide a question. The
// script prints both distributions and the gap between them. If there is
// no gap, grouping by embedding is the wrong mechanism and this says so
// rather than printing a threshold anyway.

import { openai } from "../lib/openai";
import { cosineSimilarity } from "../lib/vectors";
import { SAME_QUESTION_SIMILARITY } from "../lib/unanswered-questions";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * SAME: two short versions of what is really one question.
 *
 * These are the shapes that actually arrive — one customer's wording
 * against another's, both already shortened into English.
 */
const SAME: [string, string][] = [
  ["how much do dental implants cost?", "what is the price of dental implants?"],
  ["how much does it cost?", "what are your prices?"],
  ["can I pay in instalments?", "do you offer a payment plan?"],
  ["do you accept health insurance?", "is treatment covered by insurance?"],
  ["is the hotel included in the price?", "does the price include accommodation?"],
  ["how many nights in the hotel are included?", "how many nights of accommodation do I get?"],
  ["what happens if an implant fails?", "what do you do if an implant does not work?"],
  ["who are the doctors?", "what are the surgeons' qualifications?"],
  ["is there parking at the clinic?", "can I park at the clinic?"],
  ["can you send an invitation letter for my visa?", "do you help with visa paperwork?"],
  ["I am diabetic, can I have implants?", "can people with diabetes get implants?"],
  ["what aftercare do I get at home?", "what follow-up happens after I fly home?"],
  ["is the anaesthetic included in the price?", "does the quote cover sedation?"],
  ["do you do teeth whitening?", "is teeth whitening available?"],
];

/**
 * DIFFERENT: near neighbours that must stay apart.
 *
 * Deliberately the hard cases — same topic, different question. These
 * are where a threshold set too low does its damage, because a question
 * collapsed into another one's group is not shown at all.
 */
const DIFFERENT: [string, string][] = [
  // Same subject, different question. The whole point of the judge.
  ["how much do dental implants cost?", "how long does implant treatment take?"],
  ["how much do dental implants cost?", "which implant brand do you use?"],
  ["is the hotel included in the price?", "how many nights in the hotel are included?"],
  ["what warranty do you give?", "what happens if an implant fails?"],
  ["can I pay in instalments?", "do you accept health insurance?"],
  ["who are the doctors?", "how many years have you been operating?"],
  // Same area of the business, genuinely separate answers.
  ["do you help with visa paperwork?", "do you arrange airport transfers?"],
  ["is there parking at the clinic?", "how do I get to the clinic from the airport?"],
  ["is the anaesthetic included in the price?", "what kind of anaesthetic do you use?"],
  ["what aftercare do I get at home?", "how long before I can fly home?"],
  // Different services entirely.
  ["do you do teeth whitening?", "do you do hair transplants?"],
  ["how much do implants cost?", "how much does a hair transplant cost?"],
  // The one an owner would be angriest about: a price question for one
  // service absorbed into the price question for another.
  ["what is the price of veneers?", "what is the price of implants?"],
];

const stats = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p10: sorted[Math.floor(sorted.length * 0.1)],
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted[sorted.length - 1],
  };
};

async function main() {
  const texts = Array.from(new Set([...SAME, ...DIFFERENT].flat()));
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  const vectors = new Map<string, number[]>();
  texts.forEach((t, i) => vectors.set(t, res.data[i].embedding));

  const scoreOf = ([a, b]: [string, string]) =>
    cosineSimilarity(vectors.get(a)!, vectors.get(b)!);

  const same = SAME.map(scoreOf);
  const different = DIFFERENT.map(scoreOf);

  console.log(`${texts.length} short questions, ${SAME.length} same pairs, ${DIFFERENT.length} different pairs\n`);

  console.log("--- SAME question, different wording (want HIGH) ---");
  SAME.forEach((p, i) => console.log(`  ${same[i].toFixed(3)}  ${p[0]}  /  ${p[1]}`));
  console.log("\n--- DIFFERENT questions, often same topic (want LOW) ---");
  DIFFERENT.forEach((p, i) => console.log(`  ${different[i].toFixed(3)}  ${p[0]}  /  ${p[1]}`));

  const s = stats(same);
  const d = stats(different);
  console.log("\n" + "=".repeat(68));
  console.log(`  same       min ${s.min.toFixed(3)}  p10 ${s.p10.toFixed(3)}  median ${s.median.toFixed(3)}  max ${s.max.toFixed(3)}`);
  console.log(`  different  min ${d.min.toFixed(3)}  median ${d.median.toFixed(3)}  p90 ${d.p90.toFixed(3)}  max ${d.max.toFixed(3)}`);

  // The only question that matters: is there a bar with nothing wrong
  // on either side of it?
  const gap = s.min - d.max;
  console.log("=".repeat(68));
  if (gap > 0) {
    const midpoint = (s.min + d.max) / 2;
    console.log(
      `\n  SEPARABLE. Every same pair scores above every different pair,` +
        `\n  with a gap of ${gap.toFixed(3)} between ${d.max.toFixed(3)} and ${s.min.toFixed(3)}.` +
        `\n  Any threshold in that gap is correct on this set; the midpoint is ${midpoint.toFixed(3)}.`
    );
  } else {
    console.log(
      `\n  OVERLAPPING by ${Math.abs(gap).toFixed(3)}. No threshold separates these pairs.` +
        `\n  Highest different pair ${d.max.toFixed(3)} beats lowest same pair ${s.min.toFixed(3)}.`
    );
  }

  // What the shipped threshold does, right or wrong, listed case by
  // case. A summary that hides which pairs it gets wrong is how a
  // threshold ships looking fine.
  const falseMerges = DIFFERENT.filter((_, i) => different[i] >= SAME_QUESTION_SIMILARITY);
  const missedMerges = SAME.filter((_, i) => same[i] < SAME_QUESTION_SIMILARITY);
  console.log(`\n--- at the shipped threshold of ${SAME_QUESTION_SIMILARITY} ---`);
  console.log(
    `  wrongly merged:  ${falseMerges.length}/${DIFFERENT.length}  (a question hidden inside another's group)`
  );
  falseMerges.forEach((p) => console.log(`    ${p[0]}  /  ${p[1]}`));
  console.log(
    `  wrongly split:   ${missedMerges.length}/${SAME.length}  (the same question listed twice)`
  );
  missedMerges.forEach((p) => console.log(`    ${p[0]}  /  ${p[1]}`));

  console.log(
    `\n  The two errors are not equal. A wrong split shows an owner the same` +
      `\n  question twice, which is untidy and self-correcting — they answer it` +
      `\n  once and both lines go. A wrong merge hides a question entirely` +
      `\n  behind another one's wording, and nothing ever surfaces it. So the` +
      `\n  threshold belongs on the high side of any gap, not the middle.`
  );

  if (falseMerges.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
