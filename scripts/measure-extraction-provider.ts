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

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { tieFreeSmokeConversations } from "./_tie-free-sessions";
import { dropUnsupportedNumbers, GENERATED_LEAD_FIELDS } from "../lib/lead-language";
import {
  callLeadExtraction,
  callLeadExtractionOpenAI,
  extractionTurns,
  transcriptText,
  LEAD_EXTRACTION_MAX_TOKENS,
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

type Result = { extracted: Partial<ExtractedLead> | null; tokens: TokenCounts | null; cost: number; rawText: string; stopReason?: string | null; error?: string };

/**
 * Every key the extraction prompt asks for. With no JSON mode on either
 * provider, a response missing one, or with no usable JSON at all, is a
 * HARD failure: the route saves nothing from it, and that turn's lead is
 * lost.
 */
const REQUIRED_KEYS = [
  "name", "contact_info", "age", "main_concern", "priority", "duration_of_issue",
  "timeline", "travel_country", "notes", "visitor_language", "ai_summary", "qualification_score",
] as const;

/** Why a response is unusable, or null if it is usable. API errors are reported separately. */
function parseFailure(r: Result): string | null {
  if (r.error && !r.rawText) return null; // the call itself failed: not a parse failure
  if (!r.extracted) return `no usable JSON: ${JSON.stringify(r.rawText.slice(0, 160))}`;
  const missing = REQUIRED_KEYS.filter((k) => !(k in r.extracted!));
  return missing.length ? `missing ${missing.join(", ")}: ${JSON.stringify(r.rawText.slice(0, 160))}` : null;
}
const parseFailures: string[] = [];
const apiErrors: string[] = [];
const parseCount = new Map<string, number>();
const callCount = new Map<string, number>();
function noteParse(model: string, where: string, r: Result) {
  callCount.set(model, (callCount.get(model) ?? 0) + 1);
  const why = parseFailure(r);
  if (why) {
    parseCount.set(model, (parseCount.get(model) ?? 0) + 1);
    parseFailures.push(`${model} · ${where} · ${why}`);
  } else if (r.error && !r.rawText) {
    apiErrors.push(`${model} · ${where} · ${r.error}`);
  }
}

// ── Checkpoint and resume ─────────────────────────────────────────────
// CHECKPOINT: every response is appended to this file the moment it
// arrives, so an interruption loses nothing, and a rerun reuses what is
// there instead of paying for it again. A call that failed to connect is
// written too but not reused, so a rerun retries it.
//
// RESUME_FROM: a report from an interrupted run. Only the calls listed
// there as connection errors are made; every other call is skipped.
const CHECKPOINT = process.env.CHECKPOINT ?? "";
const RESUME_FROM = process.env.RESUME_FROM ?? "";
const done = new Map<string, Result>();
const failedToConnect = (r: Result) => Boolean(r.error) && !r.rawText;

function loadCheckpoint() {
  if (!CHECKPOINT || !existsSync(CHECKPOINT)) return;
  for (const line of readFileSync(CHECKPOINT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const { key, result } = JSON.parse(line) as { key: string; result: Result };
    if (!failedToConnect(result)) done.set(key, result);
  }
}

/** The calls an interrupted run never made, read from its report. */
function resumeKeys(reportPath: string): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(reportPath, "utf8").split("\n")) {
    if (!line.includes("Connection error")) continue;
    const ab = line.match(/^- (\S+) · \S+ (\S+) (English|Turkish) r(\d) · /);
    if (ab) { keys.add(`${ab[1]}|${ab[2]}|${ab[3]}|${ab[4]}`); continue; }
    const rp = line.match(/^- (\S+) · replay \S+ (\S+) turn (\d+) · /);
    if (rp) keys.add(`replay|${rp[1]}|${rp[2]}|${rp[3]}`);
  }
  return keys;
}
const wanted: Set<string> | null = RESUME_FROM ? resumeKeys(RESUME_FROM) : null;

/** A result from the checkpoint, a new call, or null when this run must not make it. */
async function obtain(key: string, call: () => Promise<Result>): Promise<Result | null> {
  const saved = done.get(key);
  if (saved) return saved;
  if (wanted && !wanted.has(key)) return null;
  const r = await call();
  if (CHECKPOINT) appendFileSync(CHECKPOINT, JSON.stringify({ key, at: new Date().toISOString(), result: r }) + "\n");
  if (!failedToConnect(r)) done.set(key, r);
  return r;
}

