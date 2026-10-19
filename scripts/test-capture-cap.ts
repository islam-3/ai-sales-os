// The two per-conversation capture caps, under concurrency.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/test-capture-cap.ts
//
// ── FREE. No model call, no OpenAI call, no deployment ──────────────
// The judge is a fake that counts how many times it was asked. The
// database is real, because the thing under test is a Postgres function
// and a fake cannot prove a lock.
//
// ── Why this test-* touches the database, when none of the others do ─
// README calls test-* "pure, fast, free — no network, no model, no
// database", and that is still the rule. This one is the exception the
// rule has to allow, because the bound it checks does not exist in
// TypeScript: it is reserve_capture_slot's advisory lock. A pure
// version would fake the reservation and then assert that the fake
// behaved, which is decoration — the same mistake as a smoke test that
// cannot fail on a known-bad deployment.
//
// It skips loudly, rather than passing, when there are no Supabase
// credentials.
//
// ── What it is defending ────────────────────────────────────────────
// Two separate failures, both measured against production on
// 2026-10-17 by scripts/live-capture-check.ts:
//
//   1. The ROW cap was a count taken before the judge call, and capture
//      runs detached after the reply with seconds of model work between
//      the count and the INSERT. Session 0310035b captured FIVE rows
//      against a cap of four; the fifth was inserted 2.8s after the
//      fourth, less time than its own chain takes.
//
//   2. There was no JUDGE CALL cap at all. The one constant was named
//      for judge calls and counted rows, so an answered question bought
//      a judge call for free. That same session made EIGHT.
//
// Both now come out of one reservation, taken before the judge rather
// than after it.

import { randomUUID } from "node:crypto";
import { supabaseServer } from "../lib/supabase-server";
import {
  MAX_CAPTURED_ROWS_PER_CONVERSATION,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
} from "../lib/answer-gap";
import { captureIfUnanswered } from "../lib/capture-unanswered";
import { TEST_TENANT_SLUG } from "../lib/test-tenant";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const ROWS = MAX_CAPTURED_ROWS_PER_CONVERSATION;
const JUDGE = MAX_JUDGE_CALLS_PER_CONVERSATION;

/**
 * Session ids here are deliberately NOT uuids.
 *
 * unanswered_questions.session_id is text and takes them happily, but
 * usage_events.session_id is a uuid column — so recordUsage's insert
 * for a faked model call is rejected and nothing this test does can
 * reach the cost breakdown in README.md. A free test that wrote $0 rows
 * into the spend table would be quietly corrupting the one number this
 * project publishes.
 */
const sessionForTest = () => `cap-test-${randomUUID()}`;

/** Fired at once. Well past both caps on purpose. */
const BURST = 14;

type Reservation = { slot_id: string | null; refusal: string | null };

