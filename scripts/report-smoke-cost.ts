// What the post-deploy smoke test actually costs.
//
//   DOTENV_CONFIG_PATH=.env.local DAYS=14 \
//     npx tsx -r dotenv/config scripts/report-smoke-cost.ts
//
// ── Makes NO model calls ────────────────────────────────────────────
// Like report-cost-per-conversation.ts, this reads usage_events, which
// is a record of calls already made and paid for.
//
// ── How a smoke run is recognised ───────────────────────────────────
// Nothing tags a usage row with the script that caused it, so runs are
// recovered from their shape. scripts/smoke-test.ts holds SIX
// conversations of SEVEN turns, one per failure class, started back to
// back — so a cluster of six sessions whose first events fall inside a
// few minutes of each other, carrying around 42 replies, is a smoke
// run and very little else is.
//
// That is inference, not a label, so every cluster is printed with its
// shape and anything ambiguous is listed separately rather than
// silently counted. If this becomes a number worth defending, the
// honest fix is a run tag on usage_events, not a better guess here.

import { execFileSync } from "node:child_process";
import { supabaseServer } from "../lib/supabase-server";
import { TEST_TENANT_SLUG } from "../lib/test-tenant";

const DAYS = Number(process.env.DAYS ?? 14);
const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

/** Two sessions starting this far apart belong to the same run. */
const RUN_WINDOW_MS = 5 * 60 * 1000;

/** scripts/smoke-test.ts: six conversations, seven turns each. */
const SMOKE_SESSIONS = 6;
const SMOKE_TURNS = 7;
const SMOKE_REPLIES = SMOKE_SESSIONS * SMOKE_TURNS;

type Event = {
  session_id: string;
  call_type: string;
  cost_usd: string | number;
  created_at: string;
};

type Session = { id: string; start: number; replies: number; cost: number; calls: number };
type Run = { sessions: Session[]; start: number; replies: number; cost: number; calls: number };

const usd = (n: number) => `$${n.toFixed(4)}`;

/** A smoke run starts this long after the commit that deployed it. */
const DEPLOY_LAG_MS = 15 * 60 * 1000;

/**
 * Commit times, so a run can be tied to the deployment that caused it.
 *
 * Six conversations one per failure class is the smoke test's shape —
 * and ALSO the shape of measure-coverage, measure-shape and
 * measure-reply-density, which is why shape alone cannot answer "how
 * often did CI run this". What separates them is that CI runs on a
 * deployment: the smoke run begins a couple of minutes after a commit,
 * and a measurement run begins whenever somebody felt like measuring.
 *
 * Commits, not pushes — git does not record when a push happened, and
 * several commits usually go out together. So this MATCHES, it does not
 * prove, and both numbers are printed.
 */
function commitTimes(days: number): number[] {
  try {
    const out = execFileSync("git", ["log", `--since=${days + 1}.days`, "--pretty=%aI", "--all"], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean).map((l) => new Date(l.trim()).getTime());
  } catch {
    return [];
  }
}