// Why each response stopped, to confirm or rule out truncation.
const stopReasons = new Map<string, Map<string, number>>();
const atLimit: string[] = [];
function noteStop(model: string, where: string, r: Result) {
  if (failedToConnect(r)) return;
  const reason = r.stopReason ?? "unknown";
  const m = stopReasons.get(model) ?? stopReasons.set(model, new Map()).get(model)!;
  m.set(reason, (m.get(reason) ?? 0) + 1);
  if (reason === "max_tokens" || reason === "max_output_tokens") {
    atLimit.push(`${model} · ${where} · stopped at the output limit, ${r.tokens?.outputTokens ?? "?"} tokens, parsed: ${r.extracted ? "yes" : "NO"}`);
  }
}

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
    return { extracted: r.extracted, tokens, cost: tokens ? calculateCostUsd(LEAD_EXTRACTION_MODEL, tokens) : 0, rawText: r.rawText, stopReason: r.stopReason, error: r.error };
  }
  const r = await callLeadExtractionOpenAI(clients.openai, model, language, turns, cacheKey);
  return { extracted: r.extracted, tokens: r.tokens, cost: r.tokens ? calculateCostUsd(model, r.tokens) : 0, rawText: r.rawText, stopReason: r.stopReason, error: r.error };
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

type Item = { key: string; sessionId?: string; lang: string; name: string; digits: string; visitorCode: string; turns: TranscriptTurn[] };
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
  // Only conversations whose turn order is certain: stored after the
  // 2026-11-04 timestamp fix, no two rows sharing a timestamp. Before that
  // a turn's rows tied and read back in no fixed order, which is why the
  // 2026-11-17 run gave every model partly reversed transcripts. The
  // session ids are written into the report, so a rerun uses the same
  // input.
  const stored = await tieFreeSmokeConversations(s, tenant.id, PER_OPENER);
  const items: Item[] = stored.map((c) => {
    const lang = c.case.label.split(" ")[0];
    const last = c.turns.length - 2; // the final visitor message; the reply follows it
    return {
      key: c.sessionId.slice(0, 8), sessionId: c.sessionId, lang, name: c.case.name, digits: c.case.digits, visitorCode: VISITOR_CODE[lang],
      turns: extractionTurns(c.turns.slice(0, last), null, c.turns[last].content, c.turns[last + 1].content),
    };
  });
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

  loadCheckpoint();
  if (wanted) {
    // Every call to resume has to map onto a conversation this run found.
    // Checked before anything is spent.
    const known = new Set([...items, constructed].map((i) => i.key));
    const orphan = Array.from(wanted).filter((k) => !known.has(k.startsWith("replay|") ? k.split("|")[2] : k.split("|")[1]));
    if (orphan.length) throw new Error(`calls to resume that match no conversation: ${orphan.join(", ")}`);
    console.log(`resuming ${wanted.size} calls from ${RESUME_FROM}; ${done.size} already in the checkpoint`);
    if (process.env.DRY_RUN === "1") {
      const byModel = new Map<string, number>();
      for (const k of Array.from(wanted)) { const m = k.startsWith("replay|") ? k.split("|")[1] : k.split("|")[0]; byModel.set(m, (byModel.get(m) ?? 0) + 1); }
      console.log(`dry run, no calls: ${JSON.stringify(Object.fromEntries(byModel))}`);
      process.exit(0);
    }
  }
  console.log(`${items.length} stored conversations + 1 constructed, ${MODELS.length} models, ${TEAM_LANGUAGES.length} team languages, ${RUNS} runs`);
  const results = new Map<string, Result>(); // `${model}|${item}|${team}|${run}`
  for (let run = 1; run <= RUNS; run++) {
    for (const item of [...items, constructed]) {
      for (const team of TEAM_LANGUAGES) {
        for (const m of MODELS) {
          const key = `${m}|${item.key}|${team}|${run}`;
          const r = await obtain(key, () => extract(m, clients, team, item.turns, `${item.key}-${team}`));
          if (!r) continue;
          noteParse(m, `${item.lang} ${item.key} ${team} r${run}`, r);
          noteStop(m, `${item.lang} ${item.key} ${team} r${run}`, r);
          results.set(key, r);
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
        const refRun = results.get(`sonnet|${item.key}|${team}|1`)?.extracted ? 1 : 2;
        const sonnetRef = results.get(`sonnet|${item.key}|${team}|${refRun}`)?.extracted;
        for (let run = 1; run <= RUNS; run++) {
          const r = results.get(`${m}|${item.key}|${team}|${run}`);
          // A call that never connected is listed under API errors, not scored.
          if (!r || failedToConnect(r)) continue;
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
          if (sonnetRef && !(m === "sonnet" && run === refRun)) {
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
        const turnNo = perTurn.length + 1;
        const r = await obtain(`replay|${m}|${item.key}|${turnNo}`, () => extract(m, clients, "English", prefix, `replay-${item.key}-${m}`));
        if (!r) { perTurn.push("not run"); continue; }
        noteParse(m, `replay ${lang} ${item.key} turn ${turnNo}`, r);
        noteStop(m, `replay ${lang} ${item.key} turn ${turnNo}`, r);
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
    `Offline, stored test-clinic transcripts: ${items.length} conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, ${RUNS} runs. Output limit ${LEAD_EXTRACTION_MAX_TOKENS} tokens on every model.`, "",
    `Conversations (stored after the 2026-11-04 timestamp fix, no tied rows): ${items.map((i) => `${i.lang} \`${i.sessionId}\``).join(", ")}.`, ""];
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
  out.push("## Parse failures (hard: a lost lead)", "", "| Model | Calls | No usable JSON or a missing field | API errors |", "|---|---|---|---|");
  for (const m of MODELS) {
    out.push(`| ${m} | ${callCount.get(m) ?? 0} | **${parseCount.get(m) ?? 0}** | ${apiErrors.filter((e) => e.startsWith(m + " ")).length} |`);
  }
  out.push("");
  if (parseFailures.length) out.push(...parseFailures.map((f) => `- ${f}`), "");
  if (apiErrors.length) out.push("API errors (the call failed; not counted as parse failures):", "", ...apiErrors.map((f) => `- ${f}`), "");
  out.push("## Why each response stopped", "", "| Model | Stop reasons |", "|---|---|");
  for (const m of MODELS) {
    const reasons = Array.from(stopReasons.get(m) ?? new Map()).map(([k, v]) => `${k}: ${v}`).join(", ");
    out.push(`| ${m} | ${reasons || "—"} |`);
  }
  out.push("");
  if (atLimit.length) out.push("Responses that stopped at the output limit:", "", ...atLimit.map((x) => `- ${x}`), "");
  if (RESUME_FROM) out.push(...mergedTable(RESUME_FROM, byModelLang, order), "");
  if (failures.length) out.push("## Every miss, for reading", "", ...failures.map((f) => `- ${f}`), "");
  const path = join(__dirname, "..", "docs", process.env.REPORT ?? `extraction-provider-${date}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(out.join("\n"));
  console.log(`\nwrote ${path}`);
}

/**
 * The interrupted run's table plus this run's, cell by cell.
 *
 * Every cell is a count (n/d), so the sum is exact. The interrupted run
 * counted its connection errors as calls that "failed", and this run
 * makes exactly those calls again, so they are taken back out of its
 * call and failure counts before adding.
 */
function mergedTable(oldReport: string, fresh: Map<string, Score>, order: string[]): string[] {
  const text = readFileSync(oldReport, "utf8");
  const oldErrors = new Map<string, number>();
  for (const line of text.split("\n")) {
    const ab = line.match(/^- (\S+) · (\S+) (\S+) (English|Turkish) r\d · Connection error/);
    if (ab) {
      const lang = ab[3] === "constructed" ? "Arabic-Indic" : ab[2];
      oldErrors.set(`${ab[1]}|${lang}`, (oldErrors.get(`${ab[1]}|${lang}`) ?? 0) + 1);
    }
  }
  const nd = (cell: string) => (cell === "—" ? [0, 0] : cell.split("/").map(Number));
  const lines = ["## Combined: the interrupted run plus the resumed calls", "",
    "| Model | Visitor language | Calls returned | Parse failures | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per returned call |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  const row = /^\| (sonnet|gpt-6\.1-terra|gpt-6-luna) \| ([A-Za-z-]+) \| (\d+)(?: \((\d+) failed\))? \| (.+) \| \$([\d.]+) \|$/;
  for (const line of text.split("\n")) {
    const m = line.match(row);
    if (!m) continue;
    const [, model, lang, callsStr, failedStr, middle, costStr] = m;
    const cells = middle.split(" | ");
    const errs = oldErrors.get(`${model}|${lang}`) ?? 0;
    const oldCalls = Number(callsStr), oldFailed = Number(failedStr ?? 0);
    const returned = oldCalls - errs, parseFailed = oldFailed - errs;
    const oldCost = Number(costStr) * oldCalls;
    const f = fresh.get(`${model}|${lang}`) ?? blank();
    // Fresh connection failures are never scored, so every fresh call here
    // returned a response; the ones with no usable JSON are its failures.
    const fReturned = f.calls;
    const freshParse = f.failed;
    const add = (i: number, n: number, d: number) => { const [a, b] = nd(cells[i]); return a + n + b + d === 0 ? "—" : `${a + n}/${b + d}`; };
    const ok = f.calls - f.failed;
    lines.push(`| ${model} | ${lang} | ${returned + fReturned} | ${parseFailed + freshParse} | ${add(0, f.name, ok)} | ${add(1, f.digitsOk, ok)} | ${add(2, f.asciiOnly, ok)} | ${add(3, f.visitorLang, ok)} | ${add(4, f.ageNull, ok)} | ${add(5, f.summaryTeam, f.summaries)} | ${add(6, f.fieldsTeam, f.fieldsWritten)} | ${Number(cells[7]) + f.invented} | ${model === "sonnet" ? "—" : add(8, f.scoreWithin, f.scoreCompared)} | ${add(9, f.fieldAgree, f.fieldCompared)} | ${((oldCost + f.cost) / Math.max(1, returned + fReturned)).toFixed(5)} |`);
  }
  void order;
  return lines;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
