// Read-only diagnosis of the live leads table. Deletes nothing.
//
//   npx tsx scripts/diagnose-leads.ts


const SLUG = "prof-clinic";

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");
  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id, business_name, settings")
    .eq("slug", SLUG)
    .single();
  if (!tenant) throw new Error("tenant not found");
  console.log(`tenant ${tenant.business_name} (${tenant.id})`);
  console.log("settings.languages:", JSON.stringify((tenant.settings as Record<string, unknown>)?.languages));
  console.log("settings.chat_language:", JSON.stringify((tenant.settings as Record<string, unknown>)?.chat_language));
  console.log("settings.lead_language:", JSON.stringify((tenant.settings as Record<string, unknown>)?.lead_language));

  const { data: leads, error } = await supabaseServer
    .from("lead_profile")
    .select("id, session_id, name, contact_info, status, ai_summary, qualification_data, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = leads ?? [];

  console.log(`\ntotal leads: ${rows.length}`);

  const withLang = rows.filter((r) => ((r.qualification_data as any)?.visitor_language ?? "").trim());
  console.log(`visitor_language set: ${withLang.length}, empty: ${rows.length - withLang.length}`);
  const byLang: Record<string, number> = {};
  withLang.forEach((r) => {
    const k = String((r.qualification_data as any)?.visitor_language);
    byLang[k] = (byLang[k] ?? 0) + 1;
  });
  console.log("languages present:", JSON.stringify(byLang));

  const byName: Record<string, number> = {};
  rows.forEach((r) => {
    const k = (r.name ?? "").trim() || "(empty)";
    byName[k] = (byName[k] ?? 0) + 1;
  });
  const names = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  console.log("\ntop names:");
  names.slice(0, 20).forEach(([n, c]) => console.log(`  ${c.toString().padStart(4)}  ${n}`));

  const empty = rows.filter((r) => !(r.name ?? "").trim() && !(r.contact_info ?? "").trim());
  console.log(`\nrows with no name, no email, no phone: ${empty.length}`);

  // Sessions, to see how long each lead's conversation actually was.
  const { data: convCounts } = await supabaseServer
    .from("conversations")
    .select("session_id")
    .eq("tenant_id", tenant.id)
    .limit(50000);
  const turns: Record<string, number> = {};
  (convCounts ?? []).forEach((m) => {
    turns[m.session_id] = (turns[m.session_id] ?? 0) + 1;
  });
  console.log(`distinct sessions with messages: ${Object.keys(turns).length}`);

  console.log("\nmost recent 15 leads:");
  rows.slice(0, 15).forEach((r) => {
    console.log(
      `  ${r.created_at?.slice(0, 16)} ` +
        `msgs=${(turns[r.session_id] ?? 0).toString().padStart(3)} ` +
        `lang=${(((r.qualification_data as any)?.visitor_language) ?? "-").padEnd(8)} ` +
        `name=${(r.name ?? "-").padEnd(14)} contact=${(r.contact_info ?? "-").padEnd(20)}`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Kept a module so its top-level names stay its own.
export {};
