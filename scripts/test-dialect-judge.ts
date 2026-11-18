// Can the dialect judge actually tell a dialect from a register?
//
//   LIVE=1 DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/test-dialect-judge.ts
//
// ── PAID, despite the name ──────────────────────────────────────────
// Every sample is a Sonnet call: 16 per run. Without LIVE=1 it says so
// and exits without touching the model, because test- scripts are run
// in bulk and assumed free (scripts/test-live-gate.ts enforces that).
// State the cost and get a yes before setting LIVE=1.
//
// scripts/measure-reply-density.ts reports a dialect-mismatch rate, and a
// rate from an unvalidated judge is worse than no rate: it is a number
// that looks like evidence. This is the labelled set the judge has to get
// right before any of its output is quoted.
//
// ── Why the HARD NEGATIVES carry the weight ──────────────────────────
// The first judge passed five blatant samples — "هلق", "منعمللك", "agendar
// la cita" — and was then turned loose on real replies, where it flagged
// "سنة" (the ordinary Arabic word for "year") and "بإمكانك" ("you can",
// plain Modern Standard Arabic) as regional markers. It reported dialect
// drift rising from 3/20 to 5/20 after a change that could not plausibly
// have caused it.
//
// So most of what follows is MSA that merely sounds conversational, and
// plain European Spanish and British English with ordinary politeness in
// them. A judge that cannot leave those alone cannot measure anything.

// ── Which judge ──────────────────────────────────────────────────────
// JUDGE_PROVIDER=openai runs judgeDialectOpenAI (JUDGE_MODEL, default
// gpt-6.1-terra) on the same samples; default is the Sonnet judge.
// RUNS=n repeats the whole set (one pass has hidden flakiness here
// before); every run must be 16/16. MEASURE_ONE=1 makes one call and
// prints its cost, to quote a total from.
//
// The client is loaded inside main(), behind the LIVE gate, so loading
// this file costs nothing.
import { DIALECT_JUDGE_PROMPT, judgeDialect, judgeDialectOpenAI, type DialectVerdict } from "../lib/dialect-judge";
import { calculateCostUsd } from "../lib/ai-pricing";
import { openAIUsageToTokens } from "../lib/reply-openai";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const MSA = "Modern Standard Arabic (fusha), with no regional dialect";
const EURO_ES = "European (peninsular) Spanish";
const BR_EN = "British English";
const CN = "Mainland Simplified Chinese";

type Sample = { label: string; variety: string; reply: string; expect: boolean };

