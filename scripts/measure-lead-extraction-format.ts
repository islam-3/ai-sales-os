// Does the cached transcript format read leads the same as the old one?
//
//   LIVE=1 DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-lead-extraction-format.ts | tee docs/lead-extraction-format-<date>.txt
//
// PAID. 12 stored test-clinic conversations x 2 points (turn 1, final
// turn) x 2 formats x 2 runs = 96 Sonnet calls, about $0.65. State that
// and get a yes before setting LIVE=1.
//
// What changed between the formats, and nothing else:
//   OLD  the transcript as ONE string; on turn 1 without the greeting
//   NEW  one block per turn with a cache breakpoint on the last, and the
//        greeting included from turn 1 (lib/lead-extraction.ts)
// Same model, same system prompt, same max_tokens.
//
// Extraction is not deterministic, so each format runs twice. Run 1 vs
// run 2 of the SAME format is the noise floor; old vs new is only a
// difference if it disagrees more than that. The second NEW run also
// shows whether the cache is read: it repeats the first run's prefix
// within seconds.
//
// Read-only on the database. test-clinic only.

import type Anthropic from "@anthropic-ai/sdk";
import { buildLeadExtractionPrompt, leadLanguage } from "../lib/lead-language";
import {
  LEAD_EXTRACTION_MODEL,
  callLeadExtraction,
  extractionTurns,
  type ExtractedLead,
  type TranscriptTurn,
} from "../lib/lead-extraction";
import { parseTenantSettings } from "../lib/tenant-settings";
import { isTestTenant, TEST_TENANT_SLUG } from "../lib/test-tenant";

const SESSIONS = 12;
const RUNS = 2;

type Result = { extracted: Partial<ExtractedLead> | null; usage: Anthropic.Usage | null };

/** The request production sent before this change: one string, as the old formatTranscript built it. */
async function oldFormat(client: Anthropic, language: string, turns: TranscriptTurn[]): Promise<Result> {
  const transcript = turns
    .map((t) => `${t.role === "assistant" ? "Assistant" : "User"}: ${t.content}`)
    .join("\n\n");
  try {
    const response = await client.messages.create({
      model: LEAD_EXTRACTION_MODEL,
      max_tokens: 512,
      system: buildLeadExtractionPrompt(language),
      messages: [{ role: "user", content: transcript }],
    });
    const block = response.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return { extracted: JSON.parse(json), usage: response.usage };
    } catch {
      return { extracted: null, usage: response.usage };
    }
  } catch {
    return { extracted: null, usage: null };
  }
}

// ── Comparing two readings of the same transcript ────────────────────
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const digits = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d))).replace(/\D/g, "")
    : "";
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v ?? null);
const present = (v: unknown) => v !== null && v !== undefined && v !== "";

