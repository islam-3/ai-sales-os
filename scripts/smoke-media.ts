// A photo must actually arrive. One route, two languages.
//
// The test tenant held 23 knowledge entries and ZERO photos for days,
// so every smoke run reported green on a media path it could not
// exercise. A test that passes on a feature that is not there is worse
// than no test, because it is believed.
//
// So this asserts the thing itself: an image URL comes back from a real
// conversation against the real deployment.
//
// There is ONE route now. The direct-request route was removed after
// every photo bug in end-to-end testing came from it, so asserting it
// here would be asserting a feature that was deliberately deleted.
//
// What remains: the assistant offers, the visitor says yes, a photo
// arrives. Checked in ARABIC as well as English, because cross-lingual
// similarity is where the numbers are weakest - the same correct match
// scores 0.55 in English and 0.17 in Arabic.
//
// The offer itself is confirmed from the DATABASE, not guessed at from
// the reply text. An earlier version said "yes" after a fixed number of
// turns and reported a media failure when no offer had been made - which
// is a different fault entirely, and one this test should name rather
// than disguise.

import { say } from "./_chat-client";

export type MediaFailure = { what: string; detail: string };

type Case = {
  klass: string;
  /** Turns that build a real conversation before anything is asked for. */
  warmUp: string[];
  /** Further turns, if the assistant has not offered yet. */
  extra: string[];
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
    extra: [
      "what sort of results do people usually get?",
      "that is reassuring to hear",
    ],
    yes: "yes please",
  },
  {
    klass: "Arabic",
    warmUp: [
      "مرحبا، أفكر في زراعة الأسنان الكاملة",
      "فقدت معظم أسناني العلوية منذ خمس سنوات وأثر ذلك على الأكل وثقتي بنفسي كل يوم",
      "عندي مناسبة مهمة السنة القادمة وأريد أن أصلح هذا الوضع أخيراً",
    ],
    extra: [
      "ما هي النتائج التي يحصل عليها المرضى عادة؟",
      "هذا مطمئن فعلاً",
    ],
    yes: "نعم من فضلك",
  },
];

/** The assistant must never claim it cannot send images. */
const FALSE_LIMITATION =
  /can'?t send|cannot send|unable to (send|show)|لا أستطيع إرسال|لا يمكنني إرسال/i;

export async function runMediaChecks(base: string): Promise<MediaFailure[]> {
  const failures: MediaFailure[] = [];
  const { supabaseServer } = await import("../lib/supabase-server");
  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", "test-clinic")
    .maybeSingle();

  console.log("\n── Media (a photo must actually arrive)");

  for (const c of CASES) {
    const sessionId = crypto.randomUUID();
    let offered: { title?: string } | null = null;
    let sawFalseLimitation = false;

    // Talk until the assistant offers something, or the turns run out.
    for (const turn of [...c.warmUp, ...c.extra]) {
      const { reply } = await say(sessionId, turn);
      if (FALSE_LIMITATION.test(reply)) sawFalseLimitation = true;
      await new Promise((r) => setTimeout(r, 1200));

      const { data: session } = await supabaseServer
        .from("chat_sessions")
        .select("pending_offer")
        .eq("tenant_id", tenant!.id)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (session?.pending_offer) {
        offered = session.pending_offer as { title?: string };
        break;
      }
    }

    if (!offered) {
      failures.push({
        what: `${c.klass}: no offer was ever made`,
        detail: `${c.warmUp.length + c.extra.length} turns and the assistant never offered to show anything, so acceptance cannot be reached`,
      });
      console.log(`   ${c.klass}: ✗ NO OFFER MADE`);
      continue;
    }
    console.log(`   ${c.klass}: offered "${String(offered.title ?? "?").slice(0, 34)}"`);

    const { reply, media } = await say(sessionId, c.yes);
    if (FALSE_LIMITATION.test(reply)) sawFalseLimitation = true;

    if (media) {
      console.log(`   ${c.klass}: accepted -> photo arrived ✓`);
    } else {
      failures.push({
        what: `${c.klass}: no photo after accepting an offer`,
        detail: `an offer was outstanding, "${c.yes}" was sent, and nothing arrived`,
      });
      console.log(`   ${c.klass}: accepted -> ✗ NO PHOTO`);
    }

    if (sawFalseLimitation) {
      failures.push({
        what: `${c.klass}: claimed it cannot send images`,
        detail: "false, and it reached a real visitor once",
      });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  return failures;
}
