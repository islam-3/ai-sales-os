// Does a near-duplicate join its existing group, live?
//
//   BASE_URL=https://ai-sales-os-drab.vercel.app DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-grouping-check.ts
//
// Two one-turn conversations on test-clinic, each a rewording of the
// "steps of the process" question that is already on its dashboard. One
// English, one Arabic: the Arabic one is ranked against English group
// titles by its own words, which is the weaker half of nearestGroups.
//
// Per turn: reply, classifier, judge, shorten-and-match, embeddings, and
// possibly lead extraction. About $0.06 for both, read back from
// usage_events at the end rather than estimated.
//
// Check /api/version first: a pass against the previous build proves
// nothing about this one.

import { say, SLUG } from "./_chat-client";
import { supabaseServer } from "../lib/supabase-server";

const CASES = [
  { label: "english", message: "how does the treatment go, step by step?" },
  { label: "arabic", message: "ممكن تشرح لي مراحل العلاج خطوة بخطوة؟" },
];

/** Groups that already ask for the steps. Joining any of them is right. */
const STEPS = /step|process|stage/i;

async function main() {
  const { data: tenant } = await supabaseServer.from("tenants").select("id").eq("slug", SLUG).single();
  const tenantId = tenant!.id as string;

  const { data: before } = await supabaseServer
    .from("unanswered_questions")
    .select("group_id, question_short")
    .eq("tenant_id", tenantId)
    .eq("is_canonical", true);
  const groups = new Map((before ?? []).map((g) => [g.group_id as string, g.question_short as string]));
  const stepGroups = Array.from(groups.entries()).filter(([, t]) => STEPS.test(t)).map(([id]) => id);
  console.log(`${groups.size} existing groups, ${stepGroups.length} about the steps\n`);

  let failed = 0;
  const sessions: string[] = [];
  for (const c of CASES) {
    const sessionId = crypto.randomUUID();
    sessions.push(sessionId);
    const { reply } = await say(sessionId, c.message);
    console.log(`── ${c.label}: ${c.message}`);
    console.log(`   reply: ${reply.slice(0, 90).replace(/\s+/g, " ")}…`);

    // Capture runs after the response, so poll for the row.
    let row: { group_id: string; question_short: string; id: string } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await supabaseServer
        .from("unanswered_questions")
        .select("id, group_id, question_short")
        .eq("tenant_id", tenantId)
        .eq("session_id", sessionId)
        .maybeSingle();
      row = data;
    }

    if (!row) {
      // Not a grouping failure: the gate or the judge decided there was
      // nothing to capture. Inconclusive, and said so.
      console.log("   INCONCLUSIVE: nothing captured within 60s (gate or judge said answered)\n");
      failed++;
      continue;
    }
    const joined = row.group_id !== row.id;
    const target = groups.get(row.group_id);
    const ok = joined && stepGroups.includes(row.group_id);
    console.log(`   short: "${row.question_short}"`);
    console.log(
      `   ${ok ? "PASS" : "FAIL"}: ${joined ? `joined "${target ?? row.group_id}"` : "started a new group"}\n`
    );
    if (!ok) failed++;
  }

  const { data: usage } = await supabaseServer
    .from("usage_events")
    .select("call_type, cost_usd")
    .in("session_id", sessions);
  const byType = new Map<string, number>();
  for (const u of usage ?? []) byType.set(u.call_type, (byType.get(u.call_type) ?? 0) + Number(u.cost_usd ?? 0));
  let total = 0;
  for (const [type, cost] of Array.from(byType.entries())) {
    total += cost;
    console.log(`   ${type.padEnd(30)} $${cost.toFixed(5)}`);
  }
  console.log(`   ${"total".padEnd(30)} $${total.toFixed(5)}`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
