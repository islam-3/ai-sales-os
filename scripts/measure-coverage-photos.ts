// Does the assistant ask to SEE the case before it closes?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-coverage-photos.ts
//
// A live Arabic conversation collected a name, a number, a travel month
// and a length of stay, then closed — having never asked to see
// anything. The visitor had said he has no upper teeth, which sounds
// like there is nothing to photograph, but gum and bone condition is
// exactly what decides whether implants are possible at all.
//
// Four properties, and the last two matter as much as the first:
//
//   FIRES     the gap appears, in all six failure classes, for a
//             business whose own material says it must see the case
//   ONCE      it disappears once the assistant has asked, whether or
//             not the visitor answered — asked twice it is pressure
//   DECLINED  a refusal closes the subject, in every language, so the
//             conversation closes normally
//   QUIET     a business that quotes from a price list never asks
//
// "Ask once, don't nag" is not a prompt instruction here; it is the
// structural property measured below. See the askOnce flag in
// lib/conversation-state.ts.

import { assessCoverage, isNearingClose } from "../lib/conversation-state";
import { readAnsweredDimensions } from "../lib/coverage-answered";
import { coverageProbes, relevantDimensions } from "../lib/coverage-relevance";
import { generateEmbedding } from "../lib/embeddings";
import { parseEmbedding } from "../lib/vectors";

type Turn = { role: "user" | "assistant"; content: string };
const a = (content: string): Turn => ({ role: "assistant", content });
const u = (content: string): Turn => ({ role: "user", content });

/**
 * The conversation that actually happened, in six classes: everything
 * practical is settled and the visitor has given their details.
 *
 * The photos dimension should be the one gap left.
 */
const SETTLED: { klass: string; turns: Turn[]; asked: Turn[]; declined: Turn[] }[] = [
  {
    klass: "English",
    turns: [
      u("I lost all my upper teeth about five years ago, I want implants"),
      a("Full mouth implants happen over two visits, 5 days then 7 days, four months apart."),
      u("I can come in March, stay 10 days, flying from London. No health problems."),
      a("That works well."),
      u("David, +44 7700 900123"),
    ],
    asked: [a("Before the team can plan anything, could you send a photo of your gums, or an X-ray if you have one?")],
    declined: [u("I'd rather not send pictures")],
  },
  {
    klass: "Arabic",
    turns: [
      u("فقدت كل أسناني العلوية منذ خمس سنوات، أريد زراعة"),
      a("الزراعة الكاملة تتم على زيارتين، 5 أيام ثم 7 أيام، بينهما أربعة أشهر."),
      u("أستطيع المجيء في مارس، وأبقى 10 أيام، قادم من الرياض. لا مشاكل صحية."),
      a("هذا مناسب تماماً."),
      u("خالد، +966 50 123 4567"),
    ],
    asked: [a("قبل أن يضع الفريق أي خطة، هل يمكنك إرسال صورة للثة أو أشعة إن كانت متوفرة؟")],
    declined: [u("أفضل عدم إرسال صور")],
  },
  {
    klass: "Russian",
    turns: [
      u("Я потерял все верхние зубы пять лет назад, хочу имплантацию"),
      a("Полная имплантация проходит за два визита, 5 дней и 7 дней, с перерывом четыре месяца."),
      u("Могу приехать в марте, остаться на 10 дней, лечу из Москвы. Со здоровьем всё в порядке."),
      a("Это хорошо подходит."),
      u("Иван, +7 900 123 4567"),
    ],
    asked: [a("Прежде чем команда составит план — могли бы вы прислать фото дёсен или снимок, если он есть?")],
    declined: [u("Я предпочёл бы не присылать фотографии")],
  },
  {
    klass: "Chinese",
    turns: [
      u("我五年前失去了所有上排牙齿，想做种植牙"),
      a("全口种植分两次就诊，第一次5天，第二次7天，间隔约四个月。"),
      u("我三月可以来，能待10天，从北京出发。身体没有问题。"),
      a("这个安排很合适。"),
      u("王伟，+86 138 0013 8000"),
    ],
    asked: [a("在团队制定方案之前，方便发一张牙龈的照片，或者您已有的X光片吗？")],
    declined: [u("我不太想发照片")],
  },
  {
    klass: "Turkish",
    turns: [
      u("Beş yıl önce üst dişlerimin tamamını kaybettim, implant istiyorum"),
      a("Tam ağız implant iki ziyarette tamamlanır, 5 gün ve 7 gün, arada dört ay."),
      u("Mart ayında gelebilirim, 10 gün kalabilirim, Berlin'den uçuyorum. Sağlık sorunum yok."),
      a("Bu çok uygun."),
      u("Mehmet, +49 170 1234567"),
    ],
    asked: [a("Ekip bir plan yapmadan önce, diş etlerinizin bir fotoğrafını ya da varsa röntgeninizi gönderebilir misiniz?")],
    declined: [u("Fotoğraf göndermeyi tercih etmem")],
  },
  {
    klass: "Spanish",
    turns: [
      u("Perdí todos mis dientes superiores hace cinco años, quiero implantes"),
      a("Los implantes completos se hacen en dos visitas, 5 días y 7 días, con cuatro meses entre ellas."),
      u("Puedo ir en marzo, quedarme 10 días, vuelo desde Madrid. No tengo problemas de salud."),
      a("Eso encaja bien."),
      u("Carlos, +34 612 345 678"),
    ],
    asked: [a("Antes de que el equipo prepare un plan, ¿podrías enviar una foto de tus encías, o una radiografía si la tienes?")],
    declined: [u("Preferiría no enviar fotos")],
  },
];

