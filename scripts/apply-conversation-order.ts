// Apply the approved conversation-order correction, with a backup first.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/apply-conversation-order.ts
//       (dry: checks everything, writes nothing)
//   APPLY=1 ...                                  (backs up, then applies)
//   REVERT=docs/conversation-order-backup-<date>.json ...   (restores the backup)
//
// Approved 2026-11-17: the 230 decided reorders in
// docs/conversation-order-plan-2026-11-17.json (prof-clinic 59 groups,
// demo-clinic 171), plus demo-clinic's two undecided groups in the order
// read by hand: greeting, visitor message, reply.
//
// Each tied group keeps its first row's timestamp exactly. The rows after
// it move 1 ms, 2 ms later, keeping the original microseconds, so the
// group reads back in the approved order and nothing crosses into the
// next turn (the dry run found no collisions; this checks again).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PLAN = join(__dirname, "..", "docs", "conversation-order-plan-2026-11-17.json");
const BACKUP = join(__dirname, "..", "docs", "conversation-order-backup-2026-11-17.json");
const TENANTS = ["prof-clinic", "demo-clinic"];

/** The two demo-clinic groups decided by reading, in their approved order. */
const BY_HAND = [
  {
    session: "235135e7",
    at: "2026-08-24T07:25:11.033451",
    order: [
      { role: "assistant", startsWith: "Hi! We're Demo Clinic in Istanbul" },
      { role: "user", startsWith: "Meet our team" },
      { role: "assistant", startsWith: "We have some genuinely impressive specialists" },
    ],
  },
  {
    session: "2579f532",
    at: "2026-08-30T20:00:16.130653",
    order: [
      { role: "assistant", startsWith: "Hi! We’re Demo Clinic" },
      { role: "user", startsWith: "What do you offer?" },
      { role: "assistant", startsWith: "We have a team of specialists" },
    ],
  },
];

type Row = { id: string; session_id: string; role: string; content: string; created_at: string; tenant_id: string };

/** The same instant, i milliseconds later, keeping the microseconds the database stored. */
function plusMs(ts: string, i: number): string {
  const micro = ts.match(/\.\d{3}(\d*)/)?.[1] ?? "";
  const iso = new Date(Date.parse(ts) + i).toISOString(); // ...SS.mmmZ
  return iso.replace(/Z$/, `${micro}Z`);
}
const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b) && (a.match(/\.\d{3}(\d*)/)?.[1] ?? "").padEnd(3, "0") === (b.match(/\.\d{3}(\d*)/)?.[1] ?? "").padEnd(3, "0");

