// Labelled cases for the shorten-and-match candidate.
//
// Labelled BEFORE the first run and committed before it, like
// answer-gap-cases.ts: a label chosen after seeing the model's answer is
// a label that agrees with the model.
//
// Each case is a raw customer message and the group it belongs to among
// GROUPS, or null for "must be a new group". The bar for a match is the
// one in the prompt: one written answer fully answers both. Anything
// arguable was left out rather than labelled either way — a case whose
// label is a judgement call measures the labeller.
//
// None of the prompt's own examples appear here. They are deliberately
// from different questions (root canal, hotel breakfast, number of
// visits) so the cases test the rule, not recall of the examples.

/** The dashboard as the model sees it. The first two are live on test-clinic. */
export const GROUPS: { id: string; title: string }[] = [
  { id: "price", title: "How much does it cost?" },
  { id: "steps", title: "What are the steps of the entire process?" },
  { id: "deposit", title: "Do you require a deposit to book?" },
  { id: "hotel", title: "Is the hotel included in the price?" },
  { id: "duration", title: "How long does implant treatment take?" },
  { id: "brand", title: "Which implant brand do you use?" },
  { id: "instalments", title: "Can I pay in instalments?" },
  { id: "failure", title: "What happens if an implant fails?" },
  { id: "price_list", title: "Can you send me your full price list?" },
  { id: "whitening", title: "Do you offer teeth whitening?" },
];

export type MatchCase = {
  question: string;
  /** Which of the six failure classes this exercises. */
  script: "latin" | "arabic" | "cyrillic" | "cjk" | "turkish" | "spanish";
  /** A GROUPS id, or null: must start a new group. */
  expected: string | null;
  /** For a null case, the group it is a near miss of. */
  nearMissOf?: string;
};

export const CASES: MatchCase[] = [
  // ── Same question, should join ─────────────────────────────────────
  // The generic price question, in all six classes. This is the 7x group
  // that grouped correctly live across five languages.
  { question: "give me the price", script: "latin", expected: "price" },
  { question: "كم السعر؟", script: "arabic", expected: "price" },
  { question: "Сколько стоит?", script: "cyrillic", expected: "price" },
  { question: "价格多少", script: "cjk", expected: "price" },
  { question: "fiyat ne kadar", script: "turkish", expected: "price" },
  { question: "¿cuánto cuesta?", script: "spanish", expected: "price" },

  // The live split this whole change is for.
  { question: "what are the detailed steps of the treatment?", script: "latin", expected: "steps" },
  { question: "how does the process work, step by step?", script: "latin", expected: "steps" },
  { question: "ما هي خطوات العملية بالتفصيل", script: "arabic", expected: "steps" },
  { question: "Какие этапы лечения?", script: "cyrillic", expected: "steps" },

  { question: "do I have to pay something upfront to reserve a date?", script: "latin", expected: "deposit" },
  { question: "kapora istiyor musunuz?", script: "turkish", expected: "deposit" },
  { question: "Нужна ли предоплата?", script: "cyrillic", expected: "deposit" },

  { question: "is accommodation included?", script: "latin", expected: "hotel" },
  { question: "هل الفندق مشمول بالسعر", script: "arabic", expected: "hotel" },

  { question: "种植牙要多长时间", script: "cjk", expected: "duration" },

  { question: "¿puedo pagar a plazos?", script: "spanish", expected: "instalments" },
  { question: "do you have a payment plan", script: "latin", expected: "instalments" },

  { question: "what if the implant doesn't take?", script: "latin", expected: "failure" },

  { question: "send me the price list please", script: "latin", expected: "price_list" },
  { question: "أرسل لي قائمة الأسعار", script: "arabic", expected: "price_list" },

  { question: "do you do whitening?", script: "latin", expected: "whitening" },
  { question: "diş beyazlatma yapıyor musunuz?", script: "turkish", expected: "whitening" },

  // ── Near misses, must start a new group ────────────────────────────
  // Every one of these sits next to a group above. A match here is a
  // wrong merge: the question disappears into a line it is not.
  { question: "is the deposit refundable?", script: "latin", expected: null, nearMissOf: "deposit" },
  { question: "depozito iade ediliyor mu?", script: "turkish", expected: null, nearMissOf: "deposit" },
  { question: "can I pay by credit card?", script: "latin", expected: null, nearMissOf: "instalments" },
  { question: "هل يمكن الدفع بالبطاقة؟", script: "arabic", expected: null, nearMissOf: "instalments" },
  { question: "do you accept health insurance?", script: "latin", expected: null, nearMissOf: "instalments" },
  { question: "how many nights in the hotel?", script: "latin", expected: null, nearMissOf: "hotel" },
  { question: "is the airport transfer included?", script: "latin", expected: null, nearMissOf: "hotel" },
  { question: "¿el hotel tiene piscina?", script: "spanish", expected: null, nearMissOf: "hotel" },
  { question: "is the anaesthetic included in the price?", script: "latin", expected: null, nearMissOf: "price" },
  { question: "how much do veneers cost?", script: "latin", expected: null, nearMissOf: "price" },
  { question: "Сколько стоят виниры?", script: "cyrillic", expected: null, nearMissOf: "price" },
  { question: "how much is the whitening?", script: "latin", expected: null, nearMissOf: "whitening" },
  { question: "is the price list in euros or dollars?", script: "latin", expected: null, nearMissOf: "price_list" },
  { question: "which brand are the crowns?", script: "latin", expected: null, nearMissOf: "brand" },
  { question: "how long does the warranty last?", script: "latin", expected: null, nearMissOf: "failure" },
  { question: "how long is the recovery after implants?", script: "latin", expected: null, nearMissOf: "duration" },
  { question: "种植牙后恢复要多久", script: "cjk", expected: null, nearMissOf: "duration" },
  { question: "do you do hair transplants?", script: "latin", expected: null, nearMissOf: "whitening" },
];
