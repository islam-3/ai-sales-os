// Does shortenAndMatch group without ever merging two different questions?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-question-match.ts | tee docs/question-match-<date>.txt
//
// 40 cases x RUNS (default 3) Sonnet calls. ~$0.0015 each, ~$0.18 for
// the default. Ask before running it.
//
// The bar is not an average. ONE wrong merge on ANY run fails it: a
// wrong merge hides a customer's question inside a line that is not it,
// and nothing on the dashboard would ever show that it happened. Missed
// merges are reported, not failed — that is the duplicate line the
// embedding threshold already produces.

import { anthropic } from "../lib/anthropic";
import { shortenAndMatch } from "../lib/question-short";
import { CASES, GROUPS } from "./question-match-cases";

const RUNS = Number(process.env.RUNS ?? 3);
const CONCURRENCY = 4;
// Sonnet 4.6, per token.
const INPUT_PRICE = 3 / 1_000_000;
const OUTPUT_PRICE = 15 / 1_000_000;

type Result = {
  run: number;
  index: number;
  got: string | null;
  text: string;
  rejected?: string;
  matchRaw?: string;
};

async function runOnce(run: number): Promise<{ results: Result[]; cost: number }> {
  const results: Result[] = [];
  let cost = 0;
  let next = 0;
  async function worker() {
    while (next < CASES.length) {
      const index = next++;
      const r = await shortenAndMatch(anthropic, CASES[index].question, "English", GROUPS);
      if (r.usage) cost += r.usage.input * INPUT_PRICE + r.usage.output * OUTPUT_PRICE;
      results.push({ run, index, got: r.groupId, text: r.text, rejected: r.reason, matchRaw: r.matchRaw });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => a.index - b.index);
  return { results, cost };
}

async function main() {
  console.log(`shortenAndMatch — ${CASES.length} cases x ${RUNS} runs, ${GROUPS.length} existing groups`);
  console.log(`same: ${CASES.filter((c) => c.expected).length}, near-miss: ${CASES.filter((c) => !c.expected).length}\n`);

  let wrongMerges = 0;
  let totalCost = 0;
  const missedByCase = new Map<number, number>();

  for (let run = 1; run <= RUNS; run++) {
    const { results, cost } = await runOnce(run);
    totalCost += cost;
    let correct = 0;
    let missed = 0;
    let wrong = 0;
    let rejected = 0;
    console.log(`── run ${run}`);
    for (const r of results) {
      const c = CASES[r.index];
      if (r.rejected) rejected++;
      let verdict: string;
      if (r.got === c.expected) {
        correct++;
        verdict = "  ok   ";
      } else if (r.got === null) {
        // Expected a group and got "new": a duplicate line, not a hidden question.
        missed++;
        missedByCase.set(r.index, (missedByCase.get(r.index) ?? 0) + 1);
        verdict = "  split";
      } else {
        wrong++;
        verdict = "WRONG  ";
      }
      console.log(
        `${verdict} [${c.script.padEnd(8)}] ${c.question}  -> ${r.got ?? "new"}` +
          ` (want ${c.expected ?? `new, near ${c.nearMissOf}`})  "${r.text}"` +
          (r.rejected ? `  REJECTED: ${r.rejected}` : "")
      );
    }
    wrongMerges += wrong;
    console.log(
      `run ${run}: ${correct}/${CASES.length} correct, ${wrong} wrong merge(s), ${missed} split(s), ${rejected} rejected short line(s), $${cost.toFixed(4)}\n`
    );
  }

  console.log(`── total over ${RUNS} runs`);
  console.log(`wrong merges: ${wrongMerges}`);
  const splits = Array.from(missedByCase.entries());
  console.log(
    `splits: ${splits.reduce((a, [, n]) => a + n, 0)} across ${splits.length} case(s)` +
      (splits.length
        ? `: ${splits.map(([i, n]) => `"${CASES[i].question}" ${n}/${RUNS}`).join(", ")}`
        : "")
  );
  console.log(`cost: $${totalCost.toFixed(4)}`);
  console.log(wrongMerges === 0 ? "\nPASS: no wrong merge on any run" : "\nFAIL: at least one wrong merge");
  process.exit(wrongMerges === 0 ? 0 : 1);
}

main();