async function main() {
  const { supabaseServer: s } = await import("../lib/supabase-server");

  if (process.env.REVERT) {
    const backup = JSON.parse(readFileSync(process.env.REVERT, "utf8")) as { id: string; created_at: string }[];
    for (const b of backup) {
      const { error } = await s.from("conversations").update({ created_at: b.created_at }).eq("id", b.id);
      if (error) throw error;
    }
    console.log(`reverted ${backup.length} rows from ${process.env.REVERT}`);
    return;
  }

  // Current rows of both tenants.
  const { data: tenants } = await s.from("tenants").select("id, slug").in("slug", TENANTS);
  const rows = new Map<string, Row>();
  for (const t of tenants!) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await s.from("conversations").select("id, session_id, role, content, created_at, tenant_id").eq("tenant_id", t.id).order("created_at").range(from, from + 999);
      if (error) throw error;
      for (const r of data!) rows.set(r.id, r);
      if (data!.length < 1000) break;
    }
  }

  // The approved groups: from the plan, in its order, grouped by the
  // timestamp the rows share today.
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { tenant: string; updates: { id: string }[] }[];
  const groups: Row[][] = [];
  for (const t of plan) {
    let current: Row[] = [];
    for (const u of t.updates) {
      const row = rows.get(u.id);
      if (!row) throw new Error(`plan row ${u.id} no longer exists`);
      if (current.length && !sameInstant(current[0].created_at, row.created_at)) { groups.push(current); current = []; }
      current.push(row);
    }
    if (current.length) groups.push(current);
  }
  // The two by hand.
  for (const g of BY_HAND) {
    const candidates = Array.from(rows.values()).filter((r) => r.session_id.startsWith(g.session) && r.created_at.startsWith(g.at));
    const ordered = g.order.map((o) => {
      const hits = candidates.filter((r) => r.role === o.role && r.content.startsWith(o.startsWith));
      if (hits.length !== 1) throw new Error(`session ${g.session}: ${hits.length} rows match ${o.role} "${o.startsWith}", need exactly 1`);
      return hits[0];
    });
    if (candidates.length !== 3) throw new Error(`session ${g.session}: ${candidates.length} rows at ${g.at}, expected 3`);
    groups.push(ordered);
  }

  // Every group must still be exactly one tie, and must not reach the next turn.
  const updates: { id: string; from: string; to: string }[] = [];
  for (const g of groups) {
    const base = g[0].created_at;
    if (!g.every((r) => sameInstant(r.created_at, base))) throw new Error(`group in session ${g[0].session_id.slice(0, 8)} no longer shares one timestamp: the data changed since the dry run`);
    const later = Array.from(rows.values()).filter((r) => r.session_id === g[0].session_id && Date.parse(r.created_at) > Date.parse(base)).map((r) => Date.parse(r.created_at));
    if (later.length && Math.min(...later) <= Date.parse(base) + g.length - 1) throw new Error(`group in session ${g[0].session_id.slice(0, 8)} would reach the next turn`);
    g.forEach((r, i) => { if (i > 0) updates.push({ id: r.id, from: r.created_at, to: plusMs(base, i) }); });
  }
  const groupCount = groups.length;
  console.log(`${groupCount} groups (${groups.length - BY_HAND.length} from the plan + ${BY_HAND.length} by hand), ${updates.length} rows to move; every group verified unchanged since the dry run`);

  if (process.env.APPLY !== "1") {
    console.log("dry: nothing written. Set APPLY=1 to back up and apply.");
    return;
  }

  // Backup first, and refuse to overwrite one: it is the only way back.
  if (existsSync(BACKUP)) throw new Error(`${BACKUP} already exists; refusing to overwrite the only way back`);
  writeFileSync(BACKUP, JSON.stringify(updates.map((u) => ({ id: u.id, created_at: u.from })), null, 2));
  console.log(`backup written: ${BACKUP} (${updates.length} original timestamps)`);

  for (const u of updates) {
    const { error } = await s.from("conversations").update({ created_at: u.to }).eq("id", u.id);
    if (error) throw new Error(`stopped at ${u.id}: ${error.message}. Revert with REVERT=${BACKUP}`);
  }
  console.log(`applied ${updates.length} updates`);

  // Verify: no ties left in either tenant, and every group reads back in order.
  for (const t of tenants!) {
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await s.from("conversations").select("id, session_id, role, content, created_at, tenant_id").eq("tenant_id", t.id).order("created_at").range(from, from + 999);
      all.push(...data!);
      if (data!.length < 1000) break;
    }
    const seen = new Map<string, number>();
    let ties = 0;
    for (const r of all) { const k = `${r.session_id}|${r.created_at}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    for (const n of Array.from(seen.values())) if (n > 1) ties++;
    console.log(`${t.slug}: ${ties} tied groups left`);
  }
  let outOfOrder = 0;
  for (const g of groups) {
    const ids = g.map((r) => r.id);
    const { data } = await s.from("conversations").select("id").in("id", ids).order("created_at");
    if (data!.map((r) => r.id).join() !== ids.join()) outOfOrder++;
  }
  console.log(`groups reading back in the approved order: ${groups.length - outOfOrder} of ${groups.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
