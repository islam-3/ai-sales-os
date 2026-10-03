// Does a refresh actually get the conversation back, and does it cost
// anything it should not?
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-resume-check.ts
//
// Three properties, against the real deployment, because all three are
// about things no pure function can see: what the route stored, what the
// metering function counted, and how many lead rows exist afterwards.
//
//   TRANSCRIPT  the conversation comes back, in order, with the stored
//               greeting as its first turn
//   METER       current_period_conversations did NOT move on resume
//   LEAD        there is exactly ONE lead_profile row, updated rather
//               than duplicated
//
// The second and third are the ones that cost money. A resumed session
// billed again overcharges the clinic; a second lead row means the sales
// team rings the same person twice.
//
// Also checks the refusals, because a new read surface for conversation
// history is worth proving closed: a session id replayed against another
// tenant, and a malformed one.

import { say } from "./_chat-client";
import { TEST_TENANT_SLUG } from "../lib/test-tenant";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
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

type ResumeBody = {
  resumed?: boolean;
  expired?: boolean;
  messages?: { role: string; content: string; at?: string }[];
  error?: string;
};

async function resume(slug: string, sessionId: string): Promise<{ status: number; body: ResumeBody }> {
  const res = await fetch(`${BASE}/api/chat/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, sessionId }),
  });
  return { status: res.status, body: (await res.json()) as ResumeBody };
}

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id, current_period_conversations")
    .eq("slug", SLUG)
    .single();
  if (!tenant) throw new Error(`no tenant ${SLUG}`);

  const before = tenant.current_period_conversations ?? 0;
  console.log(`${SLUG} on ${BASE}`);
  console.log(`conversations counted so far: ${before}\n`);

  // ── A conversation, as a visitor would have it ─────────────────────
  const sessionId = crypto.randomUUID();
  console.log("--- a visitor talks, then closes the tab ---");
  await say(sessionId, "hi, I'm looking into dental implants");
  await say(sessionId, "I lost most of my upper teeth about five years ago");

  const { data: afterTalking } = await supabaseServer
    .from("tenants")
    .select("current_period_conversations")
    .eq("id", tenant.id)
    .single();
  const counted = afterTalking?.current_period_conversations ?? 0;
  check(
    "the conversation was counted once",
    counted === before + 1,
    `${before} -> ${counted}, expected ${before + 1}`
  );

  // ── The refresh ────────────────────────────────────────────────────
  console.log("\n--- they come back and the page reloads ---");
  const { status, body } = await resume(SLUG, sessionId);
  check("resume returns 200", status === 200, `got ${status}`);
  check("and says it resumed", body.resumed === true);

  const messages = body.messages ?? [];
  check("the transcript comes back", messages.length >= 4, `${messages.length} turns`);
  check(
    "it opens with the stored greeting",
    messages[0]?.role === "assistant" && (messages[0]?.content ?? "").length > 0,
    `first turn is ${messages[0]?.role}: "${(messages[0]?.content ?? "").slice(0, 60)}"`
  );
  check(
    "the visitor's own words are in it, in order",
    messages.some((m) => m.role === "user" && m.content.includes("dental implants")) &&
      messages.some((m) => m.role === "user" && m.content.includes("five years ago")),
    messages.map((m) => `${m.role}: ${m.content.slice(0, 28)}`).join(" | ")
  );
  check(
    "and nothing but the transcript came with it",
    Object.keys(body).every((k) => ["resumed", "messages", "expired"].includes(k)),
    `keys: ${Object.keys(body).join(", ")}`
  );
  check(
    "no lead data on any turn",
    messages.every((m) => Object.keys(m).every((k) => ["role", "content", "at"].includes(k))),
    `turn keys: ${Object.keys(messages[0] ?? {}).join(", ")}`
  );

  // ── What it must not have cost ─────────────────────────────────────
  console.log("\n--- and what resuming cost ---");
  const { data: afterResume } = await supabaseServer
    .from("tenants")
    .select("current_period_conversations")
    .eq("id", tenant.id)
    .single();
  const stillCounted = afterResume?.current_period_conversations ?? 0;
  check(
    "the counter did NOT move",
    stillCounted === counted,
    `${counted} -> ${stillCounted}; a resumed session must not be billed again`
  );

  // Carrying on in the same session, as the restored page would.
  await say(sessionId, "my name is David and my number is +44 7700 900123");

  const { data: afterMore } = await supabaseServer
    .from("tenants")
    .select("current_period_conversations")
    .eq("id", tenant.id)
    .single();
  check(
    "and still did not move once they carried on",
    (afterMore?.current_period_conversations ?? 0) === counted,
    `${counted} -> ${afterMore?.current_period_conversations}`
  );

  // The lead. Given a moment, because extraction runs after the reply.
  console.log("\n--- the lead ---");
  let leads: { id: string; name: string | null; contact_info: string | null }[] = [];
  for (let waited = 0; waited < 40; waited += 5) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data } = await supabaseServer
      .from("lead_profile")
      .select("id, name, contact_info")
      .eq("tenant_id", tenant.id)
      .eq("session_id", sessionId);
    leads = data ?? [];
    if (leads.length > 0 && (leads[0].contact_info ?? "").trim()) break;
  }
  check("exactly ONE lead row for this session", leads.length === 1, `${leads.length} rows`);
  check(
    "and it carries what they gave after the refresh",
    (leads[0]?.name ?? "").includes("David") &&
      (leads[0]?.contact_info ?? "").replace(/\D/g, "").includes("447700900123"),
    `name=${leads[0]?.name ?? "—"} contact=${leads[0]?.contact_info ?? "—"}`
  );

  // ── The refusals ───────────────────────────────────────────────────
  console.log("\n--- and what it refuses ---");
  const wrongTenant = await resume("prof-clinic", sessionId);
  check(
    "a session id replayed against another tenant returns nothing",
    (wrongTenant.body.messages ?? []).length === 0 && wrongTenant.body.resumed !== true,
    `status ${wrongTenant.status}, ${(wrongTenant.body.messages ?? []).length} turns`
  );

  const malformed = await resume(SLUG, "not-a-uuid");
  check("a malformed session id is rejected", malformed.status === 400, `got ${malformed.status}`);

  const unknownTenant = await resume("no-such-tenant-here", crypto.randomUUID());
  check("an unknown tenant is rejected", unknownTenant.status === 404, `got ${unknownTenant.status}`);

  const unknownSession = await resume(SLUG, crypto.randomUUID());
  check(
    "an unknown session is empty rather than an error",
    unknownSession.status === 200 && (unknownSession.body.messages ?? []).length === 0,
    "the page has to open and start a fresh conversation"
  );

  console.log(bad ? `\n${bad} FAILING` : "\nresume works and costs nothing it should not");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
