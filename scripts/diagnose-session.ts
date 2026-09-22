// Read-only: pulls the most recent conversations for a tenant so a live
// failure can be read back exactly as it happened. Deletes nothing.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/diagnose-session.ts

const SLUG = "prof-clinic";

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", SLUG)
    .single();
  if (!tenant) throw new Error("tenant not found");

  const { data: recent, error } = await supabaseServer
    .from("conversations")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;

  const rows = recent ?? [];
  if (rows.length === 0) {
    console.log("no conversation rows");
    return;
  }
  console.log("columns:", Object.keys(rows[0]).join(", "));

  const bySession: Record<string, typeof rows> = {};
  rows.forEach((r) => {
    const k = String((r as Record<string, unknown>).session_id);
    (bySession[k] ??= []).push(r);
  });

  Object.entries(bySession).forEach(([session, msgs]) => {
    const ordered = [...msgs].reverse();
    const first = String((ordered[0] as Record<string, unknown>).created_at ?? "");
    console.log(`\n═══ session ${session}  (${ordered.length} rows, from ${first})`);
    ordered.forEach((m) => {
      const r = m as Record<string, unknown>;
      const t = String(r.created_at ?? "").slice(11, 19);
      const content = String(r.content ?? "").replace(/\s+/g, " ");
      console.log(`  ${t} ${String(r.role).padEnd(9)} ${content.slice(0, 200)}`);
    });
  });

  // And the lead each one produced.
  const sessions = Object.keys(bySession);
  const { data: leads } = await supabaseServer
    .from("lead_profile")
    .select("session_id, name, contact_info, ai_summary, qualification_data, created_at")
    .eq("tenant_id", tenant.id)
    .in("session_id", sessions);
  console.log("\n═══ leads for those sessions");
  (leads ?? []).forEach((l) => {
    console.log(
      `  ${String(l.created_at).slice(11, 19)} session=${l.session_id} name=${l.name ?? "-"} contact=${l.contact_info ?? "-"}`
    );
    console.log(`      summary: ${String(l.ai_summary ?? "-").slice(0, 220)}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Kept a module so its top-level names stay its own.
export {};
