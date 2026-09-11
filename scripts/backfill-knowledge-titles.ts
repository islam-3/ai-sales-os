// One-time backfill: give every pre-existing knowledge_base row a title.
//
// Run AFTER the 20260911000000_add_knowledge_base_title migration, which
// adds the column with a default of ''. Rows left at '' still render (the
// dashboard falls back to a derived heading), but a real value means the
// business can edit it, and the assistant receives a labelled fact.
//
// Written as a script rather than SQL on purpose: deriveEntryTitle is
// sentence-aware and guards against abbreviations ("Dr.") and decimals
// ("99.8"). Reimplementing that in plpgsql would duplicate the logic in a
// second language, where the two copies would drift apart.
//
//   npx tsx scripts/backfill-knowledge-titles.ts          # preview only
//   npx tsx scripts/backfill-knowledge-titles.ts --write  # apply
//
// Idempotent: rows that already have a non-empty title are skipped, so
// re-running never overwrites something the owner has since edited.

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { deriveEntryTitle } from "../lib/knowledge-base";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const apply = process.argv.includes("--write");
const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .order("category");

  if (error) {
    console.error("Failed to read knowledge_base:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const pending = rows.filter((r) => !(r.title ?? "").trim());

  console.log(`${rows.length} entries, ${pending.length} without a title`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let written = 0;
  let failed = 0;

  for (const row of pending) {
    const title = deriveEntryTitle(row.content);
    console.log(`  [${row.category ?? "none"}] ${title}`);

    if (!apply) continue;

    const { error: updateError } = await supabase
      .from("knowledge_base")
      .update({ title })
      .eq("id", row.id);

    if (updateError) {
      console.error(`    FAILED: ${updateError.message}`);
      failed += 1;
    } else {
      written += 1;
    }
  }

  if (!apply) {
    console.log("\nPreview only. Re-run with --write to apply.");
    return;
  }

  console.log(`\nwritten: ${written}, failed: ${failed}`);
  if (failed > 0) process.exit(1);

  console.log(
    "\nTitles are part of the embedded text, so existing vectors are now\n" +
      "stale relative to the new scheme. Re-index with:\n" +
      "  npm run embed-knowledge-base"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
