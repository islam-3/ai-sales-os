// What a visitor actually waits, end to end, against the real deployment.
//
//   LABEL=before BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/measure-latency.ts
//
// The model call is not the number that matters. A visitor waits for the
// whole round trip - tenant lookup, history, knowledge, the reply, the
// guard - so that is what this times. Measuring the classifier call
// alone would answer a question nobody is asking.
//
// Runs several conversations rather than one long one, because the first
// turn of a conversation is cheaper than the tenth (less history, and a
// cold prompt cache), and a single conversation would weight the tail.

import { say } from "./_chat-client";
import { countWords } from "../lib/punctuation";

const LABEL = process.env.LABEL ?? "run";
const CONVERSATIONS = Number(process.env.CONVERSATIONS ?? 4);

// FROZEN. These turns are identical to the ones behind every number in
// docs/latency-*.txt, and changing them would silently compare against a
// different workload. Turn 4 asks for photos and turn 5 accepts - once
// the most expensive path in the route, now simply two more messages -
// and they stay exactly as they were so the runs remain comparable.
const TURNS = [
  "hi, I'm looking into dental implants",
  "I lost most of my upper teeth about five years ago",
  "how much does it cost?",
  "can I see photos of results like mine?",
  "yes please",
  "David",
];

type Timing = { turn: number; ms: number; words: number };

// Latency without output length is uninterpretable. A turn that got
// slower because the model wrote more is a different finding from a turn
// that got slower because the route does more, and the first run after
// image sending was removed produced exactly that ambiguity: turn 3
// gained ~1.2s while the route was doing strictly LESS work.
//
// Counted in words, not characters, for the same reason as everywhere
// else - see lib/punctuation.ts.

async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  console.log(`[${LABEL}] ${CONVERSATIONS} conversations x ${TURNS.length} turns against ${base}\n`);

  const timings: Timing[] = [];
  for (let c = 1; c <= CONVERSATIONS; c++) {
    const sessionId = crypto.randomUUID();
    process.stdout.write(`  conversation ${c}: `);
    for (let i = 0; i < TURNS.length; i++) {
      const started = Date.now();
      try {
        const { reply } = await say(sessionId, TURNS[i]);
        const ms = Date.now() - started;
        timings.push({ turn: i + 1, ms, words: countWords(reply) });
        process.stdout.write(`${Math.round(ms / 100) / 10}s `);
      } catch {
        process.stdout.write("x ");
      }
      // A real visitor reads the reply before typing again; hammering
      // the endpoint measures our rate limiter, not our latency.
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log("");
  }

  const all = timings.map((t) => t.ms).sort((a, b) => a - b);
  const at = (p: number) => all[Math.min(all.length - 1, Math.floor((all.length * p) / 100))];
  const mean = Math.round(all.reduce((a, b) => a + b, 0) / all.length);

  console.log(`\n${"═".repeat(58)}`);
  console.log(`  [${LABEL}]  ${all.length} turns`);
  console.log(`${"═".repeat(58)}`);
  console.log(`  p50  ${at(50)}ms`);
  console.log(`  p90  ${at(90)}ms`);
  console.log(`  p95  ${at(95)}ms`);
  console.log(`  mean ${mean}ms    min ${all[0]}ms    max ${all[all.length - 1]}ms`);

  // Per turn, because the shape matters: if only the turns that touch
  // media got slower, that is a different story from everything slowing.
  console.log(`\n  by turn number:`);
  for (let i = 1; i <= TURNS.length; i++) {
    const forTurn = timings.filter((t) => t.turn === i).map((t) => t.ms);
    if (!forTurn.length) continue;
    const avg = Math.round(forTurn.reduce((a, b) => a + b, 0) / forTurn.length);
    const forWords = timings.filter((t) => t.turn === i).map((t) => t.words);
    const avgWords = Math.round(forWords.reduce((a, b) => a + b, 0) / forWords.length);
    const perWord = Math.round(avg / Math.max(avgWords, 1));
    console.log(
      `    turn ${i}  mean ${String(avg).padStart(5)}ms   ${String(avgWords).padStart(3)}w` +
        `  ${String(perWord).padStart(3)}ms/w   "${TURNS[i - 1].slice(0, 34)}"`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