async function reserve(tenant: string, sessionId: string): Promise<Reservation> {
  const { data, error } = await supabaseServer.rpc("reserve_capture_slot", {
    p_tenant_id: tenant,
    p_session_id: sessionId,
    p_max_rows: ROWS,
    p_max_judge_calls: JUDGE,
  });
  if (error) throw new Error(`reserve_capture_slot failed: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data) as Reservation;
}

async function release(slotId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("unanswered_capture_slots")
    .update({ released_at: new Date().toISOString() })
    .eq("id", slotId);
  if (error) throw error;
}

async function countSlots(sessionId: string, onlyHeld = false): Promise<number> {
  let q = supabaseServer
    .from("unanswered_capture_slots")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (onlyHeld) q = q.is("released_at", null);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function rowsCaptured(sessionId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("unanswered_questions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw error;
  return count ?? 0;
}

async function cleanUp(sessionId: string): Promise<void> {
  await supabaseServer.from("unanswered_questions").delete().eq("session_id", sessionId);
  await supabaseServer.from("unanswered_capture_slots").delete().eq("session_id", sessionId);
}

/**
 * The ROW cap, hammered.
 *
 * Fourteen simultaneous requests for four rows. Serialised counting
 * grants four; the count-then-act it replaces granted every one of
 * them, because every one read the same stale number.
 */
async function rowCapIsExclusive(tenant: string): Promise<void> {
  const sessionId = sessionForTest();

  const results = await Promise.all(Array.from({ length: BURST }, () => reserve(tenant, sessionId)));
  const ids = results.map((r) => r.slot_id).filter(Boolean) as string[];

  check(`${BURST} simultaneous reservations granted exactly ${ROWS}`, ids.length === ROWS, `granted ${ids.length}`);
  check("every grant is a distinct slot", new Set(ids).size === ids.length);
  check(
    "the refusals name the ROW cap, not the judge cap",
    results.filter((r) => r.refusal === "rows").length === BURST - ROWS,
    results.map((r) => r.refusal ?? "granted").join(", ")
  );

  // Releasing one hands the row back, or a long conversation whose
  // questions are all answered would stop capturing after four.
  await release(ids[0]);
  const after = await reserve(tenant, sessionId);
  check("a released slot frees the row it was holding", !!after.slot_id, after.refusal ?? "");

  await cleanUp(sessionId);
}

/**
 * The JUDGE CALL cap, which the row cap cannot reach.
 *
 * Every reservation here is released immediately and captures nothing —
 * the shape of a conversation where the business HAS the answer every
 * time. Under the old cap that was free and unbounded. It must stop at
 * eight.
 */
async function judgeCapHoldsWhenNothingIsCaptured(tenant: string): Promise<void> {
  const sessionId = sessionForTest();

  let granted = 0;
  let refusal = "";
  for (let i = 0; i < JUDGE + 4; i++) {
    const r = await reserve(tenant, sessionId);
    if (r.slot_id) {
      granted++;
      // Answered: no row is written, and the slot goes straight back.
      await release(r.slot_id);
    } else {
      refusal = r.refusal ?? "";
    }
  }

  check(
    `${JUDGE + 4} answered questions in a row spend exactly ${JUDGE} judge calls`,
    granted === JUDGE,
    `granted ${granted}`
  );
  check("and the refusal names the judge cap", refusal === "judge_calls", refusal);
  check("no rows were captured by any of them", (await rowsCaptured(sessionId)) === 0);
  check(
    "a released slot still counts as a judge call spent",
    (await countSlots(sessionId)) === JUDGE,
    `${await countSlots(sessionId)} slots on record`
  );
  check("and none of them is still held", (await countSlots(sessionId, true)) === 0);

  await cleanUp(sessionId);
}

/**
 * A captured ROW holds the count once its slot is released.
 *
 * Reservations are transient by design, so if rows did not count, a
 * session could capture four, release four, and start again.
 */
async function rowsCountTowardTheCap(tenant: string): Promise<void> {
  const sessionId = sessionForTest();
  const id = randomUUID();

  const rows = Array.from({ length: ROWS }, (_, i) => ({
    id: i === 0 ? id : randomUUID(),
    tenant_id: tenant,
    session_id: sessionId,
    question_raw: `placeholder ${i}`,
    question_short: `placeholder ${i}`,
    script: "latin",
    group_id: id,
  }));
  const { error } = await supabaseServer.from("unanswered_questions").insert(rows);
  if (error) throw error;
  check(`${ROWS} rows stand for a session that has used its row cap`, (await rowsCaptured(sessionId)) === ROWS);

  const refused = await reserve(tenant, sessionId);
  check(
    `a session already holding ${ROWS} rows is refused, with no slot in flight`,
    refused.slot_id === null && refused.refusal === "rows",
    `${refused.slot_id} / ${refused.refusal}`
  );

  await cleanUp(sessionId);
}

/**
 * The whole capture path, fired concurrently with a fake judge.
 *
 * Counting JUDGE CALLS is the assertion that matters. The cap exists to
 * bound spend, and a cap that lets the call through and then drops the
 * row has already spent the money — which is exactly what the race did:
 * the overrun row cost $0.002 of judge, not $0 of dashboard.
 *
 * The fake answers "entry 1 covers it", so capture stops at the judge
 * and this whole leg touches no network at all. The rewrite and the
 * OpenAI embedding only run on a gap, and a test that quietly bought
 * embeddings would not be free in the way the header promises.
 *
 * Because nothing is captured, the bound being proved here is the JUDGE
 * one: fourteen concurrent captures, eight calls, six refused.
 */
async function captureUnderConcurrency(tenant: string): Promise<void> {
  const sessionId = sessionForTest();
  let judgeCalls = 0;

  // Shaped like the judge's call: a system ARRAY (the prompt plus the
  // cached listing) and a JSON object naming a numbered entry. The
  // rewrite, the other caller, passes a system string — so if it ever
  // runs it throws here rather than being miscounted as a judge call.
  const anthropic = {
    messages: {
      create: async (body: { system?: unknown }) => {
        if (!Array.isArray(body.system)) throw new Error("the rewrite should not run on an answered verdict");
        judgeCalls++;
        return {
          content: [{ type: "text", text: '{"entry": 1, "note": "entry 1 covers it"}' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      },
    },
  };

  const outcomes = await Promise.all(
    Array.from({ length: BURST }, (_, i) =>
      captureIfUnanswered({
        supabase: supabaseServer,
        // Stands in for the one SDK method this path uses.
        anthropic: anthropic as never,
        tenantId: tenant,
        sessionId,
        question: `concurrent question ${i}`,
        knowledge: [{ title: "The package", content: "What the package includes." }],
        teamLanguage: "English",
        script: "latin",
      })
    )
  );

  console.log(`      outcomes: ${outcomes.join(", ")}`);
  const answered = outcomes.filter((o) => o === "answered").length;
  const refused = outcomes.filter((o) => o === "capped" || o === "judge_capped").length;

  // An exact split is not available here and asserting one would be a
  // flaky test dressed up as a strict one: these fourteen run at once,
  // each releases its slot the moment the judge answers, and how many
  // get through depends on how that interleaves. What must hold is the
  // BOUND, on every interleaving.
  check(
    `${BURST} concurrent captures called the judge at most ${JUDGE} times`,
    judgeCalls <= JUDGE,
    `the judge ran ${judgeCalls} times — each one is a whole knowledge base of input`
  );
  check("every call that got through returned answered", answered === judgeCalls, `${answered} vs ${judgeCalls}`);
  check("every other one was refused by a cap", answered + refused === BURST, outcomes.join(", "));
  check("nothing was captured, because the fake says it is answered", (await rowsCaptured(sessionId)) === 0);
  check(
    "no slot was left held after every capture finished",
    (await countSlots(sessionId, true)) === 0,
    `${await countSlots(sessionId, true)} still held — a held slot is a dashboard row the session can never fill`
  );

  await cleanUp(sessionId);

  // ── The same burst, against a session with one judge call left ────
  // Deterministic where the above cannot be: the ceiling is already
  // seven, so however the fourteen interleave, exactly one may spend.
  // This is the assertion that the judge cap survives concurrency, as
  // opposed to merely existing when calls arrive one at a time.
  const nearlySpent = sessionForTest();
  const seeded = Array.from({ length: JUDGE - 1 }, () => ({
    tenant_id: tenant,
    session_id: nearlySpent,
    released_at: new Date().toISOString(),
  }));
  const { error: seedError } = await supabaseServer.from("unanswered_capture_slots").insert(seeded);
  if (seedError) throw seedError;

  judgeCalls = 0;
  const lastOne = await Promise.all(
    Array.from({ length: BURST }, (_, i) =>
      captureIfUnanswered({
        supabase: supabaseServer,
        anthropic: anthropic as never,
        tenantId: tenant,
        sessionId: nearlySpent,
        question: `one call left ${i}`,
        knowledge: [{ title: "The package", content: "What the package includes." }],
        teamLanguage: "English",
        script: "latin",
      })
    )
  );

  check(
    `with ${JUDGE - 1} already spent, ${BURST} at once spend exactly 1 more`,
    judgeCalls === 1,
    `the judge ran ${judgeCalls} times`
  );
  check(
    `and the other ${BURST - 1} are refused on the judge cap`,
    lastOne.filter((o) => o === "judge_capped").length === BURST - 1,
    lastOne.join(", ")
  );

  await cleanUp(nearlySpent);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SKIPPED — no Supabase credentials.");
    console.log("This test needs the database: the bound it checks is a Postgres advisory lock,");
    console.log("and a faked lock proves nothing. Run with DOTENV_CONFIG_PATH=.env.local.");
    process.exit(1);
  }

  const { data, error } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", TEST_TENANT_SLUG)
    .single();
  if (error) throw error;
  const tenant = data.id as string;

  console.log(`rows cap = ${ROWS}, judge cap = ${JUDGE}, burst = ${BURST}\n`);

  await rowCapIsExclusive(tenant);
  await judgeCapHoldsWhenNothingIsCaptured(tenant);
  await rowsCountTowardTheCap(tenant);
  await captureUnderConcurrency(tenant);

  console.log(bad ? `\n${bad} FAILING` : "\nboth caps are hard bounds");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
