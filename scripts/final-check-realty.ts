// Step 8: the final check of the OpenAI-only stack, on test-realty.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/final-check-realty.ts docs/<realty run>.sessions.json
//       (FREE: reads a finished run of measure-reply-provider with
//        CASE_SET=realty SLUG=test-realty OPENAI_STACK=1)
//   LIVE=1 CAPTURE=1 BASE_URL=<deployment> ...   (PAID, about $0.03:
//        one more conversation with capture on, see section 5)
//
// The bars, set before the run (2026-11-20), from the approved proposal
// (docs/second-test-tenant-proposal-2026-11-19.md) and the decision that
// the classifier's p95 must be under 2,000 ms ON VERCEL:
//   1. classifier p95 < 2,000 ms, measured by the deployed route;
//   2. no clinic wording in any reply: no word that test-clinic's
//      material uses and test-realty's never does, and no clinic brand;
//   3. every lead summary in the team's language (Turkish), the visitor's
//      own name and digits kept;
//   4. every usage row for these sessions is OpenAI;
//   5. capture: a question the material does not answer (pets, parking)
//      is recorded; an accepted offer and a covered question are not.
// The smoke hard checks and the specifics bars come from
// measure-reply-provider's report and measure-reply-specifics (TENANT=
// test-realty BARS=facts), run on the same sessions.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REALTY_CASES, REALTY_SLUG } from "./_realty-cases";

const wordsOf = (t: string) => t.toLowerCase().split(new RegExp("[^\\p{L}\\p{M}]+", "u")).filter((w) => w.length >= 5);
const TR_WORDS = /\b(ve|bir|için|ile|olarak|bu|da|de|istiyor|müşteri|olan|sonra|daire|ancak|henüz)\b/gi;
const TR_LETTERS = /[şğıİŞĞçöüÇÖÜ]/g;
const EN_WORDS = /\b(the|and|is|are|to|with|for|of|their|they|has|who|wants)\b/gi;

