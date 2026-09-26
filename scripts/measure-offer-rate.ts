// How often does the assistant actually offer to show something?
//
//   npx tsx scripts/measure-offer-rate.ts
//
// Deterministic and free: suggestPhotoOffer is a pure function, so this
// walks realistic conversations turn by turn and counts how often an
// offer would be made. No model calls, no production traffic.
//
// It exists because the offer path turned out to be a SILENT VETO on the
// whole photo feature. Acceptance was fixed and proved at 100% across
// six failure classes, and still nothing reached a visitor, because in
// 25 consecutive production sessions no offer was ever made in the first
// place — in any language. A chain is worth measuring at its weakest
// link, not its most recently repaired one.

import { suggestPhotoOffer, type MediaCandidate } from "../lib/chat-media";

const ENTRIES: MediaCandidate[] = [
  {
    id: "e1",
    title: "Before and after gallery",
    content: "Photos of previous full mouth dental implant cases, before and after treatment.",
    category: "Dental treatment",
    media: [{ url: "a", type: "image/jpeg" }],
  },
  {
    id: "e2",
    title: "Implants brand",
    content: "We use Implant Swiss implants, known for Swiss precision and a lifetime guarantee.",
    category: "Dental treatment",
    media: [{ url: "b", type: "image/jpeg" }],
  },
  {
    id: "e3",
    title: "Our clinic",
    content: "Photos of the clinic interior and treatment rooms in Istanbul.",
    category: "About",
    media: [{ url: "c", type: "image/jpeg" }],
  },
];

type Turn = { role: "user" | "assistant"; content: string };

/** A conversation that SHOULD reach a point where offering is natural. */
type Conversation = { klass: string; turns: Turn[] };

const a = (content: string): Turn => ({ role: "assistant", content });
const u = (content: string): Turn => ({ role: "user", content });

const CONVERSATIONS: Conversation[] = [
  {
    klass: "English",
    turns: [
      u("hi, I'm looking into full mouth dental implants"),
      a("Welcome — tell me what's been happening."),
      u("I lost most of my upper teeth about five years ago and it has affected my eating, my speech and honestly my confidence every single day"),
      a("Five years is a long time to manage that. What made you decide to look into it now?"),
      u("I have a wedding next year and I want to finally fix this properly, it has held me back long enough"),
      a("That's a real deadline to work towards."),
      u("yes exactly, I want to know what kind of result is realistic for someone in my situation"),
    ],
  },
  {
    klass: "Arabic",
    turns: [
      u("مرحبا، أفكر في زراعة الأسنان الكاملة"),
      a("أهلاً بك. أخبرني ما الذي حدث."),
      u("فقدت معظم أسناني العلوية منذ خمس سنوات وأثر ذلك على الأكل والكلام وثقتي بنفسي كل يوم"),
      a("خمس سنوات وقت طويل. ما الذي جعلك تفكر في الأمر الآن؟"),
      u("عندي مناسبة عائلية السنة القادمة وأريد أن أصلح هذا الوضع أخيراً، لقد أعاقني بما فيه الكفاية"),
      a("هذا موعد حقيقي نعمل نحوه."),
      u("نعم بالضبط، أريد أن أعرف ما هي النتيجة الواقعية لحالة مثل حالتي"),
    ],
  },
  {
    klass: "Russian",
    turns: [
      u("Здравствуйте, меня интересует полная имплантация зубов"),
      a("Добро пожаловать. Расскажите, что произошло."),
      u("Я потерял большинство верхних зубов около пяти лет назад, и это повлияло на еду, речь и мою уверенность каждый день"),
      a("Пять лет — это немалый срок. Почему вы решили заняться этим сейчас?"),
      u("У меня в следующем году важное событие, и я хочу наконец решить эту проблему, она слишком долго меня сдерживала"),
      a("Это реальный срок, к которому можно идти."),
      u("да, именно, я хочу понять какой результат реален в моей ситуации"),
    ],
  },
  {
    klass: "Chinese",
    turns: [
      u("你好，我想了解全口种植牙"),
      a("欢迎。请告诉我您的情况。"),
      u("我大约五年前失去了大部分上排牙齿，这影响了我的饮食、说话，还有每天的自信心"),
      a("五年确实不短。是什么让您现在决定处理这件事？"),
      u("明年有一个重要的家庭活动，我想终于把这个问题解决掉，它困扰我太久了"),
      a("这是一个明确的时间目标。"),
      u("对，我想知道像我这种情况能达到什么样的实际效果"),
    ],
  },
  {
    klass: "Turkish",
    turns: [
      u("Merhaba, tam ağız implant düşünüyorum"),
      a("Hoş geldiniz. Neler olduğunu anlatır mısınız?"),
      u("Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim ve bu yemek yememi, konuşmamı ve her gün özgüvenimi etkiledi"),
      a("Beş yıl uzun bir süre. Neden şimdi ilgilenmeye karar verdiniz?"),
      u("Gelecek yıl önemli bir etkinliğim var ve bunu artık kalıcı olarak çözmek istiyorum, beni yeterince engelledi"),
      a("Bu gerçek bir hedef tarih."),
      u("evet aynen, benim durumumda gerçekçi olarak nasıl bir sonuç alınabilir bilmek istiyorum"),
    ],
  },
  {
    klass: "Spanish",
    turns: [
      u("Hola, estoy considerando implantes dentales completos"),
      a("Bienvenido. Cuénteme qué ha pasado."),
      u("Perdí la mayoría de mis dientes superiores hace unos cinco años y ha afectado mi alimentación, mi habla y mi confianza cada día"),
      a("Cinco años es mucho tiempo. ¿Qué le ha hecho decidirse ahora?"),
      u("Tengo un evento importante el año que viene y quiero resolverlo por fin, me ha limitado demasiado"),
      a("Es una fecha real hacia la que trabajar."),
      u("sí exacto, quiero saber qué resultado es realista para alguien en mi situación"),
    ],
  },
];

function main() {
  console.log(`${CONVERSATIONS.length} conversations, offers counted at every assistant turn\n`);

  let totalPoints = 0;
  let totalOffers = 0;
  const byClass: { klass: string; points: number; offers: number; first: string | null }[] = [];

  for (const conv of CONVERSATIONS) {
    let points = 0;
    let offers = 0;
    let first: string | null = null;

    // Walk the conversation, asking at each point where a reply would be
    // written whether an offer would be made.
    for (let i = 1; i <= conv.turns.length; i++) {
      const history = conv.turns.slice(0, i);
      if (history[history.length - 1].role !== "user") continue;
      points++;
      const offer = suggestPhotoOffer(history, ENTRIES, new Set());
      if (offer) {
        offers++;
        if (!first) first = `turn ${points}: "${offer.title}"${offer.entryId ? ` (${offer.entryId})` : ""}`;
      }
    }

    byClass.push({ klass: conv.klass, points, offers, first });
    totalPoints += points;
    totalOffers += offers;
  }

  byClass.forEach((r) => {
    const rate = r.points ? Math.round((r.offers / r.points) * 100) : 0;
    console.log(
      `  ${r.klass.padEnd(9)} ${r.offers}/${r.points} opportunities  ${String(rate).padStart(3)}%` +
        (r.first ? `   first at ${r.first}` : "")
    );
  });

  const rate = totalPoints ? Math.round((totalOffers / totalPoints) * 100) : 0;
  console.log(`\n  TOTAL    ${totalOffers}/${totalPoints} opportunities  ${rate}%`);
  console.log(
    totalOffers === 0
      ? "\n  Not rare — never. The photo feature cannot reach a visitor at all."
      : ""
  );
}

main();
