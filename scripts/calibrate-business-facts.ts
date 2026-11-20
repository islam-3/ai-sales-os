// Where should MIN_SIMILARITY sit for the business-facts selector?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/calibrate-business-facts.ts [slug] | tee docs/business-facts-calibration-<date>.txt
//
// PAID, about $0.0001: one embedding per query, text-embedding-3-small.
//
// ON-TOPIC: the question turns of the smoke conversations (price,
// process), embedded exactly as the route embeds them (factsQueryText
// over every visitor message so far), in every smoke language.
// OFF-TOPIC: messages that are about nothing the business offers, or
// about nothing at all, which must get no facts.
// For each, the best cosine against the tenant's entries (labels
// skipped, as the selector skips them). The floor belongs between the
// two distributions; if they overlap, this says so instead of printing a
// number anyway.

import { CASES } from "./_smoke-cases";

const OFF_TOPIC = [
  "what's the weather like in London today?",
  "do you sell second-hand cars?",
  "my name is David",
  "+44 7700 900123",
  "ok thanks",
  "كم الساعة الآن؟",
  "Какая сегодня погода?",
  "今天天气怎么样？",
  "bugün hava nasıl?",
  "¿venden coches usados?",
];

async function main() {
  const slug = process.argv[2] ?? "test-clinic";
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const { generateEmbedding } = await import("../lib/embeddings");
  const { parseEmbedding, cosineSimilarity } = await import("../lib/vectors");
  const { factsQueryText, isLabel } = await import("../lib/business-facts");
  const { data: t } = await s.from("tenants").select("id").eq("slug", slug).single();
  const { data: kb } = await s.from("knowledge_base").select("title, content, embedding").eq("tenant_id", t!.id).not("category", "is", null);
  const entries = (kb ?? []).map((e: any) => ({ title: e.title ?? "", content: e.content ?? "", embedding: parseEmbedding(e.embedding) })).filter((e) => e.embedding && !isLabel(e));
  const best = async (text: string) => {
    const q = await generateEmbedding(text);
    let top = -1, title = "";
    for (const e of entries) {
      const c = cosineSimilarity(q, e.embedding!);
      if (c > top) { top = c; title = e.title; }
    }
    return { top, title };
  };

  console.log(`${slug}: ${entries.length} entries with content (labels skipped)\n\nON-TOPIC (price = turn 3, process = turn 4, every visitor message so far):`);
  const on: number[] = [];
  for (const c of CASES) {
    for (const [name, upto] of [["price", 3], ["process", 4]] as const) {
      const r = await best(factsQueryText(c.turns.slice(0, upto)));
      on.push(r.top);
      console.log(`  ${r.top.toFixed(3)}  ${c.label.split(" ")[0].padEnd(8)} ${name.padEnd(8)} -> ${r.title.slice(0, 60)}`);
    }
  }
  console.log("\nOFF-TOPIC (a single message, as the first message of a conversation):");
  const off: number[] = [];
  for (const m of OFF_TOPIC) {
    const r = await best(factsQueryText([m]));
    off.push(r.top);
    console.log(`  ${r.top.toFixed(3)}  ${JSON.stringify(m).padEnd(46)} -> ${r.title.slice(0, 50)}`);
  }
  const minOn = Math.min(...on), maxOff = Math.max(...off);
  console.log(`\non-topic minimum ${minOn.toFixed(3)}, off-topic maximum ${maxOff.toFixed(3)}`);
  if (minOn > maxOff) console.log(`GAP: a floor of ${((minOn + maxOff) / 2).toFixed(3)} sits midway`);
  else console.log("OVERLAP: no floor separates them; the gate (the visitor asked something) has to carry it");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
