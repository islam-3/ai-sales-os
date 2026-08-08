// One-time script: generates OpenAI embeddings for any knowledge_base rows
// that don't have one yet, and writes them back to the embedding column.
//
// Run with: npm run embed-knowledge-base

import { config } from "dotenv";
config({ path: ".env.local" });

// lib/openai.ts and lib/supabase-server.ts construct their clients at
// module-load time from process.env — they must be imported *after*
// dotenv has populated it, so these are dynamic imports rather than
// static ones (static imports are hoisted and would run first).

const EMBEDDING_MODEL = "text-embedding-3-small";

async function main() {
  const { openai } = await import("../lib/openai");
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: rows, error } = await supabaseServer
    .from("knowledge_base")
    .select("id, content")
    .is("embedding", null);

  if (error) {
    console.error("Failed to fetch knowledge_base rows:", error);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No rows need embedding — knowledge_base is already fully embedded.");
    return;
  }

  console.log(`Found ${rows.length} row(s) needing embeddings.\n`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: row.content,
      });
      const embedding = response.data[0].embedding;

      const { error: updateError } = await supabaseServer
        .from("knowledge_base")
        .update({ embedding })
        .eq("id", row.id);

      if (updateError) {
        console.error(`  ✗ Failed to save embedding for row ${row.id}:`, updateError.message);
        failed++;
        continue;
      }

      updated++;
      console.log(`  ✓ Embedded row ${row.id} (${updated}/${rows.length})`);
    } catch (err) {
      console.error(`  ✗ Failed to generate embedding for row ${row.id}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. Updated ${updated} row(s).${failed > 0 ? ` ${failed} row(s) failed.` : ""}`);
}

main();
