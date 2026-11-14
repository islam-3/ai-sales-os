// Can a cheaper OpenAI model extract the lead as well as Sonnet?
//
//   LIVE=1 [MEASURE_ONE=1] DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-extraction-provider.ts
//
// PAID. Offline: stored test-clinic transcripts, no new conversations.
// MEASURE_ONE=1 makes exactly one real call per model (one final-turn
// extraction, English team) so the total can be quoted from measurement.
//
// The full run, per model (Sonnet, gpt-6.1-terra, gpt-6-luna):
//   A. 12 stored conversations (two per smoke language), final turn, for
//      two team languages (English, Turkish), twice: 48 calls a model;
//   B. the constructed Arabic-Indic final turn, both team languages,
//      twice: 4 calls a model;
//   C. two whole conversations (English, Arabic) replayed turn by turn,
//      as production extracts on every turn, once: 14 calls a model.
// 66 calls a model, 198 in all.
//
// What it scores, per model and per visitor language (English first):
//   - name and contact digits against what the smoke visitor actually
//     gave (Arabic-Indic counted as ASCII); visitor language; age (none
//     was given, so it should be null);
//   - which text fields are filled, against Sonnet;
//   - the summary and the other written fields in the TEAM's language,
//     for two team languages (the rule Haiku failed 2 of 4 times);
//   - the visitor's own details kept verbatim (name in its own script);
//   - no invented figures (dropUnsupportedNumbers, as the route applies);
//   - qualification score within 15 of Sonnet's;
//   - cost per call, per conversation (from C), and cache reads.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { CASES } from "./_smoke-cases";
import { dropUnsupportedNumbers, GENERATED_LEAD_FIELDS } from "../lib/lead-language";
import {
  callLeadExtraction,
  callLeadExtractionOpenAI,
  extractionTurns,
  transcriptText,
  LEAD_EXTRACTION_MODEL,
  type ExtractedLead,
  type TranscriptTurn,
} from "../lib/lead-extraction";
import { calculateCostUsd, type TokenCounts } from "../lib/ai-pricing";
import { resolveLanguageCode } from "../lib/languages";
import { isTestTenant, TEST_TENANT_SLUG } from "../lib/test-tenant";

const MODELS = ["sonnet", "gpt-6.1-terra", "gpt-6-luna"] as const;
type Model = (typeof MODELS)[number];
const TEAM_LANGUAGES = ["English", "Turkish"] as const;
const RUNS = 2;
const PER_OPENER = 2;

type Result = { extracted: Partial<ExtractedLead> | null; tokens: TokenCounts | null; cost: number; error?: string };

async function extract(
  model: Model,
  clients: { anthropic: Anthropic; openai: OpenAI },
  language: string,
  turns: TranscriptTurn[],
  cacheKey: string
): Promise<Result> {
  if (model === "sonnet") {
    const r = await callLeadExtraction(clients.anthropic, language, turns);
    const tokens: TokenCounts | null = r.usage
      ? {
          inputTokens: r.usage.input_tokens,
          outputTokens: r.usage.output_tokens,
          cacheReadInputTokens: r.usage.cache_read_input_tokens ?? 0,
          cacheWriteInputTokens: r.usage.cache_creation_input_tokens ?? 0,
        }
      : null;
    return { extracted: r.extracted, tokens, cost: tokens ? calculateCostUsd(LEAD_EXTRACTION_MODEL, tokens) : 0, error: r.error };
  }
  const r = await callLeadExtractionOpenAI(clients.openai, model, language, turns, cacheKey);
  return { extracted: r.extracted, tokens: r.tokens, cost: r.tokens ? calculateCostUsd(model, r.tokens) : 0, error: r.error };
}

// ── Checks ─────────────────────────────────────────────────────────────
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const digits = (v: unknown) =>
  typeof v === "string" ? v.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d))).replace(/\D/g, "") : "";
const NON_LATIN = /[؀-ۿЀ-ӿ一-鿿぀-ヿ]/;
const EN_WORDS = /\b(the|and|is|are|to|with|for|of|their|they|has|who|wants)\b/gi;
const TR_WORDS = /\b(ve|bir|için|ile|olarak|bu|da|de|istiyor|hasta|müşteri|olan|sonra)\b/gi;
const TR_LETTERS = /[şğıİŞĞ]/g;

