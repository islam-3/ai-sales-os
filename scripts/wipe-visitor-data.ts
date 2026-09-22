// Removes every trace of VISITOR activity from a tenant, keeping the
// business itself untouched.
//
//   Count and export only (default, changes nothing):
//     SLUG=prof-clinic DOTENV_CONFIG_PATH=.env.local \
//       npx tsx -r dotenv/config scripts/wipe-visitor-data.ts
//
//   Actually delete, after the counts have been approved:
//     SLUG=prof-clinic CONFIRM_DELETE=yes-delete-visitor-data ...
//
// Written for one situation: a tenant whose entire conversation history
// is test traffic, ours and the owner's, with no real enquiry in it. It
// does NOT try to tell test data from real data — it assumes there is no
// real data. Never point it at a tenant where that is not true.
//
// What goes:
//   lead_profile      every lead
//   conversations     every transcript row
//   chat_sessions     every metered session
//   lead-attachments  photos visitors sent in chat, for this tenant only
//   tenants.current_period_conversations -> 0
//
// What stays, deliberately:
//   the tenant row, its settings, brand and description
//   knowledge_base and everything in the business-media bucket
//   the approved chat-intro translation and the owner's own labels
//   usage_events - a record of real money actually spent

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SLUG = process.env.SLUG ?? "";
const CONFIRM = process.env.CONFIRM_DELETE ?? "";
const CONFIRM_PHRASE = "yes-delete-visitor-data";
const ATTACHMENT_BUCKET = "lead-attachments";

async function main() {
  if (!SLUG) throw new Error("SLUG is required, e.g. SLUG=prof-clinic");
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id, business_name, slug, current_period_conversations")
    .eq("slug", SLUG)
    .single();
  if (!tenant) throw new Error(`no tenant with slug "${SLUG}"`);

  const id = tenant.id as string;
  console.log(`tenant: ${tenant.business_name} (${SLUG})\n`);

  // ── Read everything first, so the export is complete before anything
  //    is removed and the counts shown are the counts deleted.
  const pageAll = async (table: string, columns: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseServer
        .from(table)
        .select(columns)
        .eq("tenant_id", id)
        .range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < 1000) break;
    }
    return rows;
  };

  const leads = await pageAll("lead_profile", "*");
  const conversations = await pageAll("conversations", "*");
  const sessions = await pageAll("chat_sessions", "*");

  // Attachments live under {tenantId}/{sessionId}/..., so listing the
  // tenant's prefix finds every photo without touching another tenant's.
  const attachmentPaths: string[] = [];
  const { data: sessionDirs } = await supabaseServer.storage
    .from(ATTACHMENT_BUCKET)
    .list(id, { limit: 1000 });
  for (const dir of sessionDirs ?? []) {
    const { data: files } = await supabaseServer.storage
      .from(ATTACHMENT_BUCKET)
      .list(`${id}/${dir.name}`, { limit: 1000 });
    (files ?? []).forEach((f) => attachmentPaths.push(`${id}/${dir.name}/${f.name}`));
  }

  // ── What stays, counted too, so "kept" is a number and not a promise.
  const { count: kbCount } = await supabaseServer
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", id);
  const { count: usageCount } = await supabaseServer
    .from("usage_events")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", id);

  console.log("WOULD DELETE");
  console.log(`  lead_profile rows        ${String(leads.length).padStart(6)}`);
  console.log(`  conversations rows       ${String(conversations.length).padStart(6)}`);
  console.log(`  chat_sessions rows       ${String(sessions.length).padStart(6)}`);
  console.log(`  visitor photos           ${String(attachmentPaths.length).padStart(6)}  (bucket: ${ATTACHMENT_BUCKET})`);
  console.log(`  current_period_conversations ${String(tenant.current_period_conversations ?? 0).padStart(2)} -> 0`);
  console.log("\nWOULD KEEP");
  console.log(`  knowledge_base rows      ${String(kbCount ?? 0).padStart(6)}  (and all business-media files)`);
  console.log(`  usage_events rows        ${String(usageCount ?? 0).padStart(6)}  (real spend, kept on purpose)`);
  console.log(`  the tenant row, settings, brand, and the approved chat-intro translation`);

  // ── Export before anything is touched, so this is reversible.
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `${SLUG}-visitor-data-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      { exportedAt: new Date().toISOString(), tenant, leads, conversations, sessions, attachmentPaths },
      null,
      2
    )
  );
  console.log(`\nexported to ${file}`);

  if (CONFIRM !== CONFIRM_PHRASE) {
    console.log(`\nNothing was deleted. To delete, re-run with:`);
    console.log(`  CONFIRM_DELETE=${CONFIRM_PHRASE}`);
    return;
  }

  // ── Deletion, in dependency order.
  console.log("\ndeleting...");
  for (const table of ["lead_profile", "conversations", "chat_sessions"]) {
    const { error } = await supabaseServer.from(table).delete().eq("tenant_id", id);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  ${table}: cleared`);
  }

  if (attachmentPaths.length > 0) {
    for (let i = 0; i < attachmentPaths.length; i += 100) {
      const { error } = await supabaseServer.storage
        .from(ATTACHMENT_BUCKET)
        .remove(attachmentPaths.slice(i, i + 100));
      if (error) throw new Error(`storage: ${error.message}`);
    }
    console.log(`  ${ATTACHMENT_BUCKET}: ${attachmentPaths.length} photos removed`);
  }

  const { error: resetError } = await supabaseServer
    .from("tenants")
    .update({ current_period_conversations: 0 })
    .eq("id", id);
  if (resetError) throw resetError;
  console.log("  current_period_conversations: reset to 0");

  console.log(`\ndone. The export at ${file} is the only copy now.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
