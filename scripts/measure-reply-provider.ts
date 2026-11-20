// Can a cheaper OpenAI model write the chat REPLY as well as Sonnet?
//
//   LIVE=1 BASE_URL=http://localhost:3100 DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/measure-reply-provider.ts
//
// PAID. State the cost and get a yes before setting LIVE=1. Default run:
// the six smoke-test conversations x 2 arms (Sonnet, REPLY_MODEL) x 2
// runs = 24 conversations of 7 turns, plus a Sonnet dialect judgement of
// every reply.
//
// Only the REPLY changes between arms. Classifier, lead extraction and
// coverage run exactly as in production. Capture is skipped, as in the
// smoke test, so the dashboard does not fill with our own questions.
//
// The switch is honoured only on a test tenant (testReplyModel in
// lib/test-tenant.ts). The first OpenAI turn is checked against
// usage_events before anything else is spent, so a server that ignores
// the switch stops the run instead of producing a Sonnet-vs-Sonnet
// comparison that looks like a result.
//
// Writes docs/reply-provider-<date>.md: the summary, then both
// transcripts side by side for reading.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { say, SLUG, type Reply } from "./_chat-client";
import { CASES as CLINIC_CASES, HESITATION_TURN, type Case } from "./_smoke-cases";
import { REALTY_CASES } from "./_realty-cases";
// CASE_SET=realty runs test-realty's conversations (set SLUG=test-realty too).
const CASES: Case[] = process.env.CASE_SET === "realty" ? REALTY_CASES : CLINIC_CASES;
import { allSafeFallbacks } from "../lib/safe-fallback";
import { countWords } from "../lib/punctuation";
import { detectScript } from "../lib/visitor-language";
import { replyDensity, isOverloaded } from "../lib/reply-density";
import { shapeOf } from "../lib/conversation-state";
import { TEST_REPLY_MODELS } from "../lib/test-tenant";

/** OpenAI arms, comma-separated. Sonnet is always the first arm. */
const MODELS = (process.env.REPLY_MODELS ?? process.env.REPLY_MODEL ?? "gpt-6.1-terra").split(",").map((m) => m.trim()).filter(Boolean);
const RUNS = Number(process.env.RUNS ?? 2);
// SKIP_SONNET=1 runs only the OpenAI arm(s), when Sonnet's side comes
// from stored production conversations instead (measure-reply-specifics).
// EXTRACTION_MODEL puts lead extraction on that model too: it runs after
// the reply, so it does not change the reply, and it saves the Sonnet
// extraction calls. MEASURE_ONE=1 makes one turn on the first OpenAI arm
// and prints what it cost, from usage_events.
const SKIP_SONNET = process.env.SKIP_SONNET === "1";
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL;
// OPENAI_STACK=1 asks the route to put every call on OpenAI (testOpenAIStack,
// test tenants only), and the report counts any Anthropic call left.
const OPENAI_STACK = process.env.OPENAI_STACK === "1";
const ARMS: { label: string; model?: string }[] = [...(SKIP_SONNET ? [] : [{ label: "sonnet" }]), ...MODELS.map((m) => ({ label: m, model: m }))];
const HESITATION_MAX_RATIO = 0.6;
const PAUSE_MS = 1500;

/** How each smoke visitor writes, named for the dialect judge. */
const VARIETY: Record<string, string> = {
  English: "British English",
  Arabic: "Modern Standard Arabic (fusha), with no regional dialect",
  Russian: "Standard Russian",
  Chinese: "Mainland Simplified Chinese",
  Turkish: "Standard Turkish",
  Spanish: "European (peninsular) Spanish",
};
const varietyOf = (c: Case) => VARIETY[c.label.split(" ")[0]];

