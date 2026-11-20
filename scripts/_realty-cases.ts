// The six smoke conversations for test-realty, the second (non-clinic) test tenant.
//
// Same failure classes and the same turn slots as scripts/_smoke-cases.ts
// (opener, situation, price, process, hesitation at index 4, name,
// number), so every harness that reads a Case reads these unchanged.
// Approved as written in docs/second-test-tenant-proposal-2026-11-19.md.

import type { Case } from "./_smoke-cases";

export const REALTY_SLUG = "test-realty";

export const REALTY_CASES: Case[] = [
  {
    label: "English (Latin baseline)",
    script: "latin",
    turns: [
      "hi, we're looking to buy an apartment in Istanbul",
      "we're relocating from London next year with two kids, so probably 3 bedrooms",
      "what would something like that cost?",
      "how does buying work for a foreigner, step by step?",
      "honestly we need to think about it and talk it over as a family first",
      "Emma",
      "+44 7700 900456",
    ],
    name: "Emma",
    digits: "447700900456",
  },
  {
    label: "Arabic (right-to-left, ؟)",
    script: "arabic",
    turns: [
      "مرحبا، أبحث عن شقة للشراء في إسطنبول",
      "أريد شقة ثلاث غرف قريبة من البحر، للسكن مع عائلتي",
      "كم الأسعار تقريباً؟",
      "ممكن تشرح لي خطوات الشراء للأجانب؟",
      "بصراحة أحتاج أفكر وأتكلم مع زوجتي أولاً",
      "عمر",
      "+966 55 123 4567",
    ],
    name: "عمر",
    digits: "966551234567",
  },
  {
    label: "Russian (Cyrillic)",
    script: "cyrillic",
    turns: [
      "Здравствуйте, хочу купить квартиру в Стамбуле",
      "Ищу двухкомнатную с видом на Босфор, для себя и как инвестицию",
      "Сколько это примерно стоит?",
      "Объясните, пожалуйста, как проходит покупка для иностранца?",
      "Честно говоря, мне нужно подумать и посоветоваться с мужем",
      "Анна",
      "+7 916 123 4567",
    ],
    name: "Анна",
    digits: "79161234567",
  },
  {
    label: "Chinese (no spaces between words)",
    script: "cjk",
    turns: [
      "你好，我想在伊斯坦布尔买房",
      "想买一套两居室，主要是投资，也在考虑入籍",
      "大概多少钱？",
      "外国人买房的流程是怎样的？",
      "说实话我需要考虑一下，还要和太太商量",
      "李明",
      "+86 139 1234 5678",
    ],
    name: "李明",
    digits: "8613912345678",
  },
  {
    label: "Turkish (dotted/dotless i)",
    script: "latin",
    turns: [
      "merhaba, İstanbul'da daire bakıyorum",
      "Almanya'da yaşıyorum, emeklilik için deniz manzaralı bir yer istiyorum",
      "fiyatlar ne kadar?",
      "satın alma süreci nasıl işliyor, adım adım anlatır mısınız?",
      "açıkçası biraz düşünmem ve eşimle konuşmam lazım",
      "Ayşe",
      "+49 151 2345 6789",
    ],
    name: "Ayşe",
    digits: "4915123456789",
  },
  {
    label: "Spanish (¿ inverted punctuation)",
    script: "latin",
    turns: [
      "hola, estoy buscando un piso en Estambul",
      "me mudo por trabajo y busco alquilar algo de dos habitaciones cerca de Levent",
      "¿cuánto cuesta el alquiler?",
      "¿cómo funciona el proceso para alquilar siendo extranjero?",
      "sinceramente necesito pensarlo y hablarlo con mi pareja",
      "Lucía",
      "+34 612 345 678",
    ],
    name: "Lucía",
    digits: "34612345678",
  },
];