/** A business that quotes from a list and never needs to see anything. */
const PRICE_LIST_BUSINESS = [
  {
    title: "Our prices",
    content:
      "Standard haircut 15 EUR. Beard trim 8 EUR. Both together 20 EUR. No appointment needed, walk in any time between 9am and 7pm. Every price is fixed and shown on the board by the door.",
  },
  {
    title: "How it works",
    content:
      "You walk in, you wait your turn, you sit down. A haircut takes about twenty minutes. We take cash or card.",
  },
];

async function gapsFor(
  turns: Turn[],
  entries: { title: string; content: string }[],
  relevantFor: ReadonlySet<string>
) {
  const answeredFor =
    (await readAnsweredDimensions(
      turns.filter((x) => x.role === "user").map((x) => x.content),
      turns.filter((x) => x.role === "assistant").map((x) => x.content)
    )) ?? undefined;
  const { gaps } = assessCoverage(turns, entries, relevantFor, answeredFor);
  return gaps.map((g) => g.id);
}

async function probesFor(entries: { title: string; content: string }[]) {
  const vectors: (number[] | null)[] = [];
  for (const e of entries) vectors.push(await generateEmbedding(`${e.title}\n${e.content}`));
  const probeVectors: Record<string, number[]> = {};
  for (const probe of coverageProbes()) {
    probeVectors[probe.id] = await generateEmbedding(probe.text);
  }
  return relevantDimensions(vectors, probeVectors);
}

async function main() {
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

  const entries = (rows ?? []).map((r) => ({ title: r.title ?? "", content: r.content }));
  const vectors = (rows ?? []).map((r) => parseEmbedding(r.embedding));
  const probeVectors: Record<string, number[]> = {};
  for (const probe of coverageProbes()) {
    probeVectors[probe.id] = await generateEmbedding(probe.text);
  }
  const relevantFor = relevantDimensions(vectors, probeVectors);

  console.log(`${slug} calls for: [${Array.from(relevantFor).join(", ")}]`);
  console.log(
    relevantFor.has("photos")
      ? "  — it must see the case, so it should ask\n"
      : "  — it does NOT need to see the case; nothing below will fire\n"
  );

  let fires = 0;
  let once = 0;
  let declines = 0;

  for (const c of SETTLED) {
    const nearing = isNearingClose(c.turns);
    const base = await gapsFor(c.turns, entries, relevantFor);
    const afterAsk = await gapsFor([...c.turns, ...c.asked], entries, relevantFor);
    const afterDecline = await gapsFor(
      [...c.turns, ...c.asked, ...c.declined],
      entries,
      relevantFor
    );

    const didFire = nearing && base.includes("photos");
    const askedOnce = !afterAsk.includes("photos");
    const declined = !afterDecline.includes("photos");
    if (didFire) fires++;
    if (askedOnce) once++;
    if (declined) declines++;

    console.log(
      `  ${c.klass.padEnd(9)} fires=${didFire ? "yes" : "NO "}  ` +
        `silent after asking=${askedOnce ? "yes" : "NO "}  ` +
        `silent after refusal=${declined ? "yes" : "NO "}` +
        `   gaps=[${base.join(", ") || "none"}]`
    );
  }

  console.log(`\n  asks before closing in       ${fires}/${SETTLED.length} classes`);
  console.log(`  stops after asking once in   ${once}/${SETTLED.length} classes`);
  console.log(`  accepts a refusal in         ${declines}/${SETTLED.length} classes`);

  // ── And the business that should never ask ─────────────────────────
  console.log(`\n── a business that quotes from a price list ──`);
  const barberRelevant = await probesFor(PRICE_LIST_BUSINESS);
  console.log(`  calls for: [${Array.from(barberRelevant).join(", ") || "nothing"}]`);
  const barberGaps = await gapsFor(
    [
      u("how much for a haircut?"),
      a("A standard haircut is 15 EUR, and you can walk in any time between 9am and 7pm."),
      u("great, I'm Tom, 07700 900123"),
    ],
    PRICE_LIST_BUSINESS,
    barberRelevant
  );
  const quiet = !barberGaps.includes("photos");
  console.log(
    `  ${quiet ? "ok  " : "FAIL"} asks for a photo: ${quiet ? "no" : "YES — it has no reason to"}` +
      `   gaps=[${barberGaps.join(", ") || "none"}]`
  );

  const allGood =
    fires === SETTLED.length && once === SETTLED.length && declines === SETTLED.length && quiet;
  console.log(allGood ? "\nall four properties hold" : "\nSOMETHING IS WRONG — see above");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