type Turn = { visitor: string; reply: string; signals?: Reply["signals"]; businessFacts?: string[]; classifierMs?: number; failed?: string };
type Conversation = {
  arm: string;
  run: number;
  case: Case;
  sessionId: string;
  turns: Turn[];
  hard: string[];
  lead: { name: boolean; number: boolean };
  dialect: { judged: number; introduced: number; failed: number; markers: string[] };
  cost: number;
  replyModels: string[];
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FALLBACKS = allSafeFallbacks();

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(
      `(skipped: ${CASES.length * ARMS.length * RUNS} conversations and a dialect judgement of every reply — ` +
        `set LIVE=1 to run it, after stating the cost)`
    );
    return;
  }
  for (const m of MODELS) if (!(TEST_REPLY_MODELS as readonly string[]).includes(m)) throw new Error(`${m} is not allowlisted`);
  const { openai } = await import("../lib/openai");
  // The judge runs on OpenAI (gpt-6.1-terra), validated 48/48 on 2026-11-18.
  const { judgeDialectOpenAI } = await import("../lib/dialect-judge");
  const { supabaseServer: s } = await import("../lib/supabase-server");

  if (process.env.MEASURE_ONE === "1") {
    const arm = ARMS.find((a) => a.model)!;
    const sid = crypto.randomUUID();
    const r = await say(sid, CASES[0].turns[0], SLUG, {
      skipCapture: true, includeSignals: true, replyModel: arm.model,
      ...(EXTRACTION_MODEL && { extractionModel: EXTRACTION_MODEL }),
      ...(OPENAI_STACK && { openaiStack: true }),
    });
    await pause(12000);
    const { data } = await s.from("usage_events").select("call_type, provider, model, cost_usd").eq("session_id", sid);
    const total = (data ?? []).reduce((a, x) => a + Number(x.cost_usd), 0);
    console.log(`one turn (${arm.model}): ${total.toFixed(5)}  ${JSON.stringify(data)}\n  reply: ${r.reply.replace(/\s+/g, " ").slice(0, 160)}`);
    return;
  }
  const conversations: Conversation[] = [];
  const switchVerified = new Set<string>();

  for (let run = 1; run <= RUNS; run++) {
    for (const c of CASES) {
      for (const arm of ARMS) {
        const conv: Conversation = {
          arm: arm.label, run, case: c, sessionId: crypto.randomUUID(), turns: [], hard: [],
          lead: { name: false, number: false }, dialect: { judged: 0, introduced: 0, failed: 0, markers: [] },
          cost: 0, replyModels: [],
        };
        console.log(`\n── run ${run} · ${arm.label} · ${c.label}`);
        for (let i = 0; i < c.turns.length; i++) {
          let result: Reply;
          try {
            result = await say(conv.sessionId, c.turns[i], SLUG, {
              skipCapture: true,
              includeSignals: true,
              ...(arm.model && { replyModel: arm.model }),
              ...(arm.model && EXTRACTION_MODEL && { extractionModel: EXTRACTION_MODEL }),
              ...(arm.model && OPENAI_STACK && { openaiStack: true }),
            });
          } catch (error) {
            conv.turns.push({ visitor: c.turns[i], reply: "", failed: String((error as Error).message).slice(0, 120) });
            conv.hard.push(`turn ${i + 1}: request failed`);
            continue;
          }
          await pause(PAUSE_MS);
          const flat = result.reply.replace(/\s+/g, " ").trim();
          conv.turns.push({ visitor: c.turns[i], reply: result.reply, signals: result.signals, businessFacts: result.businessFacts, classifierMs: result.classifierMs });

          // Before spending anything more: did the server actually switch?
          if (arm.model && !switchVerified.has(arm.model)) {
            await pause(2000);
            const { data } = await s.from("usage_events").select("model").eq("session_id", conv.sessionId).eq("call_type", "chat_reply");
            const models = (data ?? []).map((r) => r.model);
            if (!models.includes(arm.model)) {
              throw new Error(`the server did not honour replyModel: reply was written by ${models.join(", ") || "nothing recorded"}. Stopping.`);
            }
            switchVerified.add(arm.model);
            console.log(`   (switch verified: reply written by ${arm.model})`);
          }

          // The smoke test's hard checks.
          if (FALLBACKS.some((f) => flat.startsWith(f.slice(0, 25)))) conv.hard.push(`turn ${i + 1}: safe fallback`);
          const script = detectScript([flat]);
          if (script && script !== c.script) conv.hard.push(`turn ${i + 1}: replied in ${script}`);
          if (i === HESITATION_TURN && result.signals?.available && !result.signals.hesitation) {
            conv.hard.push(`turn ${i + 1}: hesitation not detected`);
          }
          console.log(`   turn ${i + 1}: ${String(countWords(flat)).padStart(3)}w  ${flat.slice(0, 60)}`);
        }

        // Lead: name and number, as the smoke test asserts.
        for (let waited = 0; waited < 40; waited += 5) {
          await pause(5000);
          const { data } = await s.from("lead_profile").select("name, contact_info").eq("session_id", conv.sessionId).maybeSingle();
          conv.lead.name = (data?.name ?? "").includes(c.name);
          conv.lead.number = (data?.contact_info ?? "").replace(/\D/g, "").includes(c.digits);
          if (conv.lead.name && conv.lead.number) break;
        }
        if (!conv.lead.name) conv.hard.push("lead name missing");
        if (!conv.lead.number) conv.hard.push("lead number missing");

        // Dialect: every reply, against the variety the visitor wrote in.
        for (const t of conv.turns) {
          if (!t.reply) continue;
          const v = await judgeDialectOpenAI(openai, varietyOf(c), t.reply);
          if (v.failed) conv.dialect.failed++;
          else {
            conv.dialect.judged++;
            if (v.introduced) {
              conv.dialect.introduced++;
              conv.dialect.markers.push(...v.markers);
            }
          }
        }
        conversations.push(conv);
      }
    }
  }

  // Cost and which model actually replied, from what was recorded.
  await pause(10000);
  for (const conv of conversations) {
    const { data } = await s.from("usage_events").select("call_type, model, cost_usd").eq("session_id", conv.sessionId);
    conv.cost = (data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
    conv.replyModels = Array.from(new Set((data ?? []).filter((r) => r.call_type === "chat_reply").map((r) => r.model)));
  }

  writeReport(conversations);
  // The session ids, for scripts/measure-reply-specifics.ts.
  const sessionsPath = join(__dirname, "..", "docs", process.env.SESSIONS_FILE ?? `reply-provider-${new Date().toISOString().slice(0, 10)}.sessions.json`);
  // Under the OpenAI stack: no Anthropic call may remain, and the
  // classifier's time per turn is kept for the latency bar.
  if (OPENAI_STACK) {
    const { data: rows } = await s.from("usage_events").select("provider, call_type, model").in("session_id", conversations.map((c) => c.sessionId));
    const anthropicRows = (rows ?? []).filter((r) => r.provider !== "openai");
    const ms = conversations.flatMap((c) => c.turns.map((t) => t.classifierMs).filter((x): x is number => typeof x === "number")).sort((a, b) => a - b);
    const p95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : NaN;
    console.log(`usage rows: ${rows?.length ?? 0}, not OpenAI: ${anthropicRows.length}${anthropicRows.length ? " " + JSON.stringify(anthropicRows.slice(0, 5)) : ""}`);
    console.log(`classifier time from the start of the turn: p50 ${ms[Math.floor(ms.length / 2)]} ms, p95 ${p95} ms over ${ms.length} turns`);
  }
  writeFileSync(sessionsPath, JSON.stringify(conversations.map((c) => ({ arm: c.arm, run: c.run, label: c.case.label, sessionId: c.sessionId, offered: c.turns.map((t) => t.businessFacts ?? []), classifierMs: c.turns.map((t) => t.classifierMs ?? null) })), null, 2));
  console.log(`wrote ${sessionsPath}`);
}

