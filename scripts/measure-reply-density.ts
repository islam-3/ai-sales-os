// How much does one reply ask the reader to absorb, and in what dialect?
//
//   LABEL=before BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/measure-reply-density.ts
//
// Two polish problems from a live Arabic test, measured together because
// they come from the same conversation and the same turns provoke both.
//
// DENSITY   One reply carried the implant brand, the crown brand, both
//           warranties, all three treatment stages and a question. On a
//           phone, to someone nervous about a decision costing
//           thousands, that is a wall rather than an answer.
//
// DIALECT   The visitor wrote Modern Standard Arabic and the assistant
//           replied in a Levantine/MSA mix — "هلق", "بنتصل", "ما بتوصل".
//           A Gulf or North African patient notices immediately, and it
//           is not a dialect the visitor had used.
//
// The conversation is identical in all six failure classes and the turns
// are chosen to provoke a dump: ask what the whole process is, then ask
// what brands are used. Those are the two questions a catalogue answers
// by emptying itself.
//
// Dialect is judged by a model, because no regex knows that "هلق" is
// Levantine for "الآن". The judge is asked the narrow question — did the
// REPLY use a regional variety the VISITOR did not — rather than "what
// dialect is this", because the second has no stable answer and the
// first is the actual requirement.

import { say } from "./_chat-client";
import { anthropic } from "../lib/anthropic";
import { judgeDialect } from "../lib/dialect-judge";
import { replyDensity, isOverloaded, DENSITY_MAX_UNITS, DENSITY_MAX_BLOCKS } from "../lib/reply-density";

const LABEL = process.env.LABEL ?? "run";
const JUDGE = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";

type Case = {
  klass: string;
  /** How the visitor writes, named for the judge. */
  variety: string;
  turns: string[];
};

/**
 * Deliberately written in ONE variety each, and said so.
 *
 * The Arabic is Modern Standard throughout — no "هلق", no "شو", no
 * "بدي" — because the complaint is that the assistant introduced a
 * dialect the visitor had not. The Spanish is European ("vosotros"
 * register, "vale"), so a reply in Latin American Spanish is a mismatch
 * the judge should catch.
 */
const CASES: Case[] = [
  {
    klass: "English",
    variety: "British English",
    turns: [
      "Hello, I'm interested in full mouth dental implants",
      "I lost most of my upper teeth about five years ago",
      "Could you explain the whole treatment process to me?",
      "Which implant and crown brands do you use, and what guarantee comes with them?",
      "That sounds good. I could come in March and stay about ten days.",
      "My name is David and my number is +44 7700 900123",
      "I have no health conditions. Is there anything else you need from me?",
    ],
  },
  {
    klass: "Arabic",
    variety: "Modern Standard Arabic (fusha), with no regional dialect",
    turns: [
      "مرحباً، أرغب في الاستفسار عن زراعة الأسنان الكاملة",
      "فقدت معظم أسناني العلوية منذ خمس سنوات تقريباً",
      "هل يمكنكم أن توضحوا لي مراحل العلاج كاملة؟",
      "ما هي أنواع الغرسات والتيجان التي تستخدمونها، وما الضمان المرافق لها؟",
      "هذا جيد. أستطيع القدوم في شهر مارس والبقاء عشرة أيام تقريباً.",
      "اسمي خالد ورقمي +966 50 123 4567",
      "لا أعاني من أي أمراض. هل تحتاجون شيئاً آخر مني؟",
    ],
  },
  {
    klass: "Russian",
    variety: "standard Russian",
    turns: [
      "Здравствуйте, меня интересует полная имплантация зубов",
      "Я потерял большинство верхних зубов около пяти лет назад",
      "Не могли бы вы объяснить весь процесс лечения?",
      "Какие импланты и коронки вы используете, и какая на них гарантия?",
      "Это подходит. Я могу приехать в марте и остаться примерно на десять дней.",
      "Меня зовут Иван, мой номер +7 900 123 4567",
      "Хронических заболеваний у меня нет. Нужно ли вам что-то ещё?",
    ],
  },
  {
    klass: "Chinese",
    variety: "Mainland Simplified Chinese",
    turns: [
      "您好，我想了解全口种植牙",
      "我大约五年前失去了大部分上排牙齿",
      "能否说明一下整个治疗过程？",
      "你们用的种植体和牙冠是什么品牌，质保是怎样的？",
      "这个安排不错。我三月可以来，待十天左右。",
      "我叫王伟，我的号码是 +86 138 0013 8000",
      "我没有慢性病。还需要我提供什么吗？",
    ],
  },
  {
    klass: "Turkish",
    variety: "standard Istanbul Turkish",
    turns: [
      "Merhaba, tam ağız implant tedavisi hakkında bilgi almak istiyorum",
      "Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim",
      "Tedavi sürecinin tamamını açıklayabilir misiniz?",
      "Hangi implant ve kron markalarını kullanıyorsunuz, garantisi nasıl?",
      "Bu bana uygun. Mart ayında gelip on gün kadar kalabilirim.",
      "Adım Mehmet, numaram +49 170 1234567",
      "Kronik bir rahatsızlığım yok. Başka bir şeye ihtiyacınız var mı?",
    ],
  },
  {
    klass: "Spanish",
    variety: "European (peninsular) Spanish",
    turns: [
      "Buenos días, me interesa un tratamiento de implantes dentales completo",
      "Perdí la mayoría de mis dientes superiores hace unos cinco años",
      "¿Podríais explicarme todo el proceso del tratamiento?",
      "¿Qué marcas de implantes y coronas utilizáis, y qué garantía tienen?",
      "Me parece bien. Podría ir en marzo y quedarme unos diez días.",
      "Me llamo Carlos, mi número es +34 612 345 678",
      "No tengo ninguna enfermedad. ¿Necesitáis algo más de mí?",
    ],
  },
];

