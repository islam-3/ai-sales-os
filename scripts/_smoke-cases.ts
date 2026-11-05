// The six smoke-test conversations, one per failure class.
//
// Shared by scripts/smoke-test.ts and scripts/measure-reply-provider.ts,
// so the provider experiment runs exactly the conversations the smoke
// test does. See smoke-test.ts for why each turn is there.

import type { VisitorScript } from "../lib/visitor-language";

export type Case = {
  label: string;
  script: VisitorScript;
  turns: string[];
  name: string;
  digits: string;
};

/**
 * The turn where the visitor steps back, zero-indexed.
 *
 * This slot used to hold a bare "yes please", left over from accepting a
 * photo offer. With image sending gone it accepted nothing, landed on no
 * behaviour at all, and still reported ok every run - a turn that tests
 * nothing while appearing to pass is precisely how the empty test tenant
 * went unnoticed for days.
 *
 * Hesitation replaces it because it is the ONLY thing the classifier
 * still decides. The keyword lists it replaced scored zero recall on
 * every non-English class, so "someone said they need to think about it,
 * in Chinese" is exactly the case that used to be invisible, and nothing
 * checks it against the real deployment.
 */
export const HESITATION_TURN = 4;

export const CASES: Case[] = [
  {
    label: "English (Latin baseline)",
    script: "latin",
    turns: [
      "hi, I'm looking into full dental implants",
      "I lost most of my upper teeth about five years ago",
      "how much does it cost?",
      "can you walk me through the steps of the whole process?",
      "honestly I need to think about it and talk to my wife first",
      "David",
      "+44 7700 900123",
    ],
    name: "David",
    digits: "447700900123",
  },
  {
    label: "Arabic (right-to-left, ؟)",
    script: "arabic",
    turns: [
      "مرحبا، أفكر في زراعة الأسنان",
      "فقدت معظم أسناني العلوية منذ خمس سنوات",
      "كم التكلفة؟",
      "ممكن تشرح لي خطوات العلاج بالتفصيل؟",
      "بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً",
      "خالد",
      "+90 532 111 2233",
    ],
    name: "خالد",
    digits: "905321112233",
  },
  {
    label: "Russian (Cyrillic)",
    script: "cyrillic",
    turns: [
      "Здравствуйте, меня интересует имплантация зубов",
      "Я потерял большинство верхних зубов около пяти лет назад",
      "Сколько это стоит?",
      "Расскажите, пожалуйста, по шагам, как проходит весь процесс?",
      "честно говоря, мне нужно подумать и обсудить с женой",
      "Иван",
      "+7 900 123 4567",
    ],
    name: "Иван",
    digits: "79001234567",
  },
  {
    label: "Chinese (no spaces between words)",
    script: "cjk",
    turns: [
      "你好，我想了解种植牙",
      "我大约五年前失去了大部分上排牙齿",
      "费用是多少？",
      "能详细说明一下整个治疗的步骤吗？",
      "说实话我需要考虑一下，还要和我太太商量",
      "王伟",
      "+86 138 0013 8000",
    ],
    name: "王伟",
    digits: "8613800138000",
  },
  {
    label: "Turkish (dotted/dotless i)",
    script: "latin",
    turns: [
      "Merhaba, implant tedavisi düşünüyorum",
      "Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim",
      "Fiyat ne kadar?",
      "Tüm sürecin adımlarını tek tek anlatır mısınız?",
      "dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım",
      "Mehmet",
      "+90 532 444 5566",
    ],
    name: "Mehmet",
    digits: "905324445566",
  },
  {
    label: "Spanish (¿ inverted punctuation)",
    script: "latin",
    turns: [
      "Hola, estoy considerando implantes dentales",
      "Perdí la mayoría de mis dientes superiores hace cinco años",
      "¿Cuánto cuesta?",
      "¿Me explicas paso a paso todo el proceso?",
      "sinceramente necesito pensarlo y hablarlo con mi mujer",
      "Carlos",
      "+34 612 345 678",
    ],
    name: "Carlos",
    digits: "34612345678",
  },
];
