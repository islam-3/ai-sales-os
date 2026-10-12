// Does answer-gap capture actually work against the real deployment?
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-capture-check.ts
//
// ── PAID. Roughly 54 Anthropic calls and 6 OpenAI embeddings, ~$0.21 ──
// Most of that is the chat replies and lead extraction the conversations
// would cost anyway; the new feature's share is about $0.05. Do not run
// this without saying so first.
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
//   B  Arabic, three turns. A request with NO QUESTION MARK, which the
//      old gate would have missed entirely and which must now group with
//      session A's instalments row across two languages. Then a photo
//      request, which fires through direct_request rather than
//      asking_for_information. Then a phone number, which must not be
//      judged.

import { randomUUID } from "node:crypto";
import { say } from "./_chat-client";
import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { MAX_JUDGE_CALLS_PER_CONVERSATION } from "../lib/answer-gap";
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
  // Fires through direct_request, not asking_for_information.
  "اعطيني صور قبل وبعد",
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
    `session A captured exactly ${MAX_JUDGE_CALLS_PER_CONVERSATION} — the cap held`,
    fromA.length === MAX_JUDGE_CALLS_PER_CONVERSATION,
    `got ${fromA.length}: ${fromA.map((r) => r.question_raw).join(" | ")}`
  );
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
    .select("call_type, cost_usd")
    .eq("tenant_id", tenantId)
    .in("session_id", [sessionA, sessionB]);

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