async function main() {
  // ONLY narrows to one class and RUNS repeats it. Dialect drift is
  // intermittent — it was reported from a real conversation and did not
  // appear in the first 30 judged replies — so chasing it needs many
  // samples of one class rather than one sample of many.
  const only = (process.env.ONLY ?? "").trim().toLowerCase();
  const runs = Number(process.env.RUNS ?? 1);
  const selected = only ? CASES.filter((c) => c.klass.toLowerCase().includes(only)) : CASES;
  if (selected.length === 0) throw new Error(`no class matches ONLY="${only}"`);
  const plan = Array.from({ length: runs }, () => selected).flat();

  console.log(`[${LABEL}] ${selected.length} class(es) x ${runs} run(s), ${CASES[0].turns.length} turns each`);
  console.log(`density bar: more than ${DENSITY_MAX_UNITS} units is overloaded\n`);

  const allUnits: number[] = [];
  const allBlocks: number[] = [];
  let overloaded = 0;
  let total = 0;
  let dialectMismatches = 0;
  let judgeFailures = 0;
  let judged = 0;

  for (const c of plan) {
    const sessionId = crypto.randomUUID();
    console.log(`── ${c.klass}  (visitor writes ${c.variety})`);

    for (let i = 0; i < c.turns.length; i++) {
      const { reply } = await say(sessionId, c.turns[i]);
      const d = replyDensity(reply);
      allUnits.push(d.units);
      total++;
      const over = isOverloaded(reply);
      allBlocks.push(d.blocks);
      if (over) overloaded++;

      // Only the two substantive turns are judged for dialect: the first
      // two are short acknowledgements with little to go on, and judging
      // them spends calls to learn nothing.
      let dialect = "";
      if (i >= 2) {
        judged++;
        const verdict = await judgeDialect(anthropic, c.variety, reply, JUDGE);
        if (verdict.failed) {
          judgeFailures++;
          dialect = `  judge unreachable: ${verdict.note.slice(0, 50)}`;
        } else if (verdict.introduced) {
          dialectMismatches++;
          dialect = `  DIALECT (${verdict.otherVariety}): ${verdict.markers.slice(0, 4).join(", ")}`;
        } else {
          dialect = "  dialect ok";
        }
      }

      console.log(
        `   turn ${i + 1}: ${String(d.words).padStart(3)}w  ` +
          `${String(d.units).padStart(2)}u (${d.figures}f ${d.names}n) ${String(d.blocks).padStart(2)}b` +
          `${over ? "  OVERLOADED" : "           "}${dialect}`
      );
      await new Promise((r) => setTimeout(r, 1200));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const sorted = [...allUnits].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  [${LABEL}]  ${total} replies`);
  console.log("═".repeat(62));
  const sortedBlocks = [...allBlocks].sort((a, b) => a - b);
  const atB = (p: number) =>
    sortedBlocks[Math.min(sortedBlocks.length - 1, Math.floor((sortedBlocks.length * p) / 100))];
  console.log(`  units per reply   p50 ${at(50)}   p90 ${at(90)}   max ${sorted[sorted.length - 1]}`);
  console.log(`  blocks per reply  p50 ${atB(50)}   p90 ${atB(90)}   max ${sortedBlocks[sortedBlocks.length - 1]}`);
  console.log(`  overloaded        ${overloaded}/${total} replies`);
  console.log(`  dialect mismatch  ${dialectMismatches}/${judged} judged replies`);
  if (judgeFailures > 0) {
    console.log(`  JUDGE FAILED on ${judgeFailures} replies — those are not counted either way`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
