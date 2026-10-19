// The per-conversation capture cap, under concurrency.
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
// The cap used to be a count taken before the judge call, and capture
// runs detached after the reply with seconds of model work between the
// count and the INSERT. Measured against production on 2026-10-17:
// session 0310035b captured FIVE rows against a cap of four, costing an
// unbudgeted judge call — a whole knowledge base of input. The window
// is real, it is seconds wide, and visitors on this product type in
// fragments, fast.

import { randomUUID } from "node:crypto";
import { supabaseServer } from "../lib/supabase-server";
import { MAX_JUDGE_CALLS_PER_CONVERSATION } from "../lib/answer-gap";
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

const CAP = MAX_JUDGE_CALLS_PER_CONVERSATION;

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

/** How many captures to fire at once. Well past the cap on purpose. */
const BURST = 10;

async function tenantId(): Promise<string> {
  const { data, error } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", TEST_TENANT_SLUG)
    .single();
  if (error) throw error;
  return data.id as string;
}

async function slotsHeld(sessionId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("unanswered_capture_slots")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
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
 * The reservation itself, hammered.
 *
 * Ten simultaneous requests for four slots. Serialised counting grants
 * four; the count-then-act it replaces granted all ten, because all ten
 * read the same zero.
 */
async function reservationIsExclusive(tenant: string): Promise<void> {
  const sessionId = sessionForTest();

  const granted = await Promise.all(
    Array.from({ length: BURST }, async () => {
      const { data, error } = await supabaseServer.rpc("reserve_capture_slot", {
        p_tenant_id: tenant,
        p_session_id: sessionId,
        p_max: CAP,
      });
      if (error) throw new Error(`reserve_capture_slot failed: ${error.message}`);
      return data as string | null;
    })
  );

  const ids = granted.filter(Boolean) as string[];
  check(
    `${BURST} simultaneous reservations granted exactly ${CAP}`,
    ids.length === CAP,
    `granted ${ids.length}`
  );
  check(
    "every granted reservation is a distinct row",
    new Set(ids).size === ids.length,
    `${ids.length} grants, ${new Set(ids).size} distinct`
  );
  check(`the table holds exactly ${CAP} slots for the session`, (await slotsHeld(sessionId)) === CAP);

  // Releasing one must hand the slot back, or a long conversation whose
  // questions are all answered would stop capturing after four.
  await supabaseServer.from("unanswered_capture_slots").delete().eq("id", ids[0]);
  const { data: afterRelease } = await supabaseServer.rpc("reserve_capture_slot", {
    p_tenant_id: tenant,
    p_session_id: sessionId,
    p_max: CAP,
  });
  check("a released slot can be taken again", !!afterRelease);

  await cleanUp(sessionId);
}

/**
 * A captured ROW holds the count once its slot is released.
 *
 * This is the half that makes the cap mean what it says. Reservations
 * are transient by design, so if rows did not count, a session could
 * capture four, release four, and start again.
 */
async function rowsCountTowardTheCap(tenant: string): Promise<void> {
  const sessionId = sessionForTest();
  const id = randomUUID();

  const rows = Array.from({ length: CAP }, (_, i) => ({
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
  check(`${CAP} rows stand for a session that has used its cap`, (await rowsCaptured(sessionId)) === CAP);

  const { data: refused } = await supabaseServer.rpc("reserve_capture_slot", {
    p_tenant_id: tenant,
    p_session_id: sessionId,
    p_max: CAP,
  });
  check(
    `a session already holding ${CAP} rows is refused, with no slot in flight`,
    refused === null,
    `got ${refused}`
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
 */
async function captureUnderConcurrency(tenant: string): Promise<void> {
  const sessionId = sessionForTest();
  let judgeCalls = 0;

  // Shaped like the judge's call: a system ARRAY (the prompt plus the
  // cached listing) and a JSON object naming a numbered entry. The
  // rewrite, the other caller, passes a system string — so if this ever
  // runs it is a different shape and shows up as an unexpected outcome
  // rather than silently counting as a judge call.
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

  const capped = outcomes.filter((o) => o === "capped").length;
  const answered = outcomes.filter((o) => o === "answered").length;
  console.log(`      outcomes: ${outcomes.join(", ")}`);

  check(
    `${BURST} concurrent captures called the judge at most ${CAP} times`,
    judgeCalls <= CAP,
    `the judge ran ${judgeCalls} times — each one is a whole knowledge base of input`
  );
  check(
    `exactly ${CAP} got through and ${BURST - CAP} were refused`,
    answered === CAP && capped === BURST - CAP,
    `${answered} answered, ${capped} capped`
  );
  check(
    "no slot was left held after every capture finished",
    (await slotsHeld(sessionId)) === 0,
    `${await slotsHeld(sessionId)} still held — a leaked slot is a judge call the session can never spend`
  );

  await cleanUp(sessionId);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SKIPPED — no Supabase credentials.");
    console.log("This test needs the database: the bound it checks is a Postgres advisory lock,");
    console.log("and a faked lock proves nothing. Run with DOTENV_CONFIG_PATH=.env.local.");
    process.exit(1);
  }

  const tenant = await tenantId();
  console.log(`cap = ${CAP}, burst = ${BURST}\n`);

  await reservationIsExclusive(tenant);
  await rowsCountTowardTheCap(tenant);
  await captureUnderConcurrency(tenant);

  console.log(bad ? `\n${bad} FAILING` : "\nthe cap is a hard bound");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
