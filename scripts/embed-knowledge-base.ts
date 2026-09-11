// Generates OpenAI embeddings for knowledge_base rows and writes them
// back to the embedding column.
//
//   npm run embed-knowledge-base          # only rows with no embedding
//   npm run embed-knowledge-base -- --all # re-embed every row
//
// --all exists because the embedded text changed: it now includes the
// entry's title (see embeddingTextFor). Rows embedded before the title
// column existed still have usable vectors, but they describe the body
// alone, so they compete unevenly against newly-embedded rows. Re-running
// with --all puts every row on the same footing.

import { config } from "dotenv";
config({ path: ".env.local" });

// lib/embeddings.ts (via lib/openai.ts) and lib/supabase-server.ts
// construct their clients at module-load time from process.env — they
// must be imported *after* dotenv has populated it, so these are dynamic
// imports rather than static ones (static imports are hoisted and would
// run first).

const reembedAll = process.argv.includes("--all");

async function main() {
  const { generateEmbedding } = await import("../lib/embeddings");
  const { embeddingTextFor } = await import("../lib/knowledge-base");
  const { supabaseServer } = await import("../lib/supabase-server");

  const query = supabaseServer.from("knowledge_base").select("id, title, content");
  const { data: rows, error } = reembedAll ? await query : await query.is("embedding", null);

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
      const embedding = await generateEmbedding(
        embeddingTextFor({ title: row.title ?? "", content: row.content })
      );

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