const SAMPLES: Sample[] = [
  // ── Must FIRE: a genuine regional variety the visitor did not use ──
  {
    label: "blatant Levantine to an MSA visitor",
    variety: MSA,
    reply: "هلق بالنسبة للزراعة، منعمللك فحص أول شي وبعدين منشوف شو بدك. بنتصل فيك بكرا.",
    expect: true,
  },
  {
    label: "Levantine negation and future to an MSA visitor",
    variety: MSA,
    reply: "ما بتوصل الرسالة إذا الرقم مو صح. رح نتواصل معك بكرا الصبح.",
    expect: true,
  },
  {
    label: "Gulf to an MSA visitor",
    variety: MSA,
    reply: "وش تحتاج بالضبط؟ عندنا كل شي، وأبشر، نسوي لك الموعد اليوم.",
    expect: true,
  },
  {
    label: "Egyptian to an MSA visitor",
    variety: MSA,
    reply: "ايوه، احنا بنعمل كده عادي. عايز تيجي امتى؟ هنحجزلك على طول.",
    expect: true,
  },
  {
    label: "Latin American Spanish to a European visitor",
    variety: EURO_ES,
    reply: "Claro que sí. Ustedes pueden agendar la cita cuando gusten, y les avisamos por acá.",
    expect: true,
  },
  {
    label: "American English to a British visitor",
    variety: BR_EN,
    reply: "Sure thing! We'll color-match the crowns and the whole program takes two visits.",
    expect: true,
  },

  // ── Must STAY QUIET: the cases the first judge got wrong ───────────
  {
    label: "plain MSA",
    variety: MSA,
    reply: "بالنسبة لزراعة الأسنان، سنجري لك فحصاً أولاً ثم نحدد الخطة المناسبة. سيتواصل معك الفريق غداً.",
    expect: false,
  },
  {
    label: "MSA with بإمكانك — standard, not regional",
    variety: MSA,
    reply: "هل بإمكانك إرسال صورة أشعة؟ بإمكانك أيضاً إرسالها لاحقاً، لا توجد أي عجلة في ذلك.",
    expect: false,
  },
  {
    label: "MSA containing the ordinary word سنة (year)",
    variety: MSA,
    reply: "الضمان مدته خمس عشرة سنة على الغرسات، وسنة واحدة على التيجان المؤقتة.",
    expect: false,
  },
  {
    label: "MSA with لما and تأخذ — ordinary verbs",
    variety: MSA,
    reply: "نظراً لما تتميز به الغرسات السويسرية من جودة، فإنها تدوم طويلاً. وهل تأخذ أدوية بشكل منتظم؟",
    expect: false,
  },
  {
    label: "warm, conversational MSA",
    variety: MSA,
    reply: "خمس سنوات مدة طويلة، ولا شك أن ذلك أثّر على حياتك اليومية. ما الذي دفعك إلى التفكير في العلاج الآن؟",
    expect: false,
  },
  {
    label: "MSA naming a brand and a city in Latin script",
    variety: MSA,
    reply: "نستخدم غرسات Straumann السويسرية في عيادتنا في اسطنبول، وهي من أفضل الأنواع عالمياً.",
    expect: false,
  },
  {
    label: "European Spanish with vosotros",
    variety: EURO_ES,
    reply: "Por supuesto. Podéis pedir cita cuando queráis y os avisamos por aquí. ¿Os parece bien?",
    expect: false,
  },
  {
    label: "European Spanish, warm and informal",
    variety: EURO_ES,
    reply: "Cinco años es mucho tiempo cargando con eso. ¿Qué te ha hecho decidirte ahora?",
    expect: false,
  },
  {
    label: "British English, warm and informal",
    variety: BR_EN,
    reply: "That makes complete sense — it's a big decision. Take your time, and we'll be here.",
    expect: false,
  },
  {
    label: "Mainland Chinese with a Latin brand",
    variety: CN,
    reply: "我们使用瑞士 Straumann 种植体，质保十五年。您方便发一张牙片吗？",
    expect: false,
  },
];

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(
      `(skipped: this asks the model ${SAMPLES.length} questions — set LIVE=1 to run it, after stating the cost)`
    );
    process.exit(0);
  }
  const OPENAI = process.env.JUDGE_PROVIDER === "openai";
  const RUNS = Number(process.env.RUNS ?? 1);
  let cost = 0;
  let judge: (variety: string, reply: string) => Promise<DialectVerdict>;
  if (OPENAI) {
    const { openai } = await import("../lib/openai");
    const model = process.env.JUDGE_MODEL ?? "gpt-6.1-terra";
    // Count what each call costs, without touching the judge itself.
    const counting = {
      responses: {
        create: async (body: any) => {
          const res = await openai.responses.create(body);
          if ((res as any).usage) cost += calculateCostUsd(model, openAIUsageToTokens((res as any).usage));
          return res;
        },
      },
    } as unknown as typeof openai;
    judge = (variety, reply) => judgeDialectOpenAI(counting, variety, reply, model);
    console.log(`judge: ${model} (OpenAI)`);
  } else {
    const { anthropic } = await import("../lib/anthropic");
    judge = (variety, reply) => judgeDialect(anthropic, variety, reply);
    console.log("judge: Sonnet (Anthropic)");
  }
  if (process.env.MEASURE_ONE === "1") {
    const v = await judge(SAMPLES[6].variety, SAMPLES[6].reply);
    console.log(`one call: $${cost.toFixed(5)}  introduced=${v.introduced}${v.failed ? `  JUDGE ERROR ${v.note}` : ""}`);
    process.exit(0);
  }
  console.log(`${SAMPLES.length} labelled samples x ${RUNS} run(s)\n`);

  const wrong: Sample[] = [];
  const perRun: string[] = [];
  for (let run = 1; run <= RUNS; run++) {
    if (RUNS > 1) console.log(`run ${run}`);
    let right = 0;
    for (const s of SAMPLES) {
      const verdict = await judge(s.variety, s.reply);
      if (verdict.failed) {
        bad++;
        console.log(`FAIL  ${s.label.padEnd(46)} JUDGE ERROR: ${verdict.note.slice(0, 60)}`);
        continue;
      }
      const ok = verdict.introduced === s.expect;
      if (ok) right++; else wrong.push(s);
      check(
        `${s.expect ? "fires" : "quiet"}  ${s.label.padEnd(46)}`,
        ok,
        ok
          ? undefined
          : `got introduced=${verdict.introduced}  markers=[${verdict.markers.join(", ")}]  ${verdict.note}`
      );
    }
    perRun.push(`${right}/${SAMPLES.length}`);
  }
  if (RUNS > 1) console.log(`\n  per run                 ${perRun.join(", ")}`);
  if (OPENAI) console.log(`  cost                    $${cost.toFixed(4)}`);

  // Precision on the negatives is reported separately, because that is
  // the half that actually broke and the half a single aggregate hides.
  const negatives = SAMPLES.filter((s) => !s.expect);
  const falsePositives = wrong.filter((s) => !s.expect).length;
  const positives = SAMPLES.filter((s) => s.expect);
  const misses = wrong.filter((s) => s.expect).length;
  console.log(
    `\n  fires when it should    ${RUNS * positives.length - misses}/${RUNS * positives.length}` +
      `\n  quiet when it should    ${RUNS * negatives.length - falsePositives}/${RUNS * negatives.length}`
  );

  if (bad > 0) {
    console.log(
      `\n${bad} FAILING — do not quote a dialect rate from this judge until they pass.` +
        `\nThe prompt it uses is DIALECT_JUDGE_PROMPT in lib/dialect-judge.ts.`
    );
  } else {
    console.log("\nthe judge can tell a dialect from a register");
  }
  void DIALECT_JUDGE_PROMPT;
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
