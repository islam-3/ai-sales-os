// What our text-parsing code does to each FAILURE CLASS.
//
//   npx tsx scripts/audit-text-parsing.ts
//
// Not a pass/fail suite — a report. Every rule that inspects the wording
// of a message is a future language bug, and this says which ones are
// already broken and how badly. One representative per class, because
// code breaks by property (script, direction, punctuation, whether words
// are separated by spaces), not by language.

import { contentWords, sentencesOf, shapeOf } from "../lib/conversation-state";
import { enforceSingleQuestion } from "../lib/strip-markup";
import { detectScript } from "../lib/visitor-language";

type Sample = { label: string; text: string; realWords: number; realSentences: number };

// Each text says roughly the same thing and asks one question at the end,
// so the numbers are directly comparable across classes.
const SAMPLES: Sample[] = [
  {
    label: "English (Latin baseline)",
    text:
      "I lost most of my upper teeth about five years ago and it has been affecting my daily life. " +
      "I am considering full implants and want to understand the cost. How long does the whole process take?",
    realWords: 38,
    realSentences: 3,
  },
  {
    label: "Arabic (RTL, ؟)",
    text:
      "فقدت معظم أسناني العلوية قبل خمس سنوات تقريباً وأثر ذلك على حياتي اليومية. " +
      "أفكر في الزراعة الكاملة وأريد أن أفهم التكلفة. كم تستغرق العملية بأكملها؟",
    realWords: 26,
    realSentences: 3,
  },
  {
    label: "Russian (Cyrillic)",
    text:
      "Я потерял большинство верхних зубов около пяти лет назад, и это повлияло на мою повседневную жизнь. " +
      "Я рассматриваю полную имплантацию и хочу понять стоимость. Сколько времени занимает весь процесс?",
    realWords: 28,
    realSentences: 3,
  },
  {
    label: "Chinese (NO spaces, 。？)",
    text:
      "我大约五年前失去了大部分上排牙齿，这影响了我的日常生活。" +
      "我正在考虑全口种植，想了解一下费用。整个过程需要多长时间？",
    realWords: 40,
    realSentences: 3,
  },
  {
    label: "Japanese (NO spaces, 。？)",
    text:
      "五年ほど前に上の歯のほとんどを失い、日常生活に影響が出ています。" +
      "フルインプラントを検討していて、費用を知りたいです。全体でどのくらいかかりますか？",
    realWords: 35,
    realSentences: 3,
  },
  {
    label: "Turkish (dotted/dotless i)",
    text:
      "Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim ve bu günlük hayatımı etkiledi. " +
      "Tam implant düşünüyorum ve maliyeti anlamak istiyorum. Tüm süreç ne kadar sürüyor?",
    realWords: 26,
    realSentences: 3,
  },
  {
    label: "Spanish (¿ inverted)",
    text:
      "Perdí la mayoría de mis dientes superiores hace unos cinco años y ha afectado mi vida diaria. " +
      "Estoy considerando implantes completos y quiero entender el costo. ¿Cuánto tarda todo el proceso?",
    realWords: 32,
    realSentences: 3,
  },
];

const pct = (got: number, real: number) => `${Math.round((got / real) * 100)}%`;

console.log("═".repeat(78));
console.log("TEXT-PARSING AUDIT — one representative per failure class");
console.log("═".repeat(78));

for (const s of SAMPLES) {
  const shape = shapeOf(s.text);
  const words = shape.words;
  const sentences = sentencesOf(s.text);
  const content = contentWords(s.text);
  const single = enforceSingleQuestion(s.text);

  console.log(`\n── ${s.label}`);
  console.log(`   chars ${String(s.text.length).padStart(4)}   script=${detectScript([s.text]) ?? "?"}`);
  console.log(
    `   words counted   : ${String(words).padStart(3)}  (really ~${s.realWords}) → ${pct(words, s.realWords)}` +
      `   band=${shape.length}`
  );
  console.log(
    `   sentences split : ${String(sentences.length).padStart(3)}  (really ${s.realSentences}) → ` +
      (sentences.length === s.realSentences ? "ok" : "WRONG")
  );
  console.log(`   content words   : ${String(content.size).padStart(3)}`);
  console.log(
    `   ends w/ question: ${shape.endsWithQuestion ? "yes" : "NO "}` +
      `   (text ends "${s.text.trim().slice(-1)}")`
  );
  console.log(
    `   single-question : ${single === s.text ? "untouched" : "REWRITTEN"}`
  );
}

console.log(`\n${"═".repeat(78)}`);
console.log("Read the word counts as a ratio, not a number: the length bands, the");
console.log("elaboration threshold and the minimum-entry-words rule are all tuned to");
console.log("English word counts, so a class that counts an order of magnitude low");
console.log("silently takes a different branch on every single turn.");
console.log("═".repeat(78));
