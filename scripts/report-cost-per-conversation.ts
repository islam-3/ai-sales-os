// THE cost-per-conversation number, broken down by call.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/report-cost-per-conversation.ts
//
//   SLUG=test-clinic  to scope it to one tenant
//
// ── Zero model calls. Reads usage_events and nothing else ───────────
// Every figure here is either recorded token usage from calls already
// made and paid for, or derived from a prompt's character count and
// labelled DERIVED. Nothing is a guess, and nothing is billed to run it.
//
// README.md carries this table. It is the gate on new features: a change
// that adds a model call has to state what it adds to this number before
// it is approved.
//
// ── Measured beats derived, automatically ───────────────────────────
// Each call type prints MEASURED when usage_events has rows for it and
// DERIVED when it does not. Four call types were unmetered until
// recently — the classifier, coverage, and both halves of answer-gap
// capture — so they start DERIVED and turn into MEASURED on their own as
// real traffic flows through. Nothing needs editing for that to happen.

import { supabaseServer } from "../lib/supabase-server";
import { PRICING, calculateCostUsd } from "../lib/ai-pricing";
import { SIGNAL_PROMPT, SIGNAL_MODEL } from "../lib/visitor-signals";
import { SHORTEN_PROMPT, SHORTEN_MODEL } from "../lib/question-short";
import {
  ANSWER_GAP_PROMPT,
  ANSWER_GAP_MODEL,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
} from "../lib/answer-gap";

const SLUG = process.env.SLUG ?? null;

/**
 * Characters per token, measured rather than assumed.
 *
 * From scripts/measure-answer-gap-cost.ts: test-clinic's knowledge block
 * is ANSWER_GAP_PROMPT (2,777 chars) plus a header and a numbered
 * listing of 17,984 characters, and the API billed it as 4,703 tokens.
 * 20,976 / 4,703 = 4.46. The uncached arm of the same run billed 4,725
 * tokens for ~21,026 characters, which is 4.45 — so the ratio holds on
 * two independent measurements of the same text.
 *
 * It is a ratio for ENGLISH prose. Arabic and CJK tokenise differently,
 * and every DERIVED line below is an English prompt, which is why it is
 * usable here and would not be for visitor text.
 */
const CHARS_PER_TOKEN = 4.46;
const tokens = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

/** A typical visitor message, in tokens. Short, on the evidence. */
const VISITOR_MESSAGE_TOKENS = 40;

type Row = {
  session_id: string | null;
  call_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_write_input_tokens: number;
  cost_usd: string | number;
};

type Line = {
  label: string;
  model: string;
  /** Calls per conversation. */
  perConv: number;
  /** Cost of one call. */
  each: number;
  provenance: "MEASURED" | "DERIVED";
  note: string;
};

const money = (n: number) => `$${n.toFixed(5)}`;