async function main() {
  const { data: tenant, error: tenantError } = await supabaseServer
    .from("tenants").select("id").eq("slug", SLUG).single();
  if (tenantError) throw tenantError;

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  // Paged: a fortnight of this tenant is well past PostgREST's default
  // ceiling, and a silently truncated read would report a lower bill.
  const events: Event[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("usage_events")
      .select("session_id, call_type, cost_usd, created_at")
      .eq("tenant_id", tenant.id)
      .not("session_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    events.push(...((data ?? []) as Event[]));
    if (!data || data.length < PAGE) break;
  }

  console.log(`${SLUG}, last ${DAYS} days — ${events.length} metered calls since ${since.slice(0, 10)}\n`);

  // ── Sessions ──────────────────────────────────────────────────────
  const bySession = new Map<string, Session>();
  for (const e of events) {
    const at = new Date(e.created_at).getTime();
    const s = bySession.get(e.session_id) ?? { id: e.session_id, start: at, replies: 0, cost: 0, calls: 0 };
    s.start = Math.min(s.start, at);
    s.cost += Number(e.cost_usd);
    s.calls += 1;
    if (e.call_type === "chat_reply") s.replies += 1;
    bySession.set(e.session_id, s);
  }

  // ── Runs ──────────────────────────────────────────────────────────
  //
  // Clustered on SHAPE first, then time. Clustering on time alone put a
  // real smoke run in the "everything else" pile on 2026-10-17, because
  // a live check happened to be running in the same twenty minutes and
  // glued the two together. A smoke conversation is always seven turns;
  // anything else in the window is somebody's measurement.
  const sessions = Array.from(bySession.values()).sort((a, b) => a.start - b.start);
  const candidates = sessions.filter((s) => s.replies >= SMOKE_TURNS - 1 && s.replies <= SMOKE_TURNS + 1);
  //
  // Cut on the gap between CONSECUTIVE sessions, and close a run once it
  // is full. Measuring the window from the run's first session instead
  // swallowed a second run that started nine minutes after the first on
  // 2026-10-11, reporting twelve sessions and one run where there were
  // two of six — which undercounts the runs and overstates the cost of
  // each.
  const runs: Run[] = [];
  for (const s of candidates) {
    const last = runs[runs.length - 1];
    const previous = last?.sessions[last.sessions.length - 1];
    const joins =
      last && previous && last.sessions.length < SMOKE_SESSIONS && s.start - previous.start <= RUN_WINDOW_MS;
    if (joins) {
      last.sessions.push(s);
      last.replies += s.replies;
      last.cost += s.cost;
      last.calls += s.calls;
    } else {
      runs.push({ sessions: [s], start: s.start, replies: s.replies, cost: s.cost, calls: s.calls });
    }
  }

  const looksLikeSmoke = (r: Run) =>
    r.sessions.length === SMOKE_SESSIONS && r.replies >= SMOKE_REPLIES - 6 && r.replies <= SMOKE_REPLIES + 6;

  const smoke = runs.filter(looksLikeSmoke);
  const other = runs.filter((r) => !looksLikeSmoke(r));

  const commits = commitTimes(DAYS);
  const afterACommit = (r: Run) =>
    commits.some((c) => r.start >= c && r.start - c <= DEPLOY_LAG_MS);

  console.log(`SMOKE RUNS — ${SMOKE_SESSIONS} sessions, ~${SMOKE_REPLIES} replies\n`);
  console.log(`  when                 sess  replies  calls     cost   after a commit?`);
  for (const r of smoke) {
    console.log(
      `  ${new Date(r.start).toISOString().replace("T", " ").slice(0, 16)}` +
        `   ${String(r.sessions.length).padStart(2)}` +
        `   ${String(r.replies).padStart(6)}` +
        `   ${String(r.calls).padStart(5)}` +
        `  ${usd(r.cost).padStart(9)}` +
        `   ${afterACommit(r) ? "deploy" : "no — a measurement run"}`
    );
  }

  const total = smoke.reduce((n, r) => n + r.cost, 0);
  const deployed = smoke.filter(afterACommit);
  const deployedTotal = deployed.reduce((n, r) => n + r.cost, 0);
  console.log(`\n  ${smoke.length} runs of this shape, ${usd(total)}`);
  console.log(
    `  ${deployed.length} of them start within ${DEPLOY_LAG_MS / 60000} min of a commit: ` +
      `${usd(deployedTotal)}, ${usd(deployed.length ? deployedTotal / deployed.length : 0)} per run`
  );
  if (DAYS >= 7) {
    console.log(
      `  ${(deployed.length / (DAYS / 7)).toFixed(1)} deploy runs/week, ${usd(deployedTotal / (DAYS / 7))}/week`
    );
  }

  // Seven-turn clusters that are NOT six sessions: a partial smoke run,
  // or a measurement script that happens to run conversations the same
  // length. Printed rather than folded away, because the difference
  // between "not a smoke run" and "a smoke run I failed to recognise"
  // is the whole accuracy of the number above.
  if (other.length) {
    console.log(`\nSEVEN-TURN CLUSTERS THAT ARE NOT SIX SESSIONS — check these by eye\n`);
    console.log(`  when                 sess  replies  calls     cost`);
    for (const r of other) {
      console.log(
        `  ${new Date(r.start).toISOString().replace("T", " ").slice(0, 16)}` +
          `   ${String(r.sessions.length).padStart(2)}` +
          `   ${String(r.replies).padStart(6)}` +
          `   ${String(r.calls).padStart(5)}` +
          `  ${usd(r.cost).padStart(9)}`
      );
    }
  }

  const allCost = sessions.reduce((n, s) => n + s.cost, 0);
  console.log(
    `\nALL metered spend on ${SLUG} in ${DAYS} days: ${usd(allCost)}` +
      `   smoke ${usd(total)} (${allCost > 0 ? ((total / allCost) * 100).toFixed(0) : 0}%)` +
      `, everything else ${usd(allCost - total)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
