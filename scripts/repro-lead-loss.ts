// Reproduces the lost-contact-details failure, against whichever
// deployment BASE_URL points at.
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/repro-lead-loss.ts
//
// The conversation is the real one that lost a lead on 2026-09-21,
// turn for turn: eight visitor messages ending on a name and then a
// WhatsApp number, with nothing after them. That ending is the whole
// point. Extraction is fired without being awaited and the response
// returns immediately, so on a serverless host the instance can be
// frozen before the extraction call finishes — and the final turn is the
// most exposed, because no later request arrives to keep it alive.
//
// Run this against production BEFORE the fix and it should show the name
// and number missing. That failing run is what makes the passing one
// afterwards mean anything.

import { say } from "./_chat-client";

const TURNS = [
  "علاج الاسنان",
  "زراعة الاسنان",
  "زراعه كامله",
  "5 سنين",
  "مللت من الوضع",
  "نعم",
  "خالد",
  "506066666666666+",
];

const EXPECTED_NAME = "خالد";
const EXPECTED_DIGITS = "506066666666666";

// Mirrors CONTACT_HINT in app/api/chat/route.ts. Reproduced here rather
// than imported so this script keeps describing the DEPLOYED behaviour
// even after the local copy changes.
const CONTACT_HINT =
  /\d{6,}|\+\d[\d\s().-]{5,}|@[\w.-]+\.\w{2,}|\bwhats\s?app\b|\be-?mail\b|\bcall me\b|\breach me\b|\bmy number\b/i;

const WAIT_SECONDS = 45;

async function main() {
  const sessionId = crypto.randomUUID();
  console.log(`BASE_URL = ${process.env.BASE_URL ?? "http://localhost:3000"}`);
  console.log(`session  = ${sessionId}\n`);

  for (let i = 0; i < TURNS.length; i++) {
    const turn = i + 1;
    const fires = turn <= 2 || CONTACT_HINT.test(TURNS[i]) || turn % 3 === 0;
    const { reply } = await say(sessionId, TURNS[i]);
    console.log(
      `turn ${turn}  extract=${fires ? "YES" : "no "}  «${TURNS[i]}»\n` +
        `        → ${reply.replace(/\s+/g, " ").slice(0, 90)}`
    );
  }

  console.log(
    `\nlast turn carries contact details, so extraction was triggered.` +
      `\nwaiting ${WAIT_SECONDS}s for it to land...\n`
  );

  const { supabaseServer } = await import("../lib/supabase-server");
  let lead: { name: string | null; contact_info: string | null } | null = null;

  for (let waited = 0; waited < WAIT_SECONDS; waited += 5) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data } = await supabaseServer
      .from("lead_profile")
      .select("name, contact_info")
      .eq("session_id", sessionId)
      .maybeSingle();
    lead = data ?? null;
    const has = Boolean(lead?.name?.trim()) && Boolean(lead?.contact_info?.trim());
    console.log(
      `  +${String(waited + 5).padStart(2)}s  name=${lead?.name ?? "—"}  contact=${lead?.contact_info ?? "—"}`
    );
    if (has) break;
  }

  const nameOk = (lead?.name ?? "").includes(EXPECTED_NAME);
  const contactOk = (lead?.contact_info ?? "").replace(/\D/g, "").includes(EXPECTED_DIGITS);

  console.log(`\n${"═".repeat(58)}`);
  console.log(`  lead row exists : ${lead ? "yes" : "NO"}`);
  console.log(`  name saved      : ${nameOk ? "yes" : "NO"}   (expected ${EXPECTED_NAME})`);
  console.log(`  number saved    : ${contactOk ? "yes" : "NO"}   (expected ${EXPECTED_DIGITS})`);
  console.log(`${"═".repeat(58)}`);

  if (nameOk && contactOk) {
    console.log("\nRESULT: contact details survived. The bug does not reproduce here.");
  } else {
    console.log("\nRESULT: contact details LOST. This is the failure.");
  }
  process.exit(nameOk && contactOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