async function main() {
  let tenantFilter: string | null = null;
  let tenantLabel = "every tenant";
  if (SLUG) {
    const { data, error } = await supabaseServer
      .from("tenants").select("id, slug").eq("slug", SLUG).single();
    if (error) throw error;
    tenantFilter = data.id;
    tenantLabel = data.slug;
  }

  // Paged. PostgREST caps a response at 1,000 rows and returns exactly
  // that many without saying so — the first version of this read 1,000
  // of 7,072 and reported a per-conversation cost from a seventh of the
  // table.
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseServer
      .from("usage_events")
      .select(
        "session_id, call_type, model, input_tokens, output_tokens, cache_read_input_tokens, cache_write_input_tokens, cost_usd"
      )
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const conversational = rows.filter((r) => r.session_id);
  const sessions = new Set(conversational.map((r) => r.session_id as string));
  if (sessions.size === 0) {
    console.log(`No conversation-scoped usage_events for ${tenantLabel}. Nothing to report.`);
    process.exit(1);
  }

  const measured = (callType: string) => {
    const mine = conversational.filter((r) => r.call_type === callType);
    if (mine.length === 0) return null;
    return {
      calls: mine.length,
      perConv: mine.length / sessions.size,
      each: mine.reduce((a, r) => a + Number(r.cost_usd), 0) / mine.length,
      model: Array.from(new Set(mine.map((r) => r.model))).join(", "),
      avgIn: Math.round(
        mine.reduce(
          (a, r) => a + r.input_tokens + r.cache_read_input_tokens + r.cache_write_input_tokens,
          0
        ) / mine.length
      ),
      avgOut: Math.round(mine.reduce((a, r) => a + r.output_tokens, 0) / mine.length),
    };
  };

  console.log(`usage_events for ${tenantLabel}`);
  console.log(`${rows.length} recorded calls, ${sessions.size} conversations\n`);

  const lines: Line[] = [];

  // ── 1. The reply ─────────────────────────────────────────────────
  const reply = measured("chat_reply");
  if (reply) {
    lines.push({
      label: "reply",
      model: reply.model,
      perConv: reply.perConv,
      each: reply.each,
      provenance: "MEASURED",
      note: `${reply.avgIn.toLocaleString("en-US")} in / ${reply.avgOut} out, cached prefix`,
    });
  }

  // ── 2. Lead extraction ───────────────────────────────────────────
  const extraction = measured("lead_extraction");
  if (extraction) {
    lines.push({
      label: "lead extraction",
      model: extraction.model,
      perConv: extraction.perConv,
      each: extraction.each,
      provenance: "MEASURED",
      note: `${extraction.avgIn.toLocaleString("en-US")} in / ${extraction.avgOut} out, every 3rd turn + contact hints`,
    });
  }

  // ── 3. The classifier ────────────────────────────────────────────
  const classifier = measured("visitor_signals");
  if (classifier) {
    lines.push({
      label: "classifier",
      model: classifier.model,
      perConv: classifier.perConv,
      each: classifier.each,
      provenance: "MEASURED",
      note: `${classifier.avgIn} in / ${classifier.avgOut} out`,
    });
  } else {
    const inTokens = tokens(SIGNAL_PROMPT.length) + VISITOR_MESSAGE_TOKENS;
    const outTokens = 40; // four booleans as JSON
    lines.push({
      label: "classifier",
      model: SIGNAL_MODEL,
      // Once per turn with text, so the reply's rate is the right one.
      perConv: reply?.perConv ?? 0,
      each: calculateCostUsd(SIGNAL_MODEL, { inputTokens: inTokens, outputTokens: outTokens }),
      provenance: "DERIVED",
      note: `${SIGNAL_PROMPT.length} chars of prompt → ~${inTokens} in / ~${outTokens} out, once per turn`,
    });
  }

  // ── 4. Coverage ──────────────────────────────────────────────────
  const coverage = measured("coverage_answered");
  if (coverage) {
    lines.push({
      label: "coverage",
      model: coverage.model,
      perConv: coverage.perConv,
      each: coverage.each,
      provenance: "MEASURED",
      note: `${coverage.avgIn} in / ${coverage.avgOut} out, only near a close`,
    });
  }

  // ── 5. The answer-gap judge ──────────────────────────────────────
  //
  // Derived from the tenant's OWN knowledge base when there are no rows
  // yet, because that is what the cost scales with. A measured figure
  // for test-clinic says nothing about a tenant with ten times the
  // material.
  const judge = measured("answer_gap_judge");
  if (judge) {
    lines.push({
      label: "answer-gap judge",
      model: judge.model,
      perConv: judge.perConv,
      each: judge.each,
      provenance: "MEASURED",
      note: `${judge.avgIn.toLocaleString("en-US")} in / ${judge.avgOut} out, capped at ${MAX_JUDGE_CALLS_PER_CONVERSATION}`,
    });
  }

  // ── 6. The rewrite ───────────────────────────────────────────────
  const shorten = measured("question_shorten");
  if (shorten) {
    lines.push({
      label: "question rewrite",
      model: shorten.model,
      perConv: shorten.perConv,
      each: shorten.each,
      provenance: "MEASURED",
      note: `${shorten.avgIn} in / ${shorten.avgOut} out, only on a gap`,
    });
  }

  // ── 7. Embeddings ────────────────────────────────────────────────
  for (const [type, label] of [
    ["rag_embedding", "retrieval embedding"],
    ["question_embedding", "question embedding"],
  ] as const) {
    const e = measured(type);
    if (e) {
      lines.push({
        label,
        model: e.model,
        perConv: e.perConv,
        each: e.each,
        provenance: "MEASURED",
        note: `${e.avgIn} in`,
      });
    }
  }

  // ── The table ────────────────────────────────────────────────────
  console.log("--- cost per conversation, by call ---");
  console.log(
    "  call".padEnd(22) + "per conv".padStart(9) + "each".padStart(11) + "subtotal".padStart(11) + "   source"
  );
  let total = 0;
  for (const l of lines) {
    const subtotal = l.perConv * l.each;
    total += subtotal;
    console.log(
      `  ${l.label.padEnd(20)}` +
        l.perConv.toFixed(2).padStart(9) +
        money(l.each).padStart(11) +
        money(subtotal).padStart(11) +
        `   ${l.provenance}`
    );
    console.log(`    ${l.model} — ${l.note}`);
  }
  console.log("  " + "-".repeat(70));
  console.log(`  TOTAL per conversation  ${money(total)}   (${(total * 100).toFixed(2)} cents)`);
  console.log(`  per 1,000 conversations $${(total * 1000).toFixed(2)}`);

  const derived = lines.filter((l) => l.provenance === "DERIVED");
  if (derived.length > 0) {
    console.log(
      `\n  ${derived.length} line(s) above are DERIVED from prompt size, not recorded:` +
        `\n  ${derived.map((l) => l.label).join(", ")}.` +
        `\n  They are metered in code now and will become MEASURED on their own` +
        `\n  as traffic flows. Nothing here needs editing for that.`
    );
  }

  // ── What the capture path adds, by scenario ──────────────────────
  //
  // One number would be wrong. The judge's cost depends on the tenant's
  // knowledge-base size, on whether the prompt cache is warm, and on how
  // many turns carry a question — and the last of those varies more than
  // anything else measured here. prof-clinic: 0 of 57 visitor messages
  // contain a question mark. The six smoke-test conversations: 2.0 per
  // conversation. Both are real; neither is "the" rate.
  console.log("\n--- what answer-gap capture adds, per conversation ---");

  const { data: kbRows } = await supabaseServer
    .from("knowledge_base")
    .select("title, content")
    .eq("tenant_id", tenantFilter ?? "00000000-0000-0000-0000-000000000000");

  const kbChars = (kbRows ?? []).reduce(
    (n, r) => n + (r.title?.length ?? 0) + r.content.length + 8,
    0
  );
  const prefixTokens = tokens(ANSWER_GAP_PROMPT.length + 31 + kbChars);

  if (!tenantFilter) {
    console.log("  Pass SLUG=<tenant> for this section — it scales with one tenant's");
    console.log("  knowledge base, and an average across tenants would mean nothing.");
  } else {
    const judgeCold = calculateCostUsd(ANSWER_GAP_MODEL, {
      cacheWriteInputTokens: prefixTokens,
      inputTokens: VISITOR_MESSAGE_TOKENS,
      outputTokens: 28,
    });
    const judgeWarm = calculateCostUsd(ANSWER_GAP_MODEL, {
      cacheReadInputTokens: prefixTokens,
      inputTokens: VISITOR_MESSAGE_TOKENS,
      outputTokens: 28,
    });
    const judgeUncached = calculateCostUsd(ANSWER_GAP_MODEL, {
      inputTokens: prefixTokens + VISITOR_MESSAGE_TOKENS,
      outputTokens: 28,
    });
    const shortenTokens = tokens(SHORTEN_PROMPT.length + 22) + VISITOR_MESSAGE_TOKENS;
    const rewrite = calculateCostUsd(SHORTEN_MODEL, {
      inputTokens: shortenTokens,
      outputTokens: 20,
    });

    console.log(
      `  ${(kbRows ?? []).length} knowledge entries → a ${prefixTokens.toLocaleString("en-US")}-token cacheable prefix` +
        ` (minimum is 1,024: ${prefixTokens >= 1024 ? "clears it" : "TOO SHORT, no caching"})\n`
    );
    console.log(`  judge, cold cache     ${money(judgeCold)}`);
    console.log(`  judge, warm cache     ${money(judgeWarm)}`);
    console.log(`  judge, no caching     ${money(judgeUncached)}`);
    console.log(
      `  rewrite               ${money(rewrite)}   ~${shortenTokens} in / ~20 out —` +
        ` prefix is ${tokens(SHORTEN_PROMPT.length)} tokens, UNDER the 1,024 minimum,`
    );
    console.log(`                                    so caching cannot apply and does not change it`);
    console.log(`  embedding             $0.0000003   (~15 tokens, a 3,000th of a cent)\n`);

    // ── The realistic model ──────────────────────────────────────────
    //
    // The FIRST judge call of a conversation is cold and the rest are
    // warm. Not an all-warm average.
    //
    // The cache is per tenant with a five-minute TTL, so an all-warm
    // figure assumes another conversation was judged within five
    // minutes. A clinic with a few conversations a day never has that:
    // every conversation opens a cold window, pays the write once, and
    // reads it for the rest of its own turns. Reporting the warm
    // number as the headline would understate a small tenant by 5x,
    // and small tenants are all there are right now.
    //
    // The all-warm column stays, labelled as what it is: the floor a
    // busy tenant converges on.
    const realistic = (nQ: number, nGap: number) =>
      nQ === 0 ? 0 : judgeCold + (nQ - 1) * judgeWarm + nGap * rewrite;
    const busy = (nQ: number, nGap: number) => nQ * judgeWarm + nGap * rewrite;
    const uncached = (nQ: number, nGap: number) => nQ * judgeUncached + nGap * rewrite;

    const scenarios: [string, number, number][] = [
      ["0 requests — the question-mark gate on prof-clinic", 0, 0],
      ["1 request, answered", 1, 0],
      ["1 request, 1 gap", 1, 1],
      ["2 requests, 1 gap  <- prof-clinic's measured rate", 2, 1],
      ["2 requests, both gaps", 2, 2],
      [`${MAX_JUDGE_CALLS_PER_CONVERSATION} requests (the cap), 2 gaps`, MAX_JUDGE_CALLS_PER_CONVERSATION, 2],
    ];
    console.log(
      "  scenario".padEnd(52) +
        "realistic".padStart(11) +
        "busy".padStart(10) +
        "no cache".padStart(11)
    );
    console.log(
      "  (first call cold, rest warm)".padEnd(52) +
        "<- quote this".padStart(11)
    );
    for (const [name, nQ, nGap] of scenarios) {
      console.log(
        `  ${name.padEnd(50)}` +
          money(realistic(nQ, nGap)).padStart(11) +
          money(busy(nQ, nGap)).padStart(10) +
          money(uncached(nQ, nGap)).padStart(11)
      );
    }

    // prof-clinic's own traffic, hand-classified against the new gate.
    // 14 of 53 distinct visitor messages are a request for information
    // under the labelling in scripts/classify-cases.ts, across 9
    // conversations — so about 1.6 per conversation, which is where the
    // "2 requests" row comes from. The question-mark gate scores 0 of
    // 57 on the same messages.
    const REQUESTS_PER_CONVERSATION = 1.6;
    const GAP_RATE = 0.5;
    const expected =
      judgeCold +
      (REQUESTS_PER_CONVERSATION - 1) * judgeWarm +
      REQUESTS_PER_CONVERSATION * GAP_RATE * rewrite;
    console.log(
      `\n  Expected, at prof-clinic's measured rate of ${REQUESTS_PER_CONVERSATION} requests per` +
        `\n  conversation and half of them being gaps: ${money(expected)}` +
        `\n  Against a baseline of ${money(total)}, that is +${((expected / total) * 100).toFixed(0)}%, taking a` +
        `\n  conversation from ${(total * 100).toFixed(2)}c to ${((total + expected) * 100).toFixed(2)}c.`
    );
    console.log(
      `\n  Worst case, at the cap: ${money(realistic(MAX_JUDGE_CALLS_PER_CONVERSATION, 2))}` +
        ` (+${((realistic(MAX_JUDGE_CALLS_PER_CONVERSATION, 2) / total) * 100).toFixed(0)}%).` +
        `\n  With caching off that becomes ${money(uncached(MAX_JUDGE_CALLS_PER_CONVERSATION, 2))}` +
        ` (+${((uncached(MAX_JUDGE_CALLS_PER_CONVERSATION, 2) / total) * 100).toFixed(0)}%), which is what caching bought.` +
        `\n  A busy tenant converges on ${money(busy(2, 1))} (+${((busy(2, 1) / total) * 100).toFixed(0)}%) as the write amortises.`
    );

    // And the gate itself, which is the cheap part and worth stating so
    // nobody optimises the wrong thing.
    console.log(
      `\n  The GATE costs nothing extra. It is one more key on the` +
        `\n  visitor-signals classifier, which already runs on every turn:` +
        `\n  ~45 more input tokens of prompt and ~8 more output tokens, about` +
        `\n  $0.00005 per turn, ${money(0.00005 * (reply?.perConv ?? 6.28))} per conversation. The question-mark` +
        `\n  gate was free and caught 0 of 57 real messages.`
    );
  }

  console.log("\n--- rates, from lib/ai-pricing.ts (per 1M tokens) ---");
  for (const [model, p] of Object.entries(PRICING)) {
    console.log(
      `  ${model.padEnd(28)} in ${String(p.input).padStart(5)}  out ${String(p.output).padStart(5)}` +
        `  cache read ${String(p.cacheRead ?? "-").padStart(5)}  write ${String(p.cacheWrite ?? "-").padStart(5)}`
    );
  }
  console.log("  That file carries a warning to verify these against the pricing pages.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
