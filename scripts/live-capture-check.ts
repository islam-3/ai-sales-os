// Does answer-gap capture actually work against the real deployment?
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-capture-check.ts
//
// ── PAID. Roughly 58 Anthropic calls and 6 OpenAI embeddings, ~$0.14 ──
//
// Measured, not estimated: the figures below are the 2026-10-17 run
// (55 calls, $0.12271, recorded in usage_events) with this script's
// thirteenth turn added and its capped fifth gap taken away.
//
//   chat_reply        13  $0.0425
//   lead_extraction  ~8   $0.0488
//   answer_gap_judge 10   $0.0199   (1 cold write + 9 warm reads)
//   question_shorten  6   $0.0064
//   visitor_signals  13   $0.0082
//   coverage_answered ~1  $0.0008
//
// Two thirds of that is the replies and lead extraction these thirteen
// turns would cost whatever this script asserted. The capture feature's
// own share is about $0.03. Do not run this without saying so first and
// waiting — production chat degrades to the safe fallback when the
// Anthropic account runs dry.
//
// test-clinic only — say() refuses any other tenant before the first
// message goes out.
//
// ── What a pure test cannot see ─────────────────────────────────────
// Everything here is about what the ROUTE did after the response was
// sent: whether the classifier gate fired, whether the judge was called,
// whether the cap held, whether grouping joined two sessions, and
// whether the short version came back free of personal detail. None of
// that is visible to a unit test, and all of it runs inside keepAlive
// after the reply — which is exactly the kind of work that has been
// silently killed on Vercel before.
//
// The two conversations are built to exercise one property each:
//
//   A  English, nine turns. A request the knowledge base ANSWERS, two
//      that only the SETTINGS answer — opening hours and service area,
//      which were false gaps until the judge was given the same
//      material as the reply — then four genuine gaps, then a fifth
//      that must be CAPPED, then a bare name that must not be judged.
//
//   B  Arabic, four turns. A request with NO QUESTION MARK, which the
//      old gate would have missed entirely and which must now group with
//      session A's instalments row across two languages. Then two
//      requests that fire through direct_request rather than
//      asking_for_information — one the business can answer and one it
//      cannot, because the gate is only proved by both. Then a phone
//      number, which must not be judged.
//
// ── Two things are asserted in usage_events, not in rows ────────────
// A turn that is correctly NOT captured leaves nothing behind, so the
// photo request's gate firing and the capped gap's cost are checked
// against the judge calls that were billed. The run of 2026-10-17
// expected a ROW from the photo request and failed; the judge was
// right and the expectation was wrong, because this tenant has three
// "Before and after" entries.

import { randomUUID } from "node:crypto";
import { say } from "./_chat-client";
import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import {
  MAX_CAPTURED_ROWS_PER_CONVERSATION,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
} from "../lib/answer-gap";
import { activeGroups, type UnansweredAsk } from "../lib/unanswered-questions";

