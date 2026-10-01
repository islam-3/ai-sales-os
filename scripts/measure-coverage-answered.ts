// Does coverage notice when the visitor has ALREADY answered?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/measure-coverage-answered.ts
//
// Coverage has two halves. The first - is this dimension relevant to
// this business - is now derived from the tenant's own knowledge base
// and fires in 6 of 6 languages. The second reads the VISITOR's words to
// decide whether they have already said when they can travel, how long
// they can stay, and where they are coming from.
//
// That half is still English regexes, so the prediction is that an
// Arabic visitor who has given their dates will be asked for them again.
// This measures it rather than assuming it.
//
// Each conversation below has the visitor ANSWERING all three. A gap
// reported here is a question the assistant would ask twice.

import { assessCoverage } from "../lib/conversation-state";
import { readAnsweredDimensions } from "../lib/coverage-answered";
import { coverageProbes, relevantDimensions } from "../lib/coverage-relevance";
import { generateEmbedding } from "../lib/embeddings";
import { parseEmbedding } from "../lib/vectors";

type Turn = { role: "user" | "assistant"; content: string };
const a = (content: string): Turn => ({ role: "assistant", content });
const u = (content: string): Turn => ({ role: "user", content });

const EXPLAINED =
  "This happens over two visits. The first is 5 days, the second 7 days, four months apart.";

/** The visitor answers dates, duration and origin in every one of these. */
const CONVERSATIONS: { klass: string; turns: Turn[] }[] = [
  {
    klass: "English",
    turns: [
      u("I'm looking into full mouth dental implants"),
      a(EXPLAINED),
      u("I can come in March, I can stay for 10 days, and I'm flying from London"),
      a("That works well."),
      u("my name is David and my number is +44 7700 900123"),
    ],
  },
  {
    klass: "Arabic",
    turns: [
      u("أفكر في زراعة الأسنان الكاملة"),
      a("العلاج يتم على زيارتين. الأولى 5 أيام والثانية 7 أيام، بينهما أربعة أشهر."),
      u("أستطيع القدوم في شهر مارس، ويمكنني البقاء 10 أيام، وسأسافر من دبي"),
      a("هذا مناسب تماماً."),
      u("اسمي خالد ورقمي +90 532 111 2233"),
    ],
  },
  {
    klass: "Russian",
    turns: [
      u("Меня интересует полная имплантация"),
      a("Лечение проходит за два визита. Первый 5 дней, второй 7 дней, между ними четыре месяца."),
      u("Я могу приехать в марте, могу остаться на 10 дней, прилечу из Москвы"),
      a("Это подходит."),
      u("меня зовут Иван, мой номер +7 900 123 4567"),
    ],
  },
  {
    klass: "Chinese",
    turns: [
      u("我想了解全口种植牙"),
      a("治疗分两次就诊。第一次5天，第二次7天，相隔四个月。"),
      u("我三月份可以来，可以待10天，我从上海飞过去"),
      a("这很合适。"),
      u("我叫王伟，我的号码是 +86 138 0013 8000"),
    ],
  },
  {
    klass: "Turkish",
    turns: [
      u("Tam ağız implant düşünüyorum"),
      a("Tedavi iki ziyarette tamamlanır. İlki 5 gün, ikincisi 7 gün, arada dört ay var."),
      u("Mart ayında gelebilirim, 10 gün kalabilirim, Berlin'den uçacağım"),
      a("Bu çok uygun."),
      u("adım Mehmet, numaram +90 532 444 5566"),
    ],
  },
  {
    klass: "Spanish",
    turns: [
      u("Estoy considerando implantes dentales completos"),
      a("El tratamiento son dos visitas. La primera 5 días, la segunda 7 días, con cuatro meses entre ellas."),
      u("Puedo venir en marzo, puedo quedarme 10 días, y vuelo desde Madrid"),
      a("Eso encaja bien."),
      u("me llamo Carlos, mi número es +34 612 345 678"),
    ],
  },
];

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

  console.log(`the visitor answers dates, duration and origin in every conversation`);
  console.log(`this business calls for: [${Array.from(relevantFor).join(", ")}]\n`);

  let clean = 0;
  for (const conv of CONVERSATIONS) {
    // Exactly what the route does.
    const answeredFor =
      (await readAnsweredDimensions(
        conv.turns.filter((x) => x.role === "user").map((x) => x.content),
        conv.turns.filter((x) => x.role === "assistant").map((x) => x.content)
      )) ?? undefined;
    const { gaps } = assessCoverage(conv.turns, entries, relevantFor, answeredFor);
    // health and photos are not answered in these, so they are expected
    // and excluded. This measures repetition, not completeness.
    const wrongly = gaps.filter((g) => g.id !== "health" && g.id !== "photos");
    if (wrongly.length === 0) clean++;
    console.log(
      `  ${conv.klass.padEnd(9)} asked again: ${wrongly.length}` +
        (wrongly.length ? `  [${wrongly.map((g) => g.id).join(", ")}]` : "   (none)")
    );
  }

  console.log(`\n  ${clean}/${CONVERSATIONS.length} classes do not repeat a question already answered`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
