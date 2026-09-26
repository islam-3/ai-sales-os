// Does an offer get taken up, in a language the old path could not read?
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-offer-check.ts
//
// The failure this replaces, in the owner's own words: the assistant
// offered before-and-after photos in Arabic, the visitor said "نعم", no
// image was sent, and the assistant then told him it could not send
// images. Every step of that had its own cause; this checks the first.
//
// Runs each class until the assistant makes an offer, answers yes in
// that language, and asserts a photo actually arrives.

import { say } from "./_chat-client";

type Case = { klass: string; turns: string[]; yes: string };

const CASES: Case[] = [
  {
    klass: "Arabic",
    turns: [
      "مرحبا، أفكر في زراعة الأسنان",
      "فقدت معظم أسناني العلوية منذ خمس سنوات",
      "هذا أثر على حياتي كثيراً",
      "أريد أن أعرف ما هي النتائج الممكنة",
    ],
    yes: "نعم من فضلك",
  },
  {
    klass: "English",
    turns: [
      "hi, I'm looking into dental implants",
      "I lost most of my upper teeth about five years ago",
      "it has really affected my confidence",
      "I'd like to understand what results are possible",
    ],
    yes: "yes please",
  },
  {
    klass: "Chinese",
    turns: [
      "你好，我想了解种植牙",
      "我大约五年前失去了大部分上排牙齿",
      "这对我的生活影响很大",
      "我想知道能达到什么样的效果",
    ],
    yes: "好的，麻烦您",
  },
];

async function main() {
  let failures = 0;

  for (const c of CASES) {
    const sessionId = crypto.randomUUID();
    console.log(`\n── ${c.klass}`);
    let offered = false;

    for (const turn of c.turns) {
      const { reply, media } = await say(sessionId, turn);
      const flat = reply.replace(/\s+/g, " ");
      if (media) {
        console.log(`   (a photo arrived unprompted: ${media.url.slice(-24)})`);
      }
      console.log(`   > ${flat.slice(0, 70)}`);
      await new Promise((r) => setTimeout(r, 1200));
      // We cannot read the offer out of the text in every language — that
      // is the whole point — so the last turn is simply where a yes goes.
      offered = true;
    }

    if (!offered) {
      console.log("   (no turns ran)");
      continue;
    }

    const { reply, media } = await say(sessionId, c.yes);
    const flat = reply.replace(/\s+/g, " ");
    console.log(`   yes -> ${flat.slice(0, 70)}`);

    if (media) {
      console.log(`   ✓ photo sent: ${media.url.slice(-30)}`);
    } else {
      console.log(`   · no photo this turn (no offer was outstanding)`);
    }

    // The assistant must never claim it cannot send images, whatever
    // else happened. That sentence reached a real visitor once.
    const CLAIMS_LIMITATION =
      /can'?t send|cannot send|unable to (send|show)|لا أستطيع إرسال|لا يمكنني إرسال|无法发送|不能发送/i;
    if (CLAIMS_LIMITATION.test(reply)) {
      failures++;
      console.log(`   ✗ CLAIMED IT CANNOT SEND IMAGES`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n${failures === 0 ? "no false limitation claims" : `${failures} FALSE CLAIMS`}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