async function main() {
  const out: string[] = [`# Step 8: final check on ${REALTY_SLUG}, ${new Date().toISOString().slice(0, 10)}`, ""];
  const verdicts: [string, boolean][] = [];
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const { data: realty } = await s.from("tenants").select("id").eq("slug", REALTY_SLUG).single();
  const { data: clinic } = await s.from("tenants").select("id").eq("slug", "test-clinic").single();

  const sessionsFile = process.argv[2];
  if (sessionsFile) {
    const sessions = JSON.parse(readFileSync(sessionsFile, "utf8")) as { label: string; run: number; sessionId: string; classifierMs?: (number | null)[] }[];
    const ids = sessions.map((x) => x.sessionId);

    // 1. Classifier latency, as the deployed route measured it.
    const ms = sessions.flatMap((x) => (x.classifierMs ?? []).filter((v): v is number => typeof v === "number")).sort((a, b) => a - b);
    const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))];
    const p50 = ms[Math.floor(ms.length / 2)];
    verdicts.push([`classifier p95 ${p95} ms (p50 ${p50} ms, ${ms.length} turns, budget 2,000 ms)`, ms.length > 0 && p95 < 2000]);

    // 2. No clinic wording.
    const { data: clinicKb } = await s.from("knowledge_base").select("content").eq("tenant_id", clinic!.id);
    const { data: realtyKb } = await s.from("knowledge_base").select("content").eq("tenant_id", realty!.id);
    const realtyWords = new Set(wordsOf((realtyKb ?? []).map((k) => k.content).join(" ") + " " + REALTY_CASES.flatMap((c) => c.turns).join(" ")));
    const clinicOnly = new Set(wordsOf((clinicKb ?? []).map((k) => k.content).join(" ")).filter((w) => !realtyWords.has(w)));
    const { data: rows } = await s.from("conversations").select("session_id, role, content").in("session_id", ids).order("created_at");
    const replies = (rows ?? []).filter((r) => r.role === "assistant");
    const leaks: string[] = [];
    for (const r of replies) {
      const hit = wordsOf(r.content).filter((w) => clinicOnly.has(w));
      if (hit.length) leaks.push(`- ${r.session_id.slice(0, 8)} [${Array.from(new Set(hit)).join(", ")}] ${r.content.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    verdicts.push([`no clinic wording: ${leaks.length} of ${replies.length} replies use a word only test-clinic's material uses`, leaks.length === 0]);

    // 3. Leads in the team's language.
    const { data: leads } = await s.from("lead_profile").select("session_id, name, contact_info, ai_summary").in("session_id", ids);
    const leadMisses: string[] = [];
    for (const x of sessions) {
      const c = REALTY_CASES.find((k) => k.label === x.label)!;
      const l = (leads ?? []).find((v) => v.session_id === x.sessionId);
      const summary = String(l?.ai_summary ?? "").split(c.name).join(" ");
      const tr = (summary.match(TR_WORDS) ?? []).length + (summary.match(TR_LETTERS) ?? []).length;
      const en = (summary.match(EN_WORDS) ?? []).length;
      const foreignScript = /[؀-ۿЀ-ӿ一-鿿]/.test(summary);
      const ok = !!l && l.name === c.name && String(l.contact_info ?? "").replace(/\D/g, "").includes(c.digits) && tr > en && !foreignScript;
      if (!ok) leadMisses.push(`- ${x.label.split(" ")[0]} run ${x.run}: name ${JSON.stringify(l?.name)}, contact ${JSON.stringify(l?.contact_info)}, summary: ${String(l?.ai_summary ?? "(none)").slice(0, 200)}`);
    }
    verdicts.push([`lead in Turkish, name and digits kept: ${sessions.length - leadMisses.length}/${sessions.length}`, leadMisses.length === 0]);

    // 4. OpenAI only.
    const { data: usage } = await s.from("usage_events").select("provider, call_type, model").in("session_id", ids);
    const notOpenAI = (usage ?? []).filter((u) => u.provider !== "openai");
    const byType = new Map<string, number>();
    for (const u of usage ?? []) byType.set(`${u.call_type} ${u.model}`, (byType.get(`${u.call_type} ${u.model}`) ?? 0) + 1);
    verdicts.push([`OpenAI only: ${notOpenAI.length} of ${usage?.length ?? 0} usage rows are not OpenAI`, (usage?.length ?? 0) > 0 && notOpenAI.length === 0]);
    out.push("Usage rows by call: " + Array.from(byType).map(([k, n]) => `${k} ×${n}`).join(", "), "");

    if (leaks.length) out.push("## Clinic wording", "", ...leaks, "");
    if (leadMisses.length) out.push("## Leads not in Turkish, or details not kept", "", ...leadMisses, "");
    out.push("## Lead summaries (for reading)", "", ...sessions.map((x) => `- ${x.label.split(" ")[0]} run ${x.run}: ${String((leads ?? []).find((v) => v.session_id === x.sessionId)?.ai_summary ?? "(none)")}`), "");
  }

  // 5. Capture, one conversation with capture on.
  if (process.env.LIVE === "1" && process.env.CAPTURE === "1") {
    const { say } = await import("./_chat-client");
    const sid = crypto.randomUUID();
    const turns: [string, "gap" | "no row"][] = [
      ["hi, I'm interested in buying a flat in Kadıköy", "no row"],
      ["do you allow pets in the apartments you sell?", "gap"],
      ["is there parking included with the apartments?", "gap"],
      ["yes please", "no row"],
      ["what is your commission?", "no row"],
    ];
    for (const [t] of turns) await say(sid, t, REALTY_SLUG, { includeSignals: true, openaiStack: true });
    await new Promise((r) => setTimeout(r, 25000));
    const { data: rows } = await s.from("unanswered_questions").select("question_raw, question_short").eq("session_id", sid);
    const raw = (rows ?? []).map((r) => r.question_raw);
    const lines: string[] = [];
    let matched = 0;
    for (const [t, want] of turns) {
      const got = raw.includes(t) ? "gap" : "no row";
      if (got === want) matched++;
      lines.push(`- ${JSON.stringify(t)}: ${got} (want ${want})`);
    }
    verdicts.push([`capture: ${matched}/${turns.length} as expected`, matched === turns.length]);
    out.push(`## Capture (session ${sid})`, "", ...lines, "", ...(rows ?? []).map((r) => `- recorded: "${r.question_raw}" → "${r.question_short}"`), "");
  }

  out.splice(2, 0, "## Against the bars", "", ...verdicts.map(([l, ok]) => `- ${l} → ${ok ? "ok" : "**FAIL**"}`), "");
  const path = join(__dirname, "..", "docs", process.env.REPORT ?? `final-check-realty-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(out.join("\n"));
  console.log(`wrote ${path}`);
  if (verdicts.some(([, ok]) => !ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
