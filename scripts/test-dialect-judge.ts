// Can the dialect judge actually tell a dialect from a register?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/test-dialect-judge.ts
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

import { anthropic } from "../lib/anthropic";
import { DIALECT_JUDGE_PROMPT, judgeDialect } from "../lib/dialect-judge";

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
  console.log(`${SAMPLES.length} labelled samples\n`);

  const wrong: Sample[] = [];
  for (const s of SAMPLES) {
    const verdict = await judgeDialect(anthropic, s.variety, s.reply);
    if (verdict.failed) {
      bad++;
      console.log(`FAIL  ${s.label.padEnd(46)} JUDGE ERROR: ${verdict.note.slice(0, 60)}`);
      continue;
    }
    const ok = verdict.introduced === s.expect;
    if (!ok) wrong.push(s);
    check(
      `${s.expect ? "fires" : "quiet"}  ${s.label.padEnd(46)}`,
      ok,
      ok
        ? undefined
        : `got introduced=${verdict.introduced}  markers=[${verdict.markers.join(", ")}]  ${verdict.note}`
    );
  }

  // Precision on the negatives is reported separately, because that is
  // the half that actually broke and the half a single aggregate hides.
  const negatives = SAMPLES.filter((s) => !s.expect);
  const falsePositives = wrong.filter((s) => !s.expect).length;
  const positives = SAMPLES.filter((s) => s.expect);
  const misses = wrong.filter((s) => s.expect).length;
  console.log(
    `\n  fires when it should    ${positives.length - misses}/${positives.length}` +
      `\n  quiet when it should    ${negatives.length - falsePositives}/${negatives.length}`
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
