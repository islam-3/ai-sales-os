// Stored test-clinic conversations whose turn order is certain.
//
// Rows written before 2026-11-04 share one timestamp per turn (the
// visitor's message and the reply were inserted together under now()),
// and Postgres returns ties in no fixed order: the same session can read
// back reply-first. Since 7d8fb72 every row gets its own timestamp. This
// keeps only sessions where NO two rows tie, so the transcript is the
// conversation as it happened, every time it is read.
//
// Used by measurement scripts that replay stored conversations, so their
// input is reproducible and their session ids can be recorded and reused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CASES, type Case } from "./_smoke-cases";

export type StoredConversation = {
  sessionId: string;
  case: Case;
  turns: { role: string; content: string }[];
};

export async function tieFreeSmokeConversations(
  s: SupabaseClient,
  tenantId: string,
  perCase: number
): Promise<StoredConversation[]> {
  // Paged: Supabase returns at most 1,000 rows per query whatever .limit() says.
  const rows: { session_id: string; role: string; content: string; created_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s
      .from("conversations")
      .select("session_id, role, content, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const bySession = new Map<string, typeof rows>();
  for (const r of rows) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push(r);

  const out: StoredConversation[] = [];
  for (const c of CASES) {
    let taken = 0;
    // Newest first.
    for (const [sid, list] of Array.from(bySession).reverse()) {
      if (taken >= perCase) break;
      const stamps = new Set(list.map((r) => r.created_at));
      if (stamps.size !== list.length) continue; // a tie: order not certain
      const users = list.filter((r) => r.role === "user");
      if (users.length !== c.turns.length || users.some((u, i) => u.content !== c.turns[i])) continue;
      // Strictly alternating, starting with the visitor: the shape the smoke test writes.
      if (list.some((r, i) => r.role !== (i % 2 === 0 ? "user" : "assistant"))) continue;
      out.push({ sessionId: sid, case: c, turns: list.map((r) => ({ role: r.role, content: r.content })) });
      taken++;
    }
  }
  return out;
}
