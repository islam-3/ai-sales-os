// Why the guard is discarding Arabic replies.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/diagnose-arabic-guard.ts
//
// Runs REAL stored replies through the guard with the REAL injected text,
// and reports which individual check fires. No guessing.

import { BEHAVIOUR_PROMPT } from "../lib/business-prompt";
import { buildConversationStateBlock } from "../lib/conversation-state";
import { containsInternalState, stripInternalState, SAFE_FALLBACK } from "../lib/reply-guard";
import { enforceSingleQuestion, stripMarkup } from "../lib/strip-markup";

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: tenant } = await supabaseServer
    .from("tenants").select("id").eq("slug", "prof-clinic").single();
  const { data: entries } = await supabaseServer
    .from("knowledge_base").select("title, content, category").eq("tenant_id", tenant!.id);

  // The greeting is stored as an assistant turn, so the FIRST visitor
  // message already has a history of one — and that greeting is now in
  // Arabic, carrying the owner's own words.
  const { data: realGreeting } = await supabaseServer
    .from("conversations")
    .select("content, created_at")
    .eq("tenant_id", tenant!.id)
    .eq("role", "assistant")
    .ilike("content", "%Prof Clinic%")
    .order("created_at", { ascending: false })
    .limit(1);
  const greeting = String(realGreeting?.[0]?.content ?? "");
  console.log(`greeting (${greeting.length} chars): ${greeting.replace(/\s+/g, " ").slice(0, 170)}\n`);

  const history = [{ role: "assistant" as const, content: greeting }];
  const stateBlock = buildConversationStateBlock(history, (entries ?? []) as never, null, null);
  const injected = [BEHAVIOUR_PROMPT, stateBlock ?? ""];

  console.log(`state block WITH the greeting in history: ${stateBlock ? `${stateBlock.length} chars` : "(none)"}`);
  if (stateBlock) console.log(stateBlock);

  // Exactly what the echo detector will be matching against, Arabic only.
  const arabicInjected: string[] = [];
  for (const block of injected) {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || /^[•\-*]\s/.test(trimmed)) continue;
      for (const s of trimmed.split(/(?<=[.!?:])\s+/)) {
        const flat = s.toLowerCase().replace(/\s+/g, " ").trim();
        if (flat.length >= 40 && /[؀-ۿ]/.test(flat)) arabicInjected.push(flat);
      }
    }
  }
  console.log(`\nARABIC sentences the echo detector matches on: ${arabicInjected.length}`);
  arabicInjected.forEach((s) => console.log(`   >> ${s.slice(0, 140)}`));
  console.log("\n" + "═".repeat(70));

  const { data: replies } = await supabaseServer
    .from("conversations")
    .select("content, created_at, session_id")
    .eq("tenant_id", tenant!.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(40);

  const arabic = (replies ?? []).filter((r) => /[؀-ۿ]/.test(String(r.content)));
  const latin = (replies ?? []).filter((r) => !/[؀-ۿ]/.test(String(r.content)));
  console.log(`\nstored replies: ${arabic.length} Arabic, ${latin.length} non-Arabic\n`);

  const report = (label: string, rows: typeof arabic) => {
    let discarded = 0;
    rows.forEach((r) => {
      const raw = String(r.content);
      const cleaned = stripInternalState(raw, injected);
      const candidate = cleaned === null ? SAFE_FALLBACK : enforceSingleQuestion(stripMarkup(cleaned));
      const blocked = cleaned === null || containsInternalState(candidate, injected);
      if (!blocked) return;
      discarded++;
      console.log(`  DISCARDED (${String(r.created_at).slice(0, 19)})`);
      console.log(`    text  : ${raw.replace(/\s+/g, " ").slice(0, 110)}`);
      console.log(`    length: ${raw.length}  cleaned: ${cleaned === null ? "null" : `${cleaned.length}`}`);
      console.log(`    markers: ${containsInternalState(raw, [])}`);
      console.log(`    echo   : ${containsInternalState(raw, injected) && !containsInternalState(raw, [])}`);
    });
    console.log(`${label}: ${discarded}/${rows.length} discarded\n`);
  };

  report("Arabic", arabic);
  report("non-Arabic", latin);
}

main().catch((e) => { console.error(e); process.exit(1); });

export {};
