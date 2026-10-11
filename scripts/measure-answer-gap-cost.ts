// What does the answer-gap judge actually add to a conversation?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-answer-gap-cost.ts
//
// Measured, not estimated. Three things decide it:
//
//   1. how big the input is, which is the tenant's whole knowledge base;
//   2. whether prompt caching holds, which turns that input into a cache
//      READ on every call after the first;
//   3. how many turns of a real conversation carry a question at all,
//      since the judge only runs on those.
//
// test-clinic only.

import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { anthropic } from "../lib/anthropic";
import {
  judgeAnswerGap,
  ANSWER_GAP_MODEL,
  ANSWER_GAP_PROMPT,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
  type KnowledgeForJudge,
} from "../lib/answer-gap";
import { CONTAINS_QUESTION } from "../lib/punctuation";

const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

/**
 * Rates per million tokens, as of writing, for the model in use.
 *
 * Stated here rather than buried so the arithmetic can be re-done when
 * they change. The TOKEN counts below are the measurement; the money is
 * the token counts times these.
 */
const RATE = {
  input: Number(process.env.RATE_INPUT ?? 3),
  output: Number(process.env.RATE_OUTPUT ?? 15),
  /** A cache write costs 1.25x a normal input token. */
  cacheWrite: Number(process.env.RATE_CACHE_WRITE ?? 3.75),
  /** A cache read costs 0.1x. This is the whole point. */
  cacheRead: Number(process.env.RATE_CACHE_READ ?? 0.3),
};

const dollars = (t: { input: number; output: number; cacheWrite: number; cacheRead: number }) =>
  (t.input * RATE.input +
    t.output * RATE.output +
    t.cacheWrite * RATE.cacheWrite +
    t.cacheRead * RATE.cacheRead) /
  1_000_000;

/**
 * The six smoke-test conversations, which are the closest thing to real
 * traffic this project has — one per failure class, seven turns each.
 */
const CONVERSATIONS: Record<string, string[]> = {
  English: [
    "hi, I'm looking into full dental implants",
    "I lost most of my upper teeth about five years ago",
    "how much does it cost?",
    "can you walk me through the steps of the whole process?",
    "honestly I need to think about it and talk to my wife first",
    "David",
    "+44 7700 900123",
  ],
  Arabic: [
    "مرحبا، أفكر في زراعة الأسنان",
    "فقدت معظم أسناني العلوية منذ خمس سنوات",
    "كم التكلفة؟",
    "ممكن تشرح لي خطوات العلاج بالتفصيل؟",
    "بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً",
    "خالد",
    "+90 532 111 2233",
  ],
  Chinese: [
    "你好，我想了解种植牙",
    "我大约五年前失去了大部分上排牙齿",
    "费用是多少？",
    "能详细说明一下整个治疗的步骤吗？",
    "说实话我需要考虑一下，还要和我太太商量",
    "王伟",
    "+86 138 0013 8000",
  ],
};