const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/** Capture runs after the response. Give it room before reading back. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 12000);

const A: string[] = [
  // Answered from the KNOWLEDGE BASE: test-clinic has implant entries.
  // Judged, no row.
  "dental implants",
  // Answered from SETTINGS, not the knowledge base. test-clinic has
  // opening_hours "24/7" and service_area "Istanbul", and the assistant
  // answers both from the identity block. Until businessFactsForJudge
  // existed the judge saw neither, so these two were false gaps — the
  // dashboard would have told the owner to write down opening hours
  // they had already filled in. They must produce NO rows.
  "what are your opening hours?",
  "do you treat patients in Istanbul?",
  // Gaps: nothing in the knowledge base OR the settings carries these.
  "can I pay in instalments?",
  "is there parking at the clinic?",
  "do you accept health insurance?",
  "I am diabetic, can I still have implants?",
  // The fifth gap. Four are already captured, so this must be CAPPED
  // and cost no judge call at all.
  "how much deposit do I pay upfront?",
  // Not a request. Must not be judged, must not appear.
  "David",
];

const B: string[] = [
  // No question mark anywhere. The old gate scored 0 of 57 on messages
  // exactly like this one. Means "can I pay in instalments".
  "هل يمكن الدفع على أقساط",
  // ── Fires through direct_request, and is ANSWERED ─────────────────
  // "Give me before and after photos." It fires the gate through
  // direct_request rather than asking_for_information, which is the
  // behaviour the five-key OR exists for — and then the judge finds
  // the answer, because test-clinic has three entries titled "Before
  // and after".
  //
  // So it must produce NO row, and the run of 2026-10-17 asserting one
  // was wrong about this tenant, not about the product: a row here
  // would tell an owner with three before-and-after entries that they
  // have no answer about before-and-after photos.
  //
  // The gate firing is still the thing being checked, so it is checked
  // where it is visible — a judge call against this session in
  // usage_events — rather than by the row it must not leave.
  "اعطيني صور قبل وبعد",
  // ── Fires through direct_request, and is a GENUINE GAP ────────────
  // "Send me the price list." A request, not a question; no question
  // mark; and nothing in the knowledge base carries a price. This is
  // the pairing the photo turn cannot give on its own: the gate firing
  // through direct_request AND a row landing because of it.
  "ارسل لي قائمة الأسعار",
  // Must not be judged.
  "+90 532 111 2233",
];

async function main() {
  const { data: tenant, error } = await supabaseServer
    .from("tenants").select("id, settings").eq("slug", SLUG).single();
  if (error) throw error;
  if (!isTestTenant((tenant.settings ?? {}) as { is_test?: boolean })) {
    throw new Error(refusalMessage(SLUG));
  }
  const tenantId = tenant.id as string;

  const sessionA = randomUUID();
  const sessionB = randomUUID();

  console.log(`A ${sessionA}`);
  for (const [i, message] of Array.from(A.entries())) {
    const { reply } = await say(sessionA, message, SLUG);
    console.log(`  ${i + 1}. ${message}\n     -> ${reply.slice(0, 90).replace(/\s+/g, " ")}…`);
  }

  console.log(`\nB ${sessionB}`);
  for (const [i, message] of Array.from(B.entries())) {
    const { reply } = await say(sessionB, message, SLUG);
    console.log(`  ${i + 1}. ${message}\n     -> ${reply.slice(0, 90).replace(/\s+/g, " ")}…`);
  }

  console.log(`\nwaiting ${SETTLE_MS / 1000}s for post-response capture…`);
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  // ── What landed ───────────────────────────────────────────────────
  const { data: rows, error: readError } = await supabaseServer
    .from("unanswered_questions")
    .select(
      "id, session_id, asked_at, question_raw, question_short, script, group_id, is_canonical, dismissed_at, judge_note, judge_model"
    )
    .eq("tenant_id", tenantId)
    .in("session_id", [sessionA, sessionB])
    .order("asked_at", { ascending: true });
  if (readError) throw readError;

  const captured = rows ?? [];
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${captured.length} rows captured`);
  console.log("=".repeat(72));
  for (const r of captured) {
    console.log(`\n  raw    ${r.question_raw}`);
    console.log(`  short  ${r.question_short}`);
    console.log(
      `  script ${r.script ?? "(none)"}   session ${r.session_id === sessionA ? "A" : "B"}` +
        `   ${r.is_canonical ? "CANONICAL" : `joins ${String(r.group_id).slice(0, 8)}`}`
    );
    console.log(`  judge  ${r.judge_model}: ${String(r.judge_note).slice(0, 100)}`);
  }

  // ── The assertions ────────────────────────────────────────────────
  console.log(`\n${"-".repeat(72)}`);

  const fromA = captured.filter((r) => r.session_id === sessionA);
  const fromB = captured.filter((r) => r.session_id === sessionB);

  check(
    `session A captured exactly ${MAX_CAPTURED_ROWS_PER_CONVERSATION} — the row cap held`,
    fromA.length === MAX_CAPTURED_ROWS_PER_CONVERSATION,
    `got ${fromA.length}: ${fromA.map((r) => r.question_raw).join(" | ")}`
  );
  // Instalments and the price list. NOT the photo request, which is
  // answered, and not the phone number, which is never judged.
  check("session B captured 2", fromB.length === 2, `got ${fromB.length}`);

  // The answered one must not be there. This is the false-positive
  // check that matters: the business HAS implant entries.
  check(
    'answered from the knowledge base ("dental implants") produced no row',
    !captured.some((r) => r.question_raw === "dental implants")
  );

  // ── The settings cases ────────────────────────────────────────────
  // The reason this run exists in its current form. Both are answered
  // by the identity block, not by any knowledge_base row, and both were
  // false gaps until the judge was given the same material as the reply.
  check(
    'answered from SETTINGS ("what are your opening hours?") produced no row',
    !captured.some((r) => r.question_raw === "what are your opening hours?"),
    captured.find((r) => r.question_raw === "what are your opening hours?")?.judge_note
  );
  check(
    'answered from SETTINGS ("do you treat patients in Istanbul?") produced no row',
    !captured.some((r) => r.question_raw === "do you treat patients in Istanbul?"),
    captured.find((r) => r.question_raw === "do you treat patients in Istanbul?")?.judge_note
  );

  // ── The photo request ─────────────────────────────────────────────
  // Answered, because test-clinic has three "Before and after" entries.
  // A row here would be the §2.3 false gap all over again: an owner
  // told they have no answer about before-and-after photos while three
  // before-and-after entries sit in their list.
  check(
    'the photo request produced no row — the business HAS before-and-after entries',
    !captured.some((r) => r.question_raw === "اعطيني صور قبل وبعد")
  );

  // Neither must the name or the number — they should not even have
  // reached the judge.
  check(
    "the bare name produced no row",
    !captured.some((r) => r.question_raw === "David")
  );
  check(
    "the phone number produced no row",
    !captured.some((r) => r.question_raw.includes("+90"))
  );

  // ── The second direct_request, which IS a gap ─────────────────────
  // "Send me the price list": the gate fires through direct_request,
  // and this time there is nothing to answer it with. The photo turn
  // proves the gate reaches the judge; this one proves it reaches the
  // dashboard.
  const priceList = captured.find((r) => r.question_raw === "ارسل لي قائمة الأسعار");
  check("the Arabic price-list request was captured", !!priceList);
  check("…and its script was recorded as arabic", priceList?.script === "arabic", priceList?.script ?? "none");
  check(
    "…and its short version is in the team's language, not Arabic",
    !!priceList && !/[؀-ۿ]/.test(priceList.question_short),
    priceList?.question_short
  );

  // The no-question-mark Arabic request is the whole point of the new
  // gate. The old gate would have skipped it.
  const arabic = captured.find((r) => r.question_raw === "هل يمكن الدفع على أقساط");
  check("the Arabic request with NO question mark was captured", !!arabic);
  check("…and its script was recorded as arabic", arabic?.script === "arabic", arabic?.script ?? "none");
  check(
    "…and its short version is in the team's language, not Arabic",
    !!arabic && !/[؀-ۿ]/.test(arabic.question_short),
    arabic?.question_short
  );

  // Grouping across two languages, which is why the short version is
  // what gets embedded.
  const instalments = captured.find((r) => r.question_raw === "can I pay in instalments?");
  check(
    "the Arabic and English instalments questions share a group",
    !!arabic && !!instalments && arabic.group_id === instalments.group_id,
    `arabic -> ${String(arabic?.group_id).slice(0, 8)}, english -> ${String(instalments?.group_id).slice(0, 8)}`
  );

  // No personal detail in anything an owner will read.
  check(
    "no short version contains a long digit run or a contact detail",
    captured.every((r) => !/\d{4,}|@[\w.-]+\.\w{2,}|\+\d[\d\s().-]{5,}/.test(r.question_short)),
    captured.map((r) => r.question_short).join(" | ")
  );

  // Exactly one canonical row per group, which the dismissal rule
  // depends on.
  const groups = new Map<string, number>();
  for (const r of captured) {
    if (r.is_canonical) groups.set(r.group_id, (groups.get(r.group_id) ?? 0) + 1);
  }
  check(
    "every group has exactly one canonical row",
    Array.from(groups.values()).every((n) => n === 1),
    Array.from(groups.entries()).map(([g, n]) => `${g.slice(0, 8)}=${n}`).join(" ")
  );

  // And what the dashboard would actually render.
  const asks: UnansweredAsk[] = captured.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    askedAt: r.asked_at,
    questionRaw: r.question_raw,
    questionShort: r.question_short,
    script: r.script,
    embedding: null,
    groupId: r.group_id,
    dismissedAt: r.dismissed_at,
  }));
  const rendered = activeGroups(asks);
  console.log(`\n  the dashboard would show ${rendered.length} line(s):`);
  rendered.forEach((g) =>
    console.log(`    ${g.count}x  ${g.question}   [${g.scripts.join(", ") || "no script"}]`)
  );
  check(
    "the grouped instalments line shows a count of 2",
    rendered.some((g) => g.count === 2),
    rendered.map((g) => `${g.count}x ${g.question}`).join(" | ")
  );

  // ── What it actually cost, from usage_events ──────────────────────
  const { data: usage } = await supabaseServer
    .from("usage_events")
    .select("session_id, call_type, cost_usd")
    .eq("tenant_id", tenantId)
    .in("session_id", [sessionA, sessionB]);

  // ── What the rows cannot show ─────────────────────────────────────
  // Three of this run's properties leave no row behind, so they are
  // asserted where they ARE visible: the judge calls that were billed.
  const judgeCalls = (session: string) =>
    (usage ?? []).filter((u) => u.session_id === session && u.call_type === "answer_gap_judge").length;

  // B's three requests are judged; the phone number is not. If the
  // photo request had not passed the gate this would be 2, and the
  // five-key OR — the whole reason direct_request is in the gate —
  // would be unproven.
  check(
    "session B made 3 judge calls: the gate fired on the photo request too",
    judgeCalls(sessionB) === 3,
    `${judgeCalls(sessionB)} judge calls — 3 requests judged, the phone number not`
  );

  // A asks eight question-bearing turns. Four are gaps and stop at the
  // row cap; the judge cap is 8 and must not be exceeded either.
  check(
    `session A made at most ${MAX_JUDGE_CALLS_PER_CONVERSATION} judge calls — the judge cap held`,
    judgeCalls(sessionA) <= MAX_JUDGE_CALLS_PER_CONVERSATION,
    `${judgeCalls(sessionA)} judge calls, cap ${MAX_JUDGE_CALLS_PER_CONVERSATION}`
  );
  // The fifth gap must cost NOTHING. Under the old cap it cost a judge
  // call and left a row; the reservation is taken before the judge, so
  // a capped turn is now free.
  check(
    "the capped fifth gap cost no judge call",
    judgeCalls(sessionA) === 7,
    `${judgeCalls(sessionA)} — expected 7: 3 answered, 4 gaps, the 5th refused before the judge`
  );

  if (usage && usage.length > 0) {
    const byType = new Map<string, { n: number; cost: number }>();
    for (const u of usage) {
      const a = byType.get(u.call_type) ?? { n: 0, cost: 0 };
      a.n++;
      a.cost += Number(u.cost_usd);
      byType.set(u.call_type, a);
    }
    console.log("\n  what these two conversations cost, recorded:");
    let total = 0;
    for (const [t, a] of Array.from(byType.entries()).sort((x, y) => y[1].cost - x[1].cost)) {
      total += a.cost;
      console.log(`    ${t.padEnd(22)} ${String(a.n).padStart(3)} calls   $${a.cost.toFixed(5)}`);
    }
    console.log(`    ${"TOTAL".padEnd(22)} ${String(usage.length).padStart(3)} calls   $${total.toFixed(5)}`);
    console.log(`    per conversation                     $${(total / 2).toFixed(5)}`);
  } else {
    // Not a pass. If nothing was metered, the cost breakdown in
    // README.md is not being fed and we would not know.
    check("usage was recorded for these conversations", false, "no usage_events rows found");
  }

  console.log(
    `\n  Sessions, for the browser check:` +
      `\n    A  ${sessionA}` +
      `\n    B  ${sessionB}`
  );
  console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
