// Plan, never apply, a fix for conversation turns stored with tied timestamps.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/plan-conversation-order.ts
//
// FREE and READ-ONLY: it selects rows and writes a review file. There is
// no write path in this script at all.
//
// Before 2026-11-04 (7d8fb72), a turn's rows were inserted together and
// shared one timestamp: the visitor's message and the reply, and on the
// first turn the greeting too. Every reader orders by created_at, and
// Postgres returns ties in no fixed order, so the dashboard conversation
// view can show a reply above the question it answers. Rows written
// since have distinct timestamps.
//
// The plan, per tied group, for the real tenants only:
//   - one visitor message + one reply: message, then reply. Decided.
//   - a session's FIRST group of greeting + message + reply: the greeting
//     is the assistant text that also opens at least one OTHER
//     conversation on the same tenant (greetings repeat, replies do not).
//     Decided only when exactly one of the two assistant rows is that.
//   - anything else: listed as undecided, for a person to read.
// The proposed fix gives the rows in a group distinct timestamps, 1 ms
// apart, in that order. Nothing here applies it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const TENANTS = ["prof-clinic", "demo-clinic"];

type Row = { id: string; session_id: string; role: string; content: string; created_at: string };
type Decided = { session: string; at: string; current: Row[]; proposed: Row[]; how: string; collision: boolean };
type Undecided = { session: string; at: string; rows: Row[]; why: string };

const excerpt = (r: Row) => `${r.role === "user" ? "visitor" : "assistant"}: ${r.content.replace(/\s+/g, " ").slice(0, 70)}`;

async function main() {
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [`# Conversation order: dry run, ${date}`, "", "Read-only. Nothing has been changed. Each tied group below would get distinct timestamps, 1 ms apart, in the proposed order.", ""];
  const plan: { tenant: string; updates: { id: string; created_at: string }[] }[] = [];

  for (const slug of TENANTS) {
    const { data: tenant, error } = await s.from("tenants").select("id").eq("slug", slug).single();
    if (error || !tenant) throw new Error(`no tenant ${slug}`);
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await s.from("conversations").select("id, session_id, role, content, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: true }).range(from, from + 999);
      if (e) throw e;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const bySession = new Map<string, Row[]>();
    for (const r of rows) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push(r);

    // Greeting texts: assistant rows in a session's first group, counted
    // by how many DIFFERENT sessions they open.
    const opens = new Map<string, Set<string>>();
    for (const [sid, list] of Array.from(bySession)) {
      const first = list[0].created_at;
      for (const r of list.filter((x) => x.created_at === first && x.role === "assistant")) {
        (opens.get(r.content) ?? opens.set(r.content, new Set()).get(r.content)!).add(sid);
      }
    }

    const decided: Decided[] = [];
    const undecided: Undecided[] = [];
    let ties = 0;
    for (const [sid, list] of Array.from(bySession)) {
      const stamps = Array.from(new Set(list.map((r) => r.created_at))).sort();
      stamps.forEach((at, gi) => {
        const group = list.filter((r) => r.created_at === at);
        if (group.length < 2) return;
        ties++;
        const users = group.filter((r) => r.role === "user");
        const assistants = group.filter((r) => r.role === "assistant");
        const next = stamps[gi + 1];
        const collides = (n: number) => next !== undefined && Date.parse(at) + n >= Date.parse(next);
        if (group.length === 2 && users.length === 1 && assistants.length === 1) {
          decided.push({ session: sid, at, current: group, proposed: [users[0], assistants[0]], how: "message, then reply", collision: collides(1) });
          return;
        }
        if (group.length === 3 && users.length === 1 && assistants.length === 2 && gi === 0) {
          const isGreeting = assistants.map((a) => (opens.get(a.content)?.size ?? 0) >= 2);
          if (isGreeting.filter(Boolean).length === 1) {
            const greeting = assistants[isGreeting.indexOf(true)];
            const reply = assistants[isGreeting.indexOf(false)];
            decided.push({ session: sid, at, current: group, proposed: [greeting, users[0], reply], how: `greeting (opens ${opens.get(greeting.content)!.size} conversations), message, reply`, collision: collides(2) });
          } else {
            undecided.push({ session: sid, at, rows: group, why: isGreeting.every(Boolean) ? "both assistant rows open other conversations" : "neither assistant row opens another conversation" });
          }
          return;
        }
        undecided.push({ session: sid, at, rows: group, why: `a group of ${group.length} (${users.length} visitor, ${assistants.length} assistant)${gi === 0 ? "" : ", not the first turn"}` });
      });
    }

    const changes = decided.filter((d) => d.current.some((r, i) => r.id !== d.proposed[i].id)).length;
    out.push(`## ${slug}`, "", `${bySession.size} conversations, ${ties} tied groups: **${decided.length} decided** (${changes} currently read back in a different order from the proposal), **${undecided.length} undecided**.${decided.some((d) => d.collision) ? " Some proposals would collide with the next turn's timestamp; marked below." : ""}`, "");
    if (undecided.length) {
      out.push("### Undecided: for a person to read", "");
      for (const u of undecided) {
        out.push(`- session \`${u.session.slice(0, 8)}\` at ${u.at}: ${u.why}`);
        for (const r of u.rows) out.push(`    - ${excerpt(r)}`);
      }
      out.push("");
    }
    out.push("### Decided: every proposed reorder", "");
    for (const d of decided) {
      out.push(`- session \`${d.session.slice(0, 8)}\` at ${d.at} — ${d.how}${d.collision ? " — **COLLIDES with the next turn**" : ""}`);
      d.proposed.forEach((r, i) => out.push(`    ${i + 1}. ${excerpt(r)}`));
    }
    out.push("");
    plan.push({
      tenant: slug,
      updates: decided.flatMap((d) => d.proposed.map((r, i) => ({ id: r.id, created_at: new Date(Date.parse(d.at) + i).toISOString() }))),
    });
    console.log(`${slug}: ${bySession.size} conversations, ${ties} tied groups, ${decided.length} decided (${changes} would change order), ${undecided.length} undecided, ${decided.filter((d) => d.collision).length} collisions`);
  }

  const md = join(__dirname, "..", "docs", `conversation-order-dryrun-${date}.md`);
  writeFileSync(md, out.join("\n"));
  const json = join(__dirname, "..", "docs", `conversation-order-plan-${date}.json`);
  writeFileSync(json, JSON.stringify(plan, null, 2));
  console.log(`wrote ${md}\nwrote ${json} (the updates an approved apply would make; nothing applied)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
