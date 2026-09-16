// Live sanity check for the media pipeline.
//
// This is a SANITY CHECK, not the proof. The proof is
// test-media-decision.ts, which pins every branch against fixed fixtures.
// Replayed conversations cannot prove anything on their own, because the
// model's wording varies run to run and two lucky passes previously hid a
// real defect. What this catches is the wiring: that the decision reaches
// the response, that the reply text and the attached image agree, and that
// nothing is claimed that was not sent.
//
//   npx tsx scripts/live-media-check.ts

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = "prof-clinic";

type Reply = { reply: string; media: { url: string; type: string | null } | null };

async function say(sessionId: string, message: string): Promise<Reply> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, sessionId, slug: SLUG }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// The route requires a real UUID.
const newSession = () => crypto.randomUUID();

/**
 * Phrases that assert an image is present. Saying one of these with no
 * image attached is the failure this check exists to catch.
 *
 * "here is" has to be anchored to the start of a sentence. Unanchored it
 * fires on ordinary prose — "the quality here is world-class" — and a
 * checker that cries wolf is worse than no checker.
 */
const CLAIMS_AN_IMAGE = new RegExp(
  [
    "(?:^|[.!?\n]\s*)here(?:'s| is| you go)\b",
    "\battached\b",
    "\btake a look at th(?:is|ese)\b",
    "\bas you can see\b",
    "\bin (?:this|the) (?:photo|picture|image)\b",
  ].join("|"),
  "i"
);

/** Image markup or a raw URL in the reply. The visitor sees these raw. */
const LEAKED_MARKUP = /!\[|\]\(|\[\[|https?:\/\//i;

function show(label: string, turn: string, r: Reply) {
  const img = r.media ? r.media.url.split("/").pop() : null;
  console.log(`\n  VISITOR  ${turn}`);
  console.log(`  BOT      ${r.reply.replace(/\n/g, "\n           ")}`);
  console.log(`  IMAGE    ${img ?? "— none —"}`);
  const claimed = CLAIMS_AN_IMAGE.test(r.reply);
  if (claimed && !r.media) console.log(`  ⚠ CLAIMS AN IMAGE THAT WAS NOT SENT`);
  if (LEAKED_MARKUP.test(r.reply)) console.log(`  ⚠ URL OR IMAGE MARKUP LEAKED INTO THE REPLY`);
  return { img, claimed };
}

async function scenario(name: string, turns: string[]) {
  console.log(`\n${"─".repeat(72)}\n${name}\n${"─".repeat(72)}`);
  const sessionId = newSession();
  const sent: string[] = [];
  let problems = 0;
  for (const turn of turns) {
    const r = await say(sessionId, turn);
    const { img, claimed } = show(name, turn, r);
    if (img) sent.push(img);
    if (claimed && !r.media) problems++;
    if (LEAKED_MARKUP.test(r.reply)) problems++;
  }
  const dupes = sent.filter((u, i) => sent.indexOf(u) !== i);
  if (dupes.length) {
    console.log(`\n  ⚠ DUPLICATE IMAGE SENT: ${dupes.join(", ")}`);
    problems += dupes.length;
  }
  console.log(`\n  images this run: ${sent.length ? sent.join(", ") : "none"}`);
  return problems;
}

(async () => {
  let problems = 0;

  // The sequence that started all of this: an implant patient must not be
  // shown a Hollywood-smile case.
  problems += await scenario("A. Implant patient — offer, accept, and keep going", [
    "hi, I've lost most of my upper teeth and I'm looking into full mouth dental implants",
    "I'm mainly worried about how it will look",
    "yes",
    "how long does the whole thing take?",
    "ok and what about the cost",
  ]);

  // A direct, unprompted request — the trigger you asked to keep in.
  problems += await scenario("B. Unprompted direct request", [
    "hi there, I'm considering dental implants",
    "can I see some before and afters?",
  ]);

  // Nothing should be sent anywhere in this one.
  problems += await scenario("C. A conversation with no request at all", [
    "hi, what are your opening hours?",
    "and where are you based?",
    "ok thanks, I'll have a think about it",
  ]);

  console.log(`\n${"═".repeat(72)}`);
  console.log(problems === 0 ? "No wiring problems detected." : `${problems} PROBLEM(S) — see ⚠ above.`);
  process.exit(problems === 0 ? 0 : 1);
})();

export {};
