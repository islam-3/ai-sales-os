// Shape metrics for a full conversation, run several times.
//
// The boredom complaint was that every reply had the same shape: a
// paragraph of information, a second paragraph, then a question. That is
// measurable, so it is measured rather than argued about — and measured
// over several runs, because a single replay varies enough to show
// whatever you were hoping for.
//
//   RUNS=3 LABEL=baseline npx tsx scripts/measure-shape.ts

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "prof-clinic";
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? "run";

const TURNS = [
  "hi, I'm looking into getting dental implants",
  "I've lost most of my upper teeth. honestly I've been living without them for about ten years now",
  "I'm mainly worried about how it will look",
  "yes",
  "how long does the whole thing take?",
  "ok and what about the cost",
  "I'm coming from the UK",
  "probably sometime in the spring",
  "my name is David",
  "+44 7700 900123",
  "I had a heart bypass four years ago, does that matter?",
  "ok thanks, that's really helpful",
];

/**
 * A question asking about the person, rather than extracting a field.
 *
 * The first version matched "what made you" and missed "what's made you"
 * and "what made now the moment", so it reported 0% on a run where five
 * of five turn-2 replies asked exactly that. A metric that under-reports
 * the thing you changed is worse than none, so the variants are spelled
 * out.
 */
const ABOUT_THEM =
  /\bwhat(?:'s| has)? made (?:you|now|this)\b|\bwhat (?:was|has|were) (?:that|it|they) (?:been )?like\b|\bwhat(?:'s| is| has) that been like\b|\bhow (?:has|did) (?:that|it) (?:been|feel|affect)\b|\bhow (?:are|do) you feel\b|\bhardest part\b|\bwhat (?:are|were) you hoping\b|\bwhat would (?:it|that) mean (?:to|for) you\b|\bwhat(?:'s| has) held you back\b/i;

type Shape = { paras: number; words: number; endsQ: boolean; qs: number; aboutThem: boolean };

async function conversation(): Promise<{ shapes: Shape[]; tenYear: string }> {
  const sessionId = crypto.randomUUID();
  const shapes: Shape[] = [];
  let tenYear = "";
  for (let i = 0; i < TURNS.length; i++) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: TURNS[i], sessionId, slug: SLUG }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const { reply } = (await res.json()) as { reply: string };
    if (i === 1) tenYear = reply;
    shapes.push({
      paras: reply.split(/\n\n+/).filter(Boolean).length,
      words: reply.split(/\s+/).filter(Boolean).length,
      endsQ: /\?\s*$/.test(reply.trim()),
      qs: (reply.match(/\?/g) ?? []).length,
      aboutThem: ABOUT_THEM.test(reply),
    });
  }
  return { shapes, tenYear };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

(async () => {
  const results = [];
  for (let i = 0; i < RUNS; i++) results.push(await conversation());
  const all = results.flatMap((r) => r.shapes);

  const paras = all.map((s) => s.paras);
  const words = all.map((s) => s.words);
  const pct = (n: number) => `${Math.round((100 * n) / all.length)}%`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${LABEL}  —  ${RUNS} conversations x ${TURNS.length} turns = ${all.length} replies`);
  console.log("=".repeat(60));
  console.log(`  two-paragraph rate   : ${pct(paras.filter((p) => p === 2).length)}`);
  console.log(`  ends with a question : ${pct(all.filter((s) => s.endsQ).length)}`);
  console.log(`  words mean           : ${mean(words).toFixed(1)}`);
  console.log(`  words spread (sd)    : ${sd(words).toFixed(1)}   range ${Math.min(...words)}-${Math.max(...words)}`);
  console.log(`  paragraph spread (sd): ${sd(paras).toFixed(2)}`);
  console.log(`  asks about THEM      : ${pct(all.filter((s) => s.aboutThem).length)}`);
  console.log(`  >1 question          : ${pct(all.filter((s) => s.qs > 1).length)}`);

  console.log(`\n  TURN 2 — "ten years without teeth":`);
  results.forEach((r, i) => console.log(`\n   [${i + 1}] ${r.tenYear.replace(/\n/g, "\n       ")}`));
})();

export {};
