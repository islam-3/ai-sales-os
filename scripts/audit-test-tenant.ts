// What silently differs between the test tenant and a real one?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/audit-test-tenant.ts
//
// The media rows were missed for days, and every smoke run reported green
// on a path it could not exercise. That is the shape of the problem: a
// difference nobody declared is a difference nobody tests, and it reads
// as a pass. This lists every field and related table, and says which
// ones are deliberately different, which match, and which do not match
// for no stated reason — the last column is where the next false green
// will come from.

const SOURCE = process.env.SOURCE_SLUG ?? "prof-clinic";
const TEST = "test-clinic";

/** Fields that SHOULD differ, and why. Anything else differing is a bug. */
const DELIBERATE: Record<string, string> = {
  id: "different row",
  slug: "different tenant",
  business_name: "must be unmistakable on any list",
  owner_user_id: "a dedicated account, never a real person's",
  created_at: "created later",
  trial_started_at: "its own trial clock",
  trial_ends_at: "its own trial clock",
  current_period_start: "its own billing period",
  current_period_end: "its own billing period",
  current_period_conversations: "starts at zero",
  plan_id: "never inherits billing",
  subscription_status: "never inherits billing",
  paddle_customer_id: "never inherits billing",
  paddle_subscription_id: "never inherits billing",
  paddle_price_id: "never inherits billing",
  settings: "carries is_test; otherwise identical",
};

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: rows } = await supabaseServer
    .from("tenants")
    .select("*")
    .in("slug", [SOURCE, TEST]);
  const source = (rows ?? []).find((r) => r.slug === SOURCE) as Record<string, unknown>;
  const test = (rows ?? []).find((r) => r.slug === TEST) as Record<string, unknown>;
  if (!source || !test) throw new Error("both tenants must exist");

  console.log("── tenants columns ─────────────────────────────────────────");
  const unexplained: string[] = [];
  for (const key of Object.keys(source).sort()) {
    const same = JSON.stringify(source[key]) === JSON.stringify(test[key]);
    if (same) {
      console.log(`  same        ${key}`);
    } else if (DELIBERATE[key]) {
      console.log(`  differs OK  ${key.padEnd(30)} (${DELIBERATE[key]})`);
    } else {
      console.log(`  DIFFERS ??  ${key}`);
      console.log(`                source: ${JSON.stringify(source[key]).slice(0, 70)}`);
      console.log(`                test  : ${JSON.stringify(test[key]).slice(0, 70)}`);
      unexplained.push(key);
    }
  }

  // Settings deserve their own comparison: is_test aside, they must match.
  const sSettings = { ...(source.settings as Record<string, unknown>) };
  const tSettings = { ...(test.settings as Record<string, unknown>) };
  delete tSettings.is_test;
  const settingsKeys = Array.from(new Set([...Object.keys(sSettings), ...Object.keys(tSettings)]));
  const settingsDiff = settingsKeys.filter(
    (k) => JSON.stringify(sSettings[k]) !== JSON.stringify(tSettings[k])
  );
  console.log(`\n── settings (is_test excluded) ─────────────────────────────`);
  console.log(
    settingsDiff.length === 0
      ? "  identical"
      : settingsDiff.map((k) => `  DIFFERS ??  ${k}`).join("\n")
  );
  unexplained.push(...settingsDiff.map((k) => `settings.${k}`));

  console.log(`\n── related tables ──────────────────────────────────────────`);
  const counts: [string, string, string?][] = [
    ["knowledge_base", "tenant_id"],
    ["knowledge_base_media", "tenant_id"],
  ];
  for (const [table, column] of counts) {
    const { count: sc } = await supabaseServer
      .from(table).select("*", { count: "exact", head: true }).eq(column, source.id);
    const { count: tc } = await supabaseServer
      .from(table).select("*", { count: "exact", head: true }).eq(column, test.id);
    const flag = sc === tc ? "same       " : "DIFFERS ?? ";
    if (sc !== tc) unexplained.push(table);
    console.log(`  ${flag} ${table.padEnd(24)} source=${sc}  test=${tc}`);
  }

  // Per-entry media, since a matching total could still be attached to
  // the wrong entries.
  for (const [label, id] of [["source", source.id], ["test", test.id]] as const) {
    const { data: kb } = await supabaseServer
      .from("knowledge_base")
      .select("title, knowledge_base_media(media_url)")
      .eq("tenant_id", id);
    const withMedia = (kb ?? []).filter((r) => (r.knowledge_base_media ?? []).length > 0);
    console.log(`  ${label.padEnd(11)} entries with a photo: ${withMedia.length}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  if (unexplained.length === 0) {
    console.log("  Nothing differs without a stated reason.");
  } else {
    console.log(`  ${unexplained.length} UNEXPLAINED DIFFERENCE(S): ${unexplained.join(", ")}`);
    console.log("  Each one is somewhere a smoke run could pass on a path");
    console.log("  the real tenant takes differently.");
  }
  console.log("═".repeat(60));
  process.exit(unexplained.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
