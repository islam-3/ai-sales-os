// A photo must actually arrive. Both routes. Two languages.
//
// The test tenant held 23 knowledge entries and ZERO photos for days,
// so every smoke run reported green on a media path it could not
// exercise. A test that passes on a feature that is not there is worse
// than no test, because it is believed.
//
// So this asserts the thing itself: an image URL comes back from a real
// conversation against the real deployment.
//
// BOTH ROUTES, because they are different code and both have failed:
//   * a DIRECT REQUEST  — "can I see before and afters?"
//   * an ACCEPTED OFFER — the assistant offers, the visitor says yes
//
// And in ARABIC as well as English, because cross-lingual similarity is
// where the numbers are weakest: the same correct match scores 0.55 in
// English and 0.17 in Arabic.

import { say } from "./_chat-client";

export type MediaFailure = { what: string; detail: string };

type Case = {
  klass: string;
  /** Turns that build a real conversation before anything is asked for. */
  warmUp: string[];
  /** An unprompted request to see something. */
  request: string;
  /** A plain yes, for the accepted-offer route. */
  yes: string;
};

const CASES: Case[] = [
  {
    klass: "English",
    warmUp: [
      "hi, I'm looking into full mouth dental implants",
      "I lost most of my upper teeth about five years ago and it has affected my eating and my confidence every day",
      "I have an important event next year and I want to finally fix this properly",
    ],
    request: "can I see before and after photos of implant cases?",
    yes: "yes please",
  },
  {
    klass: "Arabic",
    warmUp: [
      "مرحبا، أفكر في زراعة الأسنان الكاملة",
      "فقدت معظم أسناني العلوية منذ خمس سنوات وأثر ذلك على الأكل وثقتي بنفسي كل يوم",
      "عندي مناسبة مهمة السنة القادمة وأريد أن أصلح هذا الوضع أخيراً",
    ],
    request: "ممكن أشوف صور قبل وبعد لحالات زراعة الأسنان؟",
    yes: "نعم من فضلك",
  },
];

/** The assistant must never claim it cannot send images. */
const FALSE_LIMITATION =
  /can'?t send|cannot send|unable to (send|show)|لا أستطيع إرسال|لا يمكنني إرسال/i;

async function conversation(base: string, turns: string[], log: (s: string) => void) {
  const sessionId = crypto.randomUUID();
  let lastMedia: { url: string } | null = null;
  let sawFalseLimitation = false;

  for (const turn of turns) {
    const { reply, media } = await say(sessionId, turn);
    if (media) lastMedia = media;
    if (FALSE_LIMITATION.test(reply)) sawFalseLimitation = true;
    log(`      ${media ? "[PHOTO] " : ""}${reply.replace(/\s+/g, " ").slice(0, 58)}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { lastMedia, sawFalseLimitation };
}

export async function runMediaChecks(base: string): Promise<MediaFailure[]> {
  const failures: MediaFailure[] = [];
  console.log(`\n── Media (a photo must actually arrive)`);

  for (const c of CASES) {
    // ── Route 1: the visitor asks, unprompted ────────────────────────
    console.log(`   ${c.klass}: direct request`);
    const direct = await conversation(base, [...c.warmUp, c.request], (s) => console.log(s));
    if (!direct.lastMedia) {
      failures.push({
        what: `${c.klass}: no photo for a direct request`,
        detail: `asked "${c.request.slice(0, 44)}" and nothing arrived`,
      });
      console.log(`   ${c.klass}: direct request ✗ NO PHOTO`);
    } else {
      console.log(`   ${c.klass}: direct request ✓`);
    }
    if (direct.sawFalseLimitation) {
      failures.push({ what: `${c.klass}: claimed it cannot send images`, detail: "false, and it reached a real visitor once" });
    }

    // ── Route 2: the assistant offers, the visitor accepts ───────────
    //
    // The warm-up is what earns an offer; the yes then has to resolve to
    // the entry the server wrote down, in a language the old path could
    // not read at all.
    console.log(`   ${c.klass}: accepted offer`);
    const accepted = await conversation(base, [...c.warmUp, c.yes], (s) => console.log(s));
    if (!accepted.lastMedia) {
      failures.push({
        what: `${c.klass}: no photo after accepting an offer`,
        detail: `said "${c.yes}" and nothing arrived`,
      });
      console.log(`   ${c.klass}: accepted offer ✗ NO PHOTO`);
    } else {
      console.log(`   ${c.klass}: accepted offer ✓`);
    }
    if (accepted.sawFalseLimitation) {
      failures.push({ what: `${c.klass}: claimed it cannot send images`, detail: "false, and it reached a real visitor once" });
    }
  }

  return failures;
}