async function main() {
  const { data: tenant, error } = await supabaseServer
    .from("tenants").select("id, settings").eq("slug", SLUG).single();
  if (error) throw error;
  if (!isTestTenant((tenant.settings ?? {}) as { is_test?: boolean })) {
    throw new Error(refusalMessage(SLUG));
  }

  const { data: rows } = await supabaseServer
    .from("knowledge_base").select("title, content").eq("tenant_id", tenant.id);
  const knowledge: KnowledgeForJudge[] = (rows ?? []).map((r) => ({
    title: r.title ?? "",
    content: r.content,
  }));
  const chars = knowledge.reduce((n, k) => n + k.title.length + k.content.length, 0);
  console.log(`model: ${ANSWER_GAP_MODEL}`);
  console.log(`${SLUG}: ${knowledge.length} entries, ${chars} characters of knowledge\n`);

  // ── 1. How many turns would the judge even run on? ───────────────
  console.log("--- how often it runs ---");
  let turns = 0;
  let questionTurns = 0;
  for (const [klass, msgs] of Object.entries(CONVERSATIONS)) {
    const q = msgs.filter((m) => CONTAINS_QUESTION.test(m));
    turns += msgs.length;
    questionTurns += q.length;
    console.log(`  ${klass.padEnd(8)} ${q.length} of ${msgs.length} turns carry a question`);
  }
  const perConversation = questionTurns / Object.keys(CONVERSATIONS).length;
  console.log(
    `  → ${questionTurns} of ${turns} turns overall, ${perConversation.toFixed(1)} judge calls per conversation`
  );
  console.log(
    `  (the gate is CONTAINS_QUESTION, which is script-aware: the Arabic turn ending` +
      `\n   in U+061F counts, and a bare name or phone number costs nothing)`
  );

  // ── 2. Does caching hold? ────────────────────────────────────────
  console.log("\n--- prompt caching on the knowledge block ---");
  const probes = [
    "how much do implants cost?",
    "do you accept insurance?",
    "is there parking?",
    "can I pay in instalments?",
    "who are the doctors?",
  ];
  // A cold window, forced.
  //
  // The second run of this script printed a cache READ on call 1 and a
  // first-call cost of $0.0018, because the run ten minutes earlier had
  // already warmed that prefix — so the write, which is the expensive
  // half and the whole question for a quiet tenant, went unmeasured and
  // the per-conversation figure came out 5x too low.
  //
  // One marker entry carrying this run's timestamp makes the prefix
  // unique, so call 1 is always a write. It costs about fifteen tokens
  // and goes through the production code path untouched.
  const probeKnowledge: KnowledgeForJudge[] = [
    ...knowledge,
    { title: "(cost measurement marker)", content: `run ${new Date().toISOString()}` },
  ];

  const usages: NonNullable<Awaited<ReturnType<typeof judgeAnswerGap>>["usage"]>[] = [];
  for (let i = 0; i < probes.length; i++) {
    const v = await judgeAnswerGap(anthropic, probes[i], probeKnowledge);
    if (v.failed || !v.usage) {
      console.log(`  call ${i + 1}: UNREACHABLE — ${v.note.slice(0, 60)}`);
      continue;
    }
    usages.push(v.usage);
    console.log(
      `  call ${i + 1}  input ${String(v.usage.input).padStart(5)}  ` +
        `cache write ${String(v.usage.cacheWrite).padStart(5)}  ` +
        `cache read ${String(v.usage.cacheRead).padStart(5)}  ` +
        `output ${String(v.usage.output).padStart(3)}  ` +
        `$${dollars(v.usage).toFixed(5)}`
    );
  }

  if (usages.length < 2) {
    console.log("\n  INCOMPLETE — not enough calls reached the model to measure anything.");
    process.exit(1);
  }

  const first = usages[0];
  const rest = usages.slice(1);
  const cacheHeld = rest.every((u) => u.cacheRead > 0);
  const cachedTokens = first.cacheWrite || first.cacheRead || first.input;
  console.log(
    `\n  cacheable prefix: ${cachedTokens} tokens` +
      ` (minimum for caching is 1024 — ${cachedTokens >= 1024 ? "CLEARS IT" : "TOO SHORT, caching will not apply"})`
  );
  console.log(`  cache held on calls after the first: ${cacheHeld ? "YES" : "NO"}`);

  // If the marker failed to force a write, every figure below that uses
  // the first call is measuring a warm window and must not be printed as
  // if it were a cold one.
  if (first.cacheWrite === 0) {
    console.log(
      `\n  INCOMPLETE — call 1 was a cache READ, so the write was never measured.` +
        `\n  The cold-window cost is the expensive half. Nothing below is a measurement.`
    );
    process.exit(1);
  }

  const avgRest = rest.reduce((a, u) => a + dollars(u), 0) / rest.length;
  console.log(`\n  first call  $${dollars(first).toFixed(5)}  (writes the cache)`);
  console.log(`  later calls $${avgRest.toFixed(5)}  average of ${rest.length}`);

  // ── 3. The same calls with no caching, actually run ──────────────
  //
  // Computing this from the cached numbers would be an estimate, and an
  // estimate is what was asked not to be delivered. So the pre-caching
  // shape is reconstructed here — listing and question in one user
  // message, no cache_control — and billed for real.
  console.log("\n--- the same work with caching off ---");
  const uncachedUsages: { input: number; output: number; cacheWrite: number; cacheRead: number }[] = [];
  const listing = probeKnowledge
    .filter((k) => k.content.trim())
    .map((k, i) => `${i + 1}. ${k.title.trim() || "(untitled)"}\n${k.content.trim()}`)
    .join("\n\n");
  for (let i = 0; i < probes.length; i++) {
    try {
      const res = await anthropic.messages.create({
        model: ANSWER_GAP_MODEL,
        max_tokens: 300,
        system: ANSWER_GAP_PROMPT,
        messages: [
          {
            role: "user",
            content: `WHAT THE BUSINESS HAS WRITTEN:\n${listing}\n\nCUSTOMER'S QUESTION:\n${probes[i]}`,
          },
        ],
      });
      const u = {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
      };
      uncachedUsages.push(u);
      console.log(
        `  call ${i + 1}  input ${String(u.input).padStart(5)}  output ${String(u.output).padStart(3)}  $${dollars(u).toFixed(5)}`
      );
    } catch (e) {
      console.log(`  call ${i + 1}: UNREACHABLE — ${String((e as Error).message).slice(0, 60)}`);
    }
  }
  if (uncachedUsages.length === 0) {
    console.log("\n  INCOMPLETE — the uncached arm never reached the model.");
    process.exit(1);
  }
  const avgUncached =
    uncachedUsages.reduce((a, u) => a + dollars(u), 0) / uncachedUsages.length;
  console.log(`  average $${avgUncached.toFixed(5)} per call, every call`);

  // ── 4. Per conversation, under both traffic regimes ──────────────
  //
  // The cache is per TENANT, not per conversation: calls 2-5 above were
  // unrelated questions and all of them read it. So who pays the write
  // depends entirely on how busy the tenant is, and the two ends are far
  // enough apart that one number would be a lie.
  console.log("\n--- added cost per conversation ---");
  const n = Math.round(perConversation);
  console.log(`  ${n} judge calls per conversation, measured above.\n`);

  const quiet = dollars(first) + Math.max(0, n - 1) * avgRest;
  const busy = n * avgRest;
  const noCache = n * avgUncached;
  console.log(`  quiet tenant   $${quiet.toFixed(5)}   nothing else in the 5-minute window,`);
  console.log(`                            so this conversation pays the cache write itself`);
  console.log(`  busy tenant    $${busy.toFixed(5)}   another conversation already wrote it`);
  console.log(`  caching off    $${noCache.toFixed(5)}   for comparison, measured not derived`);
  console.log(`\n  per 1,000 conversations: $${(quiet * 1000).toFixed(2)} quiet, $${(busy * 1000).toFixed(2)} busy`);

  // The finding that decides whether caching is worth keeping, and the
  // one case where it is not.
  const penalty = (dollars(first) / avgUncached - 1) * 100;
  console.log(
    `\n  Worth knowing: a cache WRITE costs 1.25x ordinary input, so the first` +
      `\n  call of a cold window is ${Math.abs(penalty).toFixed(0)}% ${penalty > 0 ? "MORE" : "less"} expensive than the same call` +
      `\n  with caching off ($${dollars(first).toFixed(5)} vs $${avgUncached.toFixed(5)}). Caching pays only when a second` +
      `\n  call reuses the prefix. At ${n} calls per conversation it does, by` +
      `\n  ${(((noCache - quiet) / noCache) * 100).toFixed(0)}% even on a quiet tenant — but a tenant whose visitors ask` +
      `\n  exactly one question each, more than five minutes apart, would be` +
      `\n  ${penalty > 0 ? "slightly cheaper without it" : "no worse off either way"}.`
  );

  console.log(
    `\n  And it scales with the knowledge base, not the conversation.` +
      `\n  ${knowledge.length} entries is ${chars} characters is ${cachedTokens} tokens. A tenant with ten` +
      `\n  times the material pays roughly ten times this per call, which is what` +
      `\n  the title-index plan in the README is for.`
  );

  // Who gets no caching at all. Worth printing, because it is the
  // opposite of who you would guess.
  const charsPerToken = chars / cachedTokens;
  console.log(
    `\n  The 1024-token minimum, in this tenant's terms: ${charsPerToken.toFixed(1)} characters per` +
      `\n  token, so caching stops applying below about ${Math.round(1024 * charsPerToken).toLocaleString("en-US")} characters —` +
      `\n  roughly ${Math.max(1, Math.round((1024 * charsPerToken) / (chars / knowledge.length)))} entries. A brand-new tenant with a thin knowledge base gets` +
      `\n  no caching, and pays full input price on every call. It is also the` +
      `\n  tenant whose every question is a gap, so the calls are cheap in` +
      `\n  absolute terms: a 1,000-character knowledge base is ~270 tokens, under` +
      `\n  a tenth of a cent a call. The cost problem is large tenants, not new ones.`
  );

  // ── 5. The cap ───────────────────────────────────────────────────
  console.log("\n--- the cap ---");
  const worst = (c: number) => dollars(first) + (c - 1) * avgRest;
  console.log(`  measured: ${perConversation.toFixed(1)} question-bearing turns per conversation`);
  console.log(`  cap set at ${MAX_JUDGE_CALLS_PER_CONVERSATION} in lib/answer-gap.ts\n`);
  for (const c of [2, MAX_JUDGE_CALLS_PER_CONVERSATION, 10, 20]) {
    console.log(
      `  ${String(c).padStart(2)} calls  worst case $${worst(c).toFixed(5)} per conversation` +
        (c === MAX_JUDGE_CALLS_PER_CONVERSATION ? "   <- the cap" : "")
    );
  }
  console.log(
    `\n  Without a cap the figure is unbounded, and the conversations that would` +
      `\n  blow past it are the pathological ones — a visitor pasting a list of` +
      `\n  twenty questions, or a bot. Capping at ${MAX_JUDGE_CALLS_PER_CONVERSATION} costs the ${MAX_JUDGE_CALLS_PER_CONVERSATION + 1}th question of a` +
      `\n  long conversation, which is a dashboard row nobody sees, and bounds the` +
      `\n  worst case at $${worst(MAX_JUDGE_CALLS_PER_CONVERSATION).toFixed(5)}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
