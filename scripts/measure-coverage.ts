// Does pre-close coverage fire, and in which languages?
//
//   npx tsx scripts/measure-coverage.ts
//
// Reported from a real conversation: in Arabic the assistant took a name
// and a number and closed WITHOUT asking travel dates or length of stay,
// having itself just explained that the treatment is two visits four
// months apart. The same conversation in English asked both.
//
// Coverage has two halves and both read text:
//   TRIGGER  - is this dimension relevant at all? Read from the material
//              the assistant was given and what it has said, which is OUR
//              OWN output.
//   COVERED  - has the visitor already answered it? Read from theirs.
//
// This reports each half separately, because they fail for different
// reasons and a fix for one does nothing for the other.

import { assessCoverage, isNearingClose } from "../lib/conversation-state";
import { coverageProbes, relevantDimensions } from "../lib/coverage-relevance";
import { generateEmbedding } from "../lib/embeddings";
import { parseEmbedding } from "../lib/vectors";

type Turn = { role: "user" | "assistant"; content: string };
const a = (content: string): Turn => ({ role: "assistant", content });
const u = (content: string): Turn => ({ role: "user", content });

/**
 * The same conversation in six languages: the assistant explains a
 * two-visit treatment, the visitor gives a name and a number, and
 * coverage should stop the close until travel and duration are known.
 */
const CONVERSATIONS: { klass: string; turns: Turn[] }[] = [
  {
    klass: "English",
    turns: [
      u("I'm looking into full mouth dental implants"),
      a("Full mouth implants happen over two visits. The first is 5 days, where we place the implants and fit temporary teeth. Then around four months of healing at home. The second visit is 7 days to fit the final crowns."),
      u("that sounds good, I want to go ahead"),
      a("Wonderful. Our team will take it from here."),
      u("my name is David and my number is +44 7700 900123"),
    ],
  },
  {
    klass: "Arabic",
    turns: [
      u("أفكر في زراعة الأسنان الكاملة"),
      a("الزراعة الكاملة تتم على زيارتين. الزيارة الأولى 5 أيام، نزرع فيها الغرسات ونضع أسناناً مؤقتة. ثم فترة تعافٍ حوالي أربعة أشهر في بلدك. الزيارة الثانية 7 أيام لتركيب التيجان النهائية."),
      u("هذا ممتاز، أريد المتابعة"),
      a("رائع. سيتولى فريقنا الأمر من هنا."),
      u("اسمي خالد ورقمي +90 532 111 2233"),
    ],
  },
  {
    klass: "Russian",
    turns: [
      u("Меня интересует полная имплантация зубов"),
      a("Полная имплантация проходит за два визита. Первый - 5 дней, устанавливаем импланты и временные зубы. Затем около четырёх месяцев заживления дома. Второй визит - 7 дней для установки постоянных коронок."),
      u("это звучит хорошо, я хочу продолжить"),
      a("Отлично. Наша команда возьмёт это на себя."),
      u("меня зовут Иван, мой номер +7 900 123 4567"),
    ],
  },
  {
    klass: "Chinese",
    turns: [
      u("我想了解全口种植牙"),
      a("全口种植分两次就诊。第一次5天，植入种植体并安装临时牙。然后在家愈合约四个月。第二次就诊7天，安装最终牙冠。"),
      u("听起来不错，我想继续"),
      a("太好了。我们的团队会接手。"),
      u("我叫王伟，我的号码是 +86 138 0013 8000"),
    ],
  },
  {
    klass: "Turkish",
    turns: [
      u("Tam ağız implant düşünüyorum"),
      a("Tam ağız implant iki ziyarette tamamlanır. İlki 5 gün, implantları yerleştirip geçici dişleri takıyoruz. Sonra evde yaklaşık dört ay iyileşme. İkinci ziyaret 7 gün, kalıcı kronlar için."),
      u("kulağa iyi geliyor, devam etmek istiyorum"),
      a("Harika. Ekibimiz buradan devralacak."),
      u("adım Mehmet, numaram +90 532 444 5566"),
    ],
  },
  {
    klass: "Spanish",
    turns: [
      u("Estoy considerando implantes dentales completos"),
      a("Los implantes completos se hacen en dos visitas. La primera son 5 días, colocamos los implantes y ponemos dientes provisionales. Luego unos cuatro meses de cicatrización en casa. La segunda visita son 7 días para las coronas definitivas."),
      u("suena bien, quiero seguir adelante"),
      a("Estupendo. Nuestro equipo se encargará a partir de aquí."),
      u("me llamo Carlos, mi número es +34 612 345 678"),
    ],
  },
];

const ENTRIES = [
  {
    title: "How it works",
    content:
      "Full mouth dental implants are done over two visits to Istanbul. First visit 5 days: surgery to place the implants under sedation, with temporary teeth fitted the same day. Four months of healing. Second visit 7 days: the permanent zirconia crowns are fitted. Lifetime guarantee on the implants.",
  },
];

async function main() {
  // The REAL knowledge base with its real vectors, plus the probe
  // vectors, exactly as the route computes them.
  const { supabaseServer } = await import("../lib/supabase-server");
  const slug = process.env.SLUG ?? "test-clinic";
  const { data: tenant } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .single();
  const { data: rows } = await supabaseServer
    .from("knowledge_base")
    .select("title, content, embedding")
    .eq("tenant_id", tenant!.id);

  const realEntries = (rows ?? []).map((r) => ({ title: r.title ?? "", content: r.content }));
  const vectors = (rows ?? []).map((r) => parseEmbedding(r.embedding));

  const probeVectors: Record<string, number[]> = {};
  for (const probe of coverageProbes()) {
    probeVectors[probe.id] = await generateEmbedding(probe.text);
  }
  const relevantFor = relevantDimensions(vectors, probeVectors);

  console.log(`${CONVERSATIONS.length} conversations against ${slug}`);
  console.log(`this business calls for: [${Array.from(relevantFor).join(", ")}]\n`);

  let firing = 0;
  for (const conv of CONVERSATIONS) {
    const nearing = isNearingClose(conv.turns);
    const { gaps } = assessCoverage(conv.turns, realEntries.length ? realEntries : ENTRIES, relevantFor);
    const ids = gaps.map((g) => g.id).join(", ");
    if (nearing && gaps.length > 0) firing++;
    console.log(
      `  ${conv.klass.padEnd(9)} nearingClose=${String(nearing).padEnd(5)}  gaps=${gaps.length}` +
        (ids ? `  [${ids}]` : "") +
        (nearing && gaps.length > 0 ? "   FIRES" : "   silent")
    );
  }

  console.log(`\n  coverage fires in ${firing}/${CONVERSATIONS.length} classes`);
  if (firing < CONVERSATIONS.length) {
    console.log("  Every class describes the SAME two-visit treatment and the same");
    console.log("  missing answers, so any difference here is a language failure.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
