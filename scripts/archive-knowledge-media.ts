// Retires the knowledge-base media rows, keeping the files.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/archive-knowledge-media.ts
//   ... then again with CONFIRM_DELETE=DELETE_KNOWLEDGE_MEDIA_ROWS
//
// Image sending was removed from the chat, and with it the dashboard
// upload. What is left is 14 knowledge_base_media rows pointing at 7
// files in the business-media bucket.
//
// ── Why the rows go and the files stay ───────────────────────────────
// The ROWS are what makes the feature re-wireable: as long as they are
// there, "just read knowledge_base_media again" is a two-line change,
// and a path nobody exercises is how an empty test tenant went unnoticed
// for days. Deleting them means rebuilding this would be a decision
// rather than an accident.
//
// The FILES are a real clinic's before-and-after work, they exist
// nowhere in this repository, and deleting them buys tidiness while
// foreclosing a decision - the business may well want them for WhatsApp,
// which is where they were always going to be most useful. They are
// downloaded to backups/ first regardless, so the row deletion cannot
// orphan something unrecoverable.
//
// Nothing here touches the branding logo or the lead-attachments bucket.
// Visitor photos are a different path and are not part of this.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { supabaseServer } from "../lib/supabase-server";

const BUCKET = "business-media";
const CONFIRM_PHRASE = "DELETE_KNOWLEDGE_MEDIA_ROWS";
const CONFIRM = process.env.CONFIRM_DELETE ?? "";

/**
 * The object path inside the bucket, from whatever the row stores.
 *
 * Rows hold a full public URL, and the bucket name appears in it twice
 * over: once in /storage/v1/object/public/<bucket>/ and again never. The
 * split is on the LAST occurrence of the bucket segment so a tenant
 * folder that happened to be named the same thing cannot confuse it.
 */
function objectPath(mediaUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const at = mediaUrl.lastIndexOf(marker);
  if (at === -1) return null;
  return decodeURIComponent(mediaUrl.slice(at + marker.length));
}

async function main() {
  const { data: rows, error } = await supabaseServer
    .from("knowledge_base_media")
    .select("*");
  if (error) throw error;

  const { data: tenants } = await supabaseServer.from("tenants").select("id, slug");
  const slugOf = new Map((tenants ?? []).map((t) => [t.id, t.slug]));

  const byTenant = new Map<string, number>();
  for (const r of rows ?? []) {
    const slug = slugOf.get(r.tenant_id) ?? r.tenant_id;
    byTenant.set(slug, (byTenant.get(slug) ?? 0) + 1);
  }

  // Several rows can point at the SAME object: create-test-tenant.ts
  // copied the URLs rather than the files, so test-clinic's rows and
  // prof-clinic's rows name identical paths. Downloading per row would
  // fetch each file twice and make the count look wrong.
  const paths = Array.from(
    new Set((rows ?? []).map((r) => objectPath(r.media_url)).filter((p): p is string => !!p))
  );
  const unresolved = (rows ?? []).filter((r) => !objectPath(r.media_url));

  console.log(`knowledge_base_media rows: ${rows?.length ?? 0}`);
  Array.from(byTenant.entries()).forEach(([slug, n]) => console.log(`    ${slug}: ${n}`));
  console.log(`distinct files behind them: ${paths.length}`);
  if (unresolved.length > 0) {
    console.log(`\n${unresolved.length} row(s) whose URL is not a ${BUCKET} object:`);
    unresolved.forEach((r) => console.log(`    ${r.media_url}`));
  }

  // ── Export first, always, whether or not the delete is confirmed.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "backups", `knowledge-media-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const saved: { path: string; bytes: number; savedAs: string }[] = [];
  const failed: { path: string; why: string }[] = [];

  for (const path of paths) {
    const { data, error: dlError } = await supabaseServer.storage.from(BUCKET).download(path);
    if (dlError || !data) {
      failed.push({ path, why: dlError?.message ?? "no body" });
      continue;
    }
    // Flattened, with the folder structure in the name: a nested tree of
    // tenant-uuid/category/ is harder to hand to a clinic than a folder
    // of files that say what they are.
    const savedAs = path.replace(/[\\/]/g, "__");
    const bytes = Buffer.from(await data.arrayBuffer());
    writeFileSync(join(dir, savedAs), bytes);
    saved.push({ path, bytes: bytes.length, savedAs });
  }

  // The rows themselves, so the mapping from file to knowledge entry is
  // not lost with them. A folder of photos nobody can attribute to an
  // entry is most of the value gone.
  writeFileSync(
    join(dir, "knowledge_base_media.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note:
          "Rows deleted from knowledge_base_media. The files themselves were LEFT in the " +
          `${BUCKET} bucket on purpose; these copies are a convenience, not the only copy.`,
        rows,
        files: saved,
        failed,
      },
      null,
      2
    )
  );

  console.log(`\nexported to ${dir}`);
  console.log(`    ${saved.length} file(s), ${(saved.reduce((n, f) => n + f.bytes, 0) / 1024 / 1024).toFixed(1)} MB`);
  if (failed.length > 0) {
    console.log(`    ${failed.length} FAILED to download:`);
    failed.forEach((f) => console.log(`      ${f.path} — ${f.why}`));
  }

  console.log("\nWOULD DELETE");
  console.log(`  knowledge_base_media rows  ${String(rows?.length ?? 0).padStart(4)}`);
  console.log("WOULD KEEP");
  console.log(`  ${BUCKET} files            ${String(paths.length).padStart(4)}  (left in place deliberately)`);
  console.log(`  the branding logo, and every lead-attachments file`);

  if (CONFIRM !== CONFIRM_PHRASE) {
    console.log(`\nNothing was deleted. To delete the ROWS, re-run with:`);
    console.log(`  CONFIRM_DELETE=${CONFIRM_PHRASE}`);
    return;
  }

  // A download failure means the export is incomplete, and an incomplete
  // export is not a reason to proceed carefully - it is a reason to stop.
  // The files survive either way, but the point of exporting first is
  // that it has actually happened.
  if (failed.length > 0) {
    console.log("\nREFUSING to delete: the export is incomplete (see above).");
    process.exit(1);
  }

  const { error: deleteError, count } = await supabaseServer
    .from("knowledge_base_media")
    .delete({ count: "exact" })
    .not("id", "is", null);
  if (deleteError) throw deleteError;

  console.log(`\ndeleted ${count ?? 0} knowledge_base_media row(s).`);
  console.log(`The ${paths.length} files are still in ${BUCKET}, and ${dir} has a copy.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
