// How much does the question-mark gate miss?
//
//   DOTENV_CONFIG_PATH=.env.local SLUG=prof-clinic \
//     npx tsx -r dotenv/config scripts/report-question-gate.ts
//
// ── Zero model calls, zero writes ───────────────────────────────────
// Reads public.conversations and nothing else. Calls no provider.
// Changes nothing. Safe to run against the real clinic, which is the
// point: the only data that can answer this question is real customer
// messages, and test-clinic's are mine.
//
// ── What it does and does not decide ────────────────────────────────
// The capture gate is `CONTAINS_QUESTION`, a question mark in any
// script. It is free, which is why it runs first. It also cannot see a
// question asked without one — "I was wondering about the price", "tell
// me how long it takes", "كم التكلفة" with no mark.
//
// This script counts the two buckets and DUMPS the no-mark bucket to a
// file to be read by a person. It does not try to classify them: any
// regex I wrote for "is this really a question" would be the same kind
// of guess the keyword detectors were, and those scored zero recall in
// five of six scripts. The output is evidence for a decision, not the
// decision.
//
// The dump goes outside the repository on purpose. These are real
// customer messages.

import { writeFileSync } from "node:fs";
import { supabaseServer } from "../lib/supabase-server";
import { CONTAINS_QUESTION } from "../lib/punctuation";
import { detectScript } from "../lib/visitor-language";

const SLUG = process.env.SLUG ?? "prof-clinic";
const OUT = process.env.OUT ?? "no-question-mark.txt";

type Row = { session_id: string; content: string; created_at: string };

async function main() {
  const { data: tenant, error: tenantError } = await supabaseServer
    .from("tenants").select("id, slug, business_name").eq("slug", SLUG).single();
  if (tenantError) throw tenantError;

  // Paged. PostgREST caps at 1,000 rows and does not say so.
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("conversations")
      .select("session_id, content, created_at")
      .eq("tenant_id", tenant.id)
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const sessions = new Set(rows.map((r) => r.session_id));
  const withMark = rows.filter((r) => CONTAINS_QUESTION.test(r.content));
  const without = rows.filter((r) => !CONTAINS_QUESTION.test(r.content));

  console.log(`${SLUG} — ${rows.length} visitor messages across ${sessions.size} conversations\n`);
  console.log("--- the gate as it stands ---");
  console.log(
    `  with a question mark     ${String(withMark.length).padStart(5)}  ` +
      `${((withMark.length / rows.length) * 100).toFixed(1)}%`
  );
  console.log(
    `  without                  ${String(without.length).padStart(5)}  ` +
      `${((without.length / rows.length) * 100).toFixed(1)}%`
  );

  // Per conversation, which is what cost depends on.
  const markPerSession = new Map<string, number>();
  for (const r of withMark) {
    markPerSession.set(r.session_id, (markPerSession.get(r.session_id) ?? 0) + 1);
  }
  const counts = Array.from(sessions).map((s) => markPerSession.get(s) ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const sorted = [...counts].sort((a, b) => a - b);
  const capped = counts.map((c) => Math.min(c, 4));

  console.log("\n--- judge calls per conversation, if the gate stays as it is ---");
  console.log(`  mean                     ${(total / sessions.size).toFixed(2)}`);
  console.log(`  median                   ${sorted[Math.floor(sorted.length / 2)]}`);
  console.log(`  p90                      ${sorted[Math.floor(sorted.length * 0.9)]}`);
  console.log(`  max                      ${sorted[sorted.length - 1]}`);
  console.log(
    `  conversations with none  ${counts.filter((c) => c === 0).length}  ` +
      `(${((counts.filter((c) => c === 0).length / sessions.size) * 100).toFixed(1)}% cost nothing at all)`
  );
  console.log(
    `  over the cap of 4        ${counts.filter((c) => c > 4).length}  ` +
      `(${((counts.filter((c) => c > 4).length / sessions.size) * 100).toFixed(1)}%)`
  );
  console.log(
    `  mean AFTER the cap       ${(capped.reduce((a, b) => a + b, 0) / sessions.size).toFixed(2)}` +
      `   <- this is the number cost should be computed from`
  );

  // Length distribution of the no-mark bucket. A one-word message is
  // almost certainly a name or a yes, not a question, and knowing how
  // much of the bucket is that tells you how much is worth reading.
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const buckets = { "1 word": 0, "2-3 words": 0, "4-8 words": 0, "9+ words": 0 };
  for (const r of without) {
    const w = words(r.content);
    if (w <= 1) buckets["1 word"]++;
    else if (w <= 3) buckets["2-3 words"]++;
    else if (w <= 8) buckets["4-8 words"]++;
    else buckets["9+ words"]++;
  }
  console.log("\n--- the no-mark bucket, by length ---");
  for (const [label, n] of Object.entries(buckets)) {
    console.log(
      `  ${label.padEnd(12)} ${String(n).padStart(5)}  ${((n / without.length) * 100).toFixed(1)}%`
    );
  }

  const byScript = new Map<string, number>();
  for (const r of without) {
    const s = detectScript([r.content]) ?? "unknown";
    byScript.set(s, (byScript.get(s) ?? 0) + 1);
  }
  console.log("\n--- the no-mark bucket, by script ---");
  for (const [s, n] of Array.from(byScript.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(12)} ${String(n).padStart(5)}`);
  }

  // Deduplicated, because "hi" and a bare name appear hundreds of times
  // and reading the same line twice tells nobody anything.
  const distinct = Array.from(new Set(without.map((r) => r.content.trim())));
  writeFileSync(
    OUT,
    [
      `${SLUG}: ${without.length} visitor messages with no question mark, ${distinct.length} distinct.`,
      `Real customer messages. Read, classify by hand, do not commit.`,
      "",
      ...distinct.map((c) => c.replace(/\s+/g, " ")),
    ].join("\n"),
    "utf8"
  );
  console.log(`\n  ${distinct.length} distinct messages written to ${OUT}`);
  console.log("  Nothing above classifies them. That is a reading job.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