/** Is this written text in the team's language? A name or brand in another script is allowed. */
function inTeamLanguage(text: string, team: string, keep: string[]): boolean {
  let t = text;
  for (const k of keep) if (k) t = t.split(k).join(" ");
  if (NON_LATIN.test(t)) return false;
  const en = (t.match(EN_WORDS) ?? []).length;
  const tr = (t.match(TR_WORDS) ?? []).length + (t.match(TR_LETTERS) ?? []).length;
  return team === "English" ? en > 0 && en >= tr : tr > 0 && tr > en;
}

const TEXT_FIELDS = ["main_concern", "priority", "duration_of_issue", "timeline", "travel_country", "notes", "ai_summary"] as const;
const present = (v: unknown) => v !== null && v !== undefined && v !== "";

type Item = { key: string; lang: string; name: string; digits: string; visitorCode: string; turns: TranscriptTurn[] };
type Score = {
  calls: number; failed: number;
  name: number; digitsOk: number; asciiOnly: number; visitorLang: number; ageNull: number;
  summaryTeam: number; summaries: number; fieldsTeam: number; fieldsWritten: number;
  invented: number; scoreWithin: number; scoreCompared: number;
  fieldAgree: number; fieldCompared: number;
  cost: number;
};
const blank = (): Score => ({ calls: 0, failed: 0, name: 0, digitsOk: 0, asciiOnly: 0, visitorLang: 0, ageNull: 0, summaryTeam: 0, summaries: 0, fieldsTeam: 0, fieldsWritten: 0, invented: 0, scoreWithin: 0, scoreCompared: 0, fieldAgree: 0, fieldCompared: 0, cost: 0 });

const VISITOR_CODE: Record<string, string> = { English: "en", Arabic: "ar", Russian: "ru", Chinese: "zh", Turkish: "tr", Spanish: "es" };