// ── Metrics ────────────────────────────────────────────────────────────
function metrics(convs: Conversation[]) {
  const replies = convs.flatMap((c) => c.turns.filter((t) => t.reply).map((t) => t.reply));
  const words = replies.map((r) => countWords(r));
  let repeatedShape = 0, shapePairs = 0, hesitationOver = 0;
  const ratios: number[] = [];
  for (const c of convs) {
    const shapes = c.turns.filter((t) => t.reply).map((t) => shapeOf(t.reply));
    for (let i = 1; i < shapes.length; i++) {
      shapePairs++;
      const [a, b] = [shapes[i - 1], shapes[i]];
      if (a.paragraphs === b.paragraphs && a.endsWithQuestion === b.endsWithQuestion && a.length === b.length) repeatedShape++;
    }
    const before = c.turns.slice(0, HESITATION_TURN).filter((t) => t.reply).map((t) => countWords(t.reply));
    const hes = c.turns[HESITATION_TURN]?.reply;
    if (hes && before.length) {
      const ratio = countWords(hes) / Math.max(...before, 1);
      ratios.push(ratio);
      if (ratio > HESITATION_MAX_RATIO) hesitationOver++;
    }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return {
    conversations: convs.length,
    hardFailures: convs.reduce((a, c) => a + c.hard.length, 0),
    scriptMismatches: convs.reduce((a, c) => a + c.hard.filter((h) => h.includes("replied in")).length, 0),
    conversationsWithHardFailure: convs.filter((c) => c.hard.length).length,
    leadsComplete: convs.filter((c) => c.lead.name && c.lead.number).length,
    dialectIntroduced: convs.reduce((a, c) => a + c.dialect.introduced, 0),
    dialectJudged: convs.reduce((a, c) => a + c.dialect.judged, 0),
    dialectFailed: convs.reduce((a, c) => a + c.dialect.failed, 0),
    overloaded: replies.filter((r) => isOverloaded(r)).length,
    replies: replies.length,
    meanUnits: mean(replies.map((r) => replyDensity(r).units)),
    meanWords: mean(words),
    repeatedShape,
    shapePairs,
    hesitationRatio: mean(ratios),
    hesitationOver,
    hesitationTurns: ratios.length,
    costPerConversation: mean(convs.map((c) => c.cost)),
  };
}

function writeReport(conversations: Conversation[]) {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  const arms = ARMS.map((a) => a.label);
  const byArm = (arm: string, run?: number) => conversations.filter((c) => c.arm === arm && (run === undefined || c.run === run));
  const pct = (n: number, d: number) => `${n}/${d}${d ? ` (${Math.round((100 * n) / d)}%)` : ""}`;

  lines.push(`# Reply provider: Sonnet vs ${MODELS.join(" vs ")}, ${date}`, "");
  lines.push(`Six smoke-test conversations × ${RUNS} runs per arm, on test-clinic. Only the reply model differs.`, "");
  const rows: [string, (m: ReturnType<typeof metrics>) => string][] = [
    ["Hard failures (smoke checks)", (m) => `${m.hardFailures} in ${m.conversationsWithHardFailure}/${m.conversations} conv.`],
    ["Leads with name and number", (m) => pct(m.leadsComplete, m.conversations)],
    ["Replies in the wrong script", (m) => pct(m.scriptMismatches, m.replies)],
    ["Dialect introduced (judge)", (m) => `${pct(m.dialectIntroduced, m.dialectJudged)}${m.dialectFailed ? `, ${m.dialectFailed} unjudged` : ""}`],
    ["Overloaded replies (density)", (m) => pct(m.overloaded, m.replies)],
    ["Mean units per reply", (m) => m.meanUnits.toFixed(2)],
    ["Mean words per reply", (m) => m.meanWords.toFixed(0)],
    ["Consecutive replies, same shape", (m) => pct(m.repeatedShape, m.shapePairs)],
    ["Hesitation reply / longest earlier", (m) => `${m.hesitationRatio.toFixed(2)} mean; over 0.6: ${pct(m.hesitationOver, m.hesitationTurns)}`],
    ["Measured cost per conversation", (m) => `$${m.costPerConversation.toFixed(4)}`],
  ];
  const header = ["Metric", ...arms.flatMap((a) => Array.from({ length: RUNS }, (_, r) => `${a} run ${r + 1}`)), ...arms.map((a) => `${a} all`)];
  lines.push(`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
  for (const [name, f] of rows) {
    const cells = [
      ...arms.flatMap((a) => Array.from({ length: RUNS }, (_, r) => f(metrics(byArm(a, r + 1))))),
      ...arms.map((a) => f(metrics(byArm(a)))),
    ];
    lines.push(`| ${name} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  const failures = conversations.filter((c) => c.hard.length);
  if (failures.length) {
    lines.push("## Hard failures", "");
    for (const c of failures) lines.push(`- ${c.arm} run ${c.run}, ${c.case.label}: ${c.hard.join("; ")}`);
    lines.push("");
  }
  // A failure is SYSTEMATIC if the same check failed for the same arm and
  // conversation in every run, and ONE-OFF if only in some runs.
  const kinds = new Map<string, Set<number>>();
  for (const c of conversations) {
    for (const h of c.hard) {
      const key = `${c.arm} · ${c.case.label} · ${h.replace(/^turn \d+: /, "")}`;
      (kinds.get(key) ?? kinds.set(key, new Set()).get(key)!).add(c.run);
    }
  }
  if (kinds.size) {
    lines.push("## Systematic or one-off", "");
    for (const [key, runs] of Array.from(kinds)) {
      lines.push(`- ${runs.size === RUNS ? "**systematic**" : "one-off"} (${runs.size}/${RUNS} runs): ${key}`);
    }
    lines.push("");
  }
  const mismatched = conversations.filter((c) => c.replyModels.length !== 1 || c.replyModels[0] !== (ARMS.find((a) => a.label === c.arm)!.model ?? "claude-sonnet-4-6"));
  lines.push(`Reply model recorded per conversation matches its arm: ${mismatched.length === 0 ? "yes, all" : `NO for ${mismatched.length}`}.`, "");
  const markers = (arm: string) => byArm(arm).flatMap((c) => c.dialect.markers);
  for (const a of arms) if (markers(a).length) lines.push(`Dialect markers flagged for ${a}: ${markers(a).slice(0, 30).join(", ")}`, "");

  // Side by side, for reading.
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  lines.push("## Transcripts, side by side", "");
  for (let run = 1; run <= RUNS; run++) {
    for (const c of CASES) {
      lines.push(`### ${c.label}, run ${run}`, "");
      lines.push(`| # | Visitor | ${arms.join(" | ")} |`, `|---|---|${arms.map(() => "---").join("|")}|`);
      const convs = arms.map((a) => conversations.find((x) => x.arm === a && x.run === run && x.case === c));
      for (let i = 0; i < c.turns.length; i++) {
        const marker = i === HESITATION_TURN ? " (hesitation)" : "";
        lines.push(
          `| ${i + 1}${marker} | ${cell(c.turns[i])} | ${convs.map((x) => cell(x?.turns[i]?.reply || x?.turns[i]?.failed || "—")).join(" | ")} |`
        );
      }
      lines.push("");
    }
  }

  const path = join(__dirname, "..", "docs", process.env.REPORT ?? `reply-provider-${date}.md`);
  writeFileSync(path, lines.join("\n"));
  console.log(`\nwrote ${path}`);
  console.log(lines.slice(0, 4 + rows.length + 2).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