const FIELDS: { name: string; same: (a: Partial<ExtractedLead>, b: Partial<ExtractedLead>) => boolean }[] = [
  { name: "name", same: (a, b) => norm(a.name) === norm(b.name) },
  { name: "contact_info (digits)", same: (a, b) => digits(a.contact_info) === digits(b.contact_info) },
  { name: "visitor_language", same: (a, b) => norm(a.visitor_language) === norm(b.visitor_language) },
  { name: "age", same: (a, b) => (a.age ?? null) === (b.age ?? null) },
  ...(["main_concern", "priority", "duration_of_issue", "timeline", "travel_country", "notes", "ai_summary"] as const).map(
    (f) => ({ name: `${f} present`, same: (a: Partial<ExtractedLead>, b: Partial<ExtractedLead>) => present(a[f]) === present(b[f]) })
  ),
  {
    name: "qualification_score within 15",
    same: (a, b) =>
      (a.qualification_score ?? null) === null || (b.qualification_score ?? null) === null
        ? (a.qualification_score ?? null) === (b.qualification_score ?? null)
        : Math.abs((a.qualification_score as number) - (b.qualification_score as number)) <= 15,
  },
];

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(`(skipped: ${SESSIONS * 2 * 2 * RUNS} Sonnet calls, about $0.65 — set LIVE=1 to run it, after stating the cost)`);
    process.exit(0);
  }
  const { anthropic } = await import("../lib/anthropic");
  const { supabaseServer: s } = await import("../lib/supabase-server");

  const { data: tenant } = await s.from("tenants").select("id, settings").eq("slug", TEST_TENANT_SLUG).single();
  if (!tenant || !isTestTenant(tenant.settings as { is_test?: boolean })) throw new Error("test-clinic only");
  const language = leadLanguage(parseTenantSettings(tenant.settings));

  // The most recent complete conversations, two per opening message, so
  // the six smoke-test classes are covered rather than six of one.
  const { data: rows } = await s
    .from("conversations")
    .select("session_id, role, content, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  const bySession = new Map<string, TranscriptTurn[]>();
  for (const r of [...(rows ?? [])].reverse()) {
    (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push({ role: r.role, content: r.content });
  }
  const perOpener = new Map<string, string[]>();
  for (const [sid, turns] of Array.from(bySession).reverse()) {
    const users = turns.filter((t) => t.role === "user");
    if (users.length < 7 || turns[0].role !== "assistant") continue; // complete, with a stored greeting
    const opener = users[0].content;
    const list = perOpener.get(opener) ?? perOpener.set(opener, []).get(opener)!;
    if (list.length < 2) list.push(sid);
  }
  const chosen = Array.from(perOpener.values()).flat().slice(0, SESSIONS);
  console.log(`${chosen.length} conversations, ${perOpener.size} distinct openers, language "${language}"\n`);

  const pairs = { old: new Map<string, number[]>(), new: new Map<string, number[]>(), cross: new Map<string, number[]>() };
  const tally = (kind: keyof typeof pairs, a: Result, b: Result) => {
    if (!a.extracted || !b.extracted) return;
    for (const f of FIELDS) {
      const m = pairs[kind].get(f.name) ?? pairs[kind].set(f.name, []).get(f.name)!;
      m.push(f.same(a.extracted, b.extracted) ? 1 : 0);
    }
  };
  let cost = 0, failures = 0;
  const cacheReadsOnRepeat: number[] = [];
  const price = (u: Anthropic.Usage | null) =>
    u
      ? (u.input_tokens * 3 + (u.cache_creation_input_tokens ?? 0) * 3.75 + (u.cache_read_input_tokens ?? 0) * 0.3 + u.output_tokens * 15) / 1e6
      : 0;

  for (const sid of chosen) {
    const stored = bySession.get(sid)!;
    const greeting = stored[0].content;
    // Turn 1: what each format sent on the first turn.
    const turn1Old = stored.slice(1, 3);
    const turn1New = extractionTurns([], greeting, stored[1].content, stored[2].content);
    // Final turn: the whole conversation.
    const lastUser = stored.map((t) => t.role).lastIndexOf("user");
    const finalOld = stored.slice(0, lastUser + 2);
    const finalNew = extractionTurns(stored.slice(0, lastUser), null, stored[lastUser].content, stored[lastUser + 1]?.content ?? "");

    for (const [label, oldTurns, newTurns] of [
      ["turn 1", turn1Old, turn1New],
      ["final", finalOld, finalNew],
    ] as const) {
      const olds: Result[] = [], news: Result[] = [];
      for (let r = 0; r < RUNS; r++) {
        const o = await oldFormat(anthropic, language, oldTurns);
        const n = await callLeadExtraction(anthropic, language, newTurns);
        olds.push(o);
        news.push(n);
        cost += price(o.usage) + price(n.usage);
        if (!o.extracted) failures++;
        if (!n.extracted) failures++;
        if (r > 0) cacheReadsOnRepeat.push(n.usage?.cache_read_input_tokens ?? 0);
      }
      tally("old", olds[0], olds[1]);
      tally("new", news[0], news[1]);
      for (const o of olds) for (const n of news) tally("cross", o, n);
      const show = (x: Result) => `${x.extracted?.name ?? "—"} / ${x.extracted?.contact_info ?? "—"} / ${x.extracted?.qualification_score ?? "—"}`;
      console.log(`${sid.slice(0, 8)} ${label.padEnd(6)}  old: ${show(olds[0])}   new: ${show(news[0])}`);
    }
  }

  console.log(`\n${"field".padEnd(32)} old vs old   new vs new   old vs new`);
  let worse = 0;
  for (const f of FIELDS) {
    const rate = (k: keyof typeof pairs) => {
      const v = pairs[k].get(f.name) ?? [];
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    };
    const [o, n, c] = [rate("old"), rate("new"), rate("cross")];
    // A difference only if old-vs-new disagrees more than either format
    // disagrees with itself, by more than one case in this sample.
    const floor = Math.min(o, n);
    const oneCase = 1 / Math.max(1, (pairs.old.get(f.name) ?? []).length);
    const flag = c < floor - oneCase ? "  <-- worse than noise" : "";
    if (flag) worse++;
    const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(6);
    console.log(`${f.name.padEnd(32)} ${pct(o)}       ${pct(n)}       ${pct(c)}${flag}`);
  }
  console.log(`\nunparseable or failed calls: ${failures}`);
  console.log(`new format, repeated call: cache_read > 0 on ${cacheReadsOnRepeat.filter((t) => t > 0).length} of ${cacheReadsOnRepeat.length}`);
  console.log(`cost: $${cost.toFixed(4)}`);
  console.log(worse === 0 ? "\nPASS: no field disagrees across formats more than within one" : `\nFAIL: ${worse} field(s) worse than noise`);
  process.exit(worse === 0 && failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