async function main() {
  if (process.env.LIVE !== "1") {
    console.log("(skipped: paid. MEASURE_ONE=1 makes 3 calls; the full run makes 198 — set LIVE=1 to run it, after stating the cost)");
    process.exit(0);
  }
  const { anthropic } = await import("../lib/anthropic");
  const { openai } = await import("../lib/openai");
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const clients = { anthropic, openai };

  const { data: tenant } = await s.from("tenants").select("id, settings").eq("slug", TEST_TENANT_SLUG).single();
  if (!tenant || !isTestTenant(tenant.settings as { is_test?: boolean })) throw new Error("test-clinic only");
  const { data: rows } = await s.from("conversations").select("session_id, role, content, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(6000);
  const bySession = new Map<string, TranscriptTurn[]>();
  for (const r of [...(rows ?? [])].reverse()) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push({ role: r.role, content: r.content });

  // Stored smoke conversations: complete, with a greeting, matched to the case they ran.
  const items: Item[] = [];
  for (const c of CASES) {
    const lang = c.label.split(" ")[0];
    let taken = 0;
    for (const [sid, turns] of Array.from(bySession).reverse()) {
      if (taken >= PER_OPENER) break;
      const users = turns.filter((t) => t.role === "user");
      if (turns[0]?.role !== "assistant" || users.length < c.turns.length || users[0].content !== c.turns[0]) continue;
      const lastUser = turns.map((t) => t.role).lastIndexOf("user");
      items.push({
        key: sid.slice(0, 8), lang, name: c.name, digits: c.digits, visitorCode: VISITOR_CODE[lang],
        turns: extractionTurns(turns.slice(0, lastUser), null, turns[lastUser].content, turns[lastUser + 1]?.content ?? ""),
      });
      taken++;
    }
  }
  const constructed: Item = {
    key: "constructed", lang: "Arabic", name: "أحمد", digits: "05449876543", visitorCode: "ar",
    turns: extractionTurns(
      [
        { role: "assistant", content: "مرحباً! كيف يمكننا مساعدتك اليوم؟" },
        { role: "user", content: "مرحبا، أفكر في زراعة الأسنان" },
        { role: "assistant", content: "أهلاً بك! كم سناً تحتاج تقريباً؟" },
        { role: "user", content: "معظم أسناني العلوية" },
        { role: "assistant", content: "تمام. هل تحب أن يتواصل معك فريقنا؟ ما اسمك ورقمك؟" },
      ],
      null,
      "اسمي أحمد، رقمي ٠٥٤٤٩٨٧٦٥٤٣",
      "شكراً أحمد! سيتواصل معك فريقنا قريباً."
    ),
  };

  if (process.env.MEASURE_ONE === "1") {
    const item = items.find((i) => i.lang === "English")!;
    console.log(`one real final-turn extraction per model (English conversation ${item.key}, English team, ${item.turns.length} turns):`);
    for (const m of MODELS) {
      const r = await extract(m, clients, "English", item.turns, `measure-one-${m}`);
      console.log(`  ${m.padEnd(14)} $${r.cost.toFixed(5)}  ${JSON.stringify(r.tokens)}${r.error ? `  ERROR ${r.error}` : ""}`);
    }
    process.exit(0);
  }

  console.log(`${items.length} stored conversations + 1 constructed, ${MODELS.length} models, ${TEAM_LANGUAGES.length} team languages, ${RUNS} runs`);
  const results = new Map<string, Result>(); // `${model}|${item}|${team}|${run}`
  for (let run = 1; run <= RUNS; run++) {
    for (const item of [...items, constructed]) {
      for (const team of TEAM_LANGUAGES) {
        for (const m of MODELS) {
          results.set(`${m}|${item.key}|${team}|${run}`, await extract(m, clients, team, item.turns, `${item.key}-${team}`));
        }
      }
      process.stdout.write(".");
    }
  }
  console.log("");

  // ── Score ────────────────────────────────────────────────────────────
  const byModelLang = new Map<string, Score>();
  const failures: string[] = [];
  for (const m of MODELS) {
    for (const item of [...items, constructed]) {
      for (const team of TEAM_LANGUAGES) {
        const sonnetScores = [1, 2].map((r) => results.get(`sonnet|${item.key}|${team}|${r}`)?.extracted?.qualification_score).filter((x): x is number => typeof x === "number");
        const sonnetRef = results.get(`sonnet|${item.key}|${team}|1`)?.extracted;
        for (let run = 1; run <= RUNS; run++) {
          const r = results.get(`${m}|${item.key}|${team}|${run}`)!;
          const key = `${m}|${item.key === "constructed" ? "Arabic-Indic" : item.lang}`;
          const sc = byModelLang.get(key) ?? byModelLang.set(key, blank()).get(key)!;
          sc.calls++;
          sc.cost += r.cost;
          const e = r.extracted;
          if (!e) { sc.failed++; failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: no result (${r.error})`); continue; }
          if (e.name === item.name) sc.name++; else failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: name ${JSON.stringify(e.name)} (want ${item.name})`);
          if (digits(e.contact_info).includes(item.digits)) sc.digitsOk++; else failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: contact ${JSON.stringify(e.contact_info)}`);
          if (typeof e.contact_info === "string" && !/[٠-٩۰-۹]/.test(e.contact_info)) sc.asciiOnly++;
          if (resolveLanguageCode(e.visitor_language ?? "") === item.visitorCode) sc.visitorLang++; else failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: visitor_language ${JSON.stringify(e.visitor_language)}`);
          if (e.age === null || e.age === undefined) sc.ageNull++;
          const keep = [item.name, "Implant Swiss", "Straumann", "TEST — Prof Clinic", "WhatsApp"];
          if (present(e.ai_summary)) {
            sc.summaries++;
            if (inTeamLanguage(String(e.ai_summary), team, keep)) sc.summaryTeam++;
            else failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: summary not in ${team}: ${String(e.ai_summary).slice(0, 140)}`);
          }
          for (const f of ["main_concern", "notes"] as const) {
            if (!present(e[f]) || String(e[f]).length < 25) continue; // short values are often a brand or a number
            sc.fieldsWritten++;
            if (inTeamLanguage(String(e[f]), team, keep)) sc.fieldsTeam++;
            else failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: ${f} not in ${team}: ${String(e[f]).slice(0, 100)}`);
          }
          const guarded = dropUnsupportedNumbers(
            Object.fromEntries(GENERATED_LEAD_FIELDS.map((f) => [f, (e as Record<string, unknown>)[f] ?? null])),
            transcriptText(item.turns)
          );
          if (guarded.dropped.length) { sc.invented++; failures.push(`${m} ${item.lang} ${item.key} ${team} r${run}: figures not in transcript ${JSON.stringify(guarded.dropped)}`); }
          if (m !== "sonnet" && sonnetScores.length && typeof e.qualification_score === "number") {
            sc.scoreCompared++;
            const mean = sonnetScores.reduce((a, b) => a + b, 0) / sonnetScores.length;
            if (Math.abs(e.qualification_score - mean) <= 15) sc.scoreWithin++;
          }
          if (sonnetRef && !(m === "sonnet" && run === 1)) {
            for (const f of TEXT_FIELDS) {
              sc.fieldCompared++;
              if (present(e[f]) === present(sonnetRef[f])) sc.fieldAgree++;
            }
          }
        }
      }
    }
  }

  // ── C. Turn-by-turn replay: cache and real per-conversation cost ─────
  const replay: string[] = [];
  for (const lang of ["English", "Arabic"]) {
    const item = items.find((i) => i.lang === lang)!;
    const userIdx = item.turns.map((t, i) => (t.role === "user" ? i : -1)).filter((i) => i >= 0);
    for (const m of MODELS) {
      let total = 0, read = 0, input = 0;
      const perTurn: string[] = [];
      for (const ui of userIdx) {
        const prefix = item.turns.slice(0, ui + 2); // through this turn's reply
        const r = await extract(m, clients, "English", prefix, `replay-${item.key}-${m}`);
        total += r.cost;
        const t = r.tokens ?? {};
        read += t.cacheReadInputTokens ?? 0;
        input += (t.inputTokens ?? 0) + (t.cacheReadInputTokens ?? 0) + (t.cacheWriteInputTokens ?? 0);
        perTurn.push(`${(t.cacheReadInputTokens ?? 0) > 0 ? "hit" : "miss"} $${r.cost.toFixed(5)}`);
      }
      replay.push(`| ${m} | ${lang} | ${userIdx.length} | $${total.toFixed(4)} | $${(total / userIdx.length).toFixed(5)} | ${Math.round((100 * read) / Math.max(1, input))}% | ${perTurn.join(", ")} |`);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────
  const pct = (n: number, d: number) => (d ? `${n}/${d}` : "—");
  const order = ["English", "Arabic", "Russian", "Chinese", "Turkish", "Spanish", "Arabic-Indic"];
  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [`# Lead extraction: Sonnet vs gpt-6.1-terra vs gpt-6-luna, ${date}`, "",
    `Offline, stored test-clinic transcripts: ${items.length} conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, ${RUNS} runs.`, ""];
  out.push("| Model | Visitor language | Calls | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per call |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const totals = new Map<Model, Score>();
  for (const m of MODELS) {
    for (const lang of order) {
      const sc = byModelLang.get(`${m}|${lang}`);
      if (!sc) continue;
      const t = totals.get(m) ?? totals.set(m, blank()).get(m)!;
      for (const k of Object.keys(sc) as (keyof Score)[]) (t[k] as number) += sc[k] as number;
      const ok = sc.calls - sc.failed;
      out.push(`| ${m} | ${lang} | ${sc.calls}${sc.failed ? ` (${sc.failed} failed)` : ""} | ${pct(sc.name, ok)} | ${pct(sc.digitsOk, ok)} | ${pct(sc.asciiOnly, ok)} | ${pct(sc.visitorLang, ok)} | ${pct(sc.ageNull, ok)} | ${pct(sc.summaryTeam, sc.summaries)} | ${pct(sc.fieldsTeam, sc.fieldsWritten)} | ${sc.invented} | ${m === "sonnet" ? "—" : pct(sc.scoreWithin, sc.scoreCompared)} | ${pct(sc.fieldAgree, sc.fieldCompared)} | $${(sc.cost / sc.calls).toFixed(5)} |`);
    }
  }
  for (const [m, t] of Array.from(totals)) {
    const ok = t.calls - t.failed;
    out.push(`| **${m}** | **all** | ${t.calls} | ${pct(t.name, ok)} | ${pct(t.digitsOk, ok)} | ${pct(t.asciiOnly, ok)} | ${pct(t.visitorLang, ok)} | ${pct(t.ageNull, ok)} | ${pct(t.summaryTeam, t.summaries)} | ${pct(t.fieldsTeam, t.fieldsWritten)} | ${t.invented} | ${m === "sonnet" ? "—" : pct(t.scoreWithin, t.scoreCompared)} | ${pct(t.fieldAgree, t.fieldCompared)} | $${(t.cost / t.calls).toFixed(5)} |`);
  }
  out.push("", "## Per conversation: every turn replayed, as production extracts", "",
    "| Model | Conversation | Turns | Cost | Per call | Input read from cache | Per turn |", "|---|---|---|---|---|---|---|", ...replay, "");
  if (failures.length) out.push("## Every miss, for reading", "", ...failures.map((f) => `- ${f}`), "");
  const path = join(__dirname, "..", "docs", `extraction-provider-${date}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(out.join("\n"));
  console.log(`\nwrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
