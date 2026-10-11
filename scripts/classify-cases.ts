// Ground truth for the visitor-signal classifier.
//
// Hand-labelled, one block per FAILURE CLASS rather than per language:
// Latin baseline, right-to-left, Cyrillic, no-spaces-between-words,
// dotted/dotless i, inverted punctuation. What breaks text handling is
// the property, not the border.
//
// Every case carries the assistant's previous turn where one is needed,
// because half of these signals are meaningless without it: "yes" is an
// acceptance only if something was offered, and is otherwise just
// agreement. The regexes being replaced never had that context, which is
// part of why they could not tell the two apart.
//
// The labels are the contract. If one is wrong, the measurement is wrong
// in a way no amount of re-running fixes, so they are deliberately plain
// cases rather than clever ones — a signal that a careful person would
// hesitate over should not be in a ground-truth set at all.

export type Signals = {
  /** Taking up something the assistant just offered to show. */
  accepts_offer: boolean;
  /** Asking, unprompted, to see something. */
  direct_request: boolean;
  /** Stepping back: needs to think, check with someone, not ready. */
  hesitation: boolean;
  /** Frustrated: repeating themselves, or saying they were not answered. */
  impatience: boolean;
  /**
   * Wanting something FROM the business: a price, a detail, examples.
   *
   * ── How these labels were chosen ──────────────────────────────────
   * From the real shapes, not from imagination. prof-clinic's 57
   * visitor messages contain ZERO question marks, and reading them
   * gives the two populations this key has to separate:
   *
   *   asking    "give me the price", "اعطيني صور قبل وبعد",
   *             "dental implants", "زراعة فم كامل، بدي اشوف نتائج"
   *   not       "khaled", "+88888888888", "15 سنه", "2 days", "6",
   *             "yes", "ممتاز", "i am in airport", "eat and smile",
   *             "لا يمكنني الاكل او الضحك"
   *
   * The negatives are the point. Each one that fires becomes a judge
   * call and then a dashboard row reading "yes" or "khaled" under
   * "customers asked — no answer yet", which is the failure that made
   * the previous design unusable, arriving by a different route.
   *
   * Note a bare topic ("dental implants") is labelled TRUE. A visitor
   * typing a service name into a sales chat wants to know about it,
   * and if the business has written nothing about that service it is
   * exactly what the owner needs to see. It costs a judge call on most
   * opening messages, which the cap bounds.
   *
   * It is true ALONGSIDE direct_request for "can I see photos?" —
   * asking to be shown something is asking for something. They are not
   * exclusive and the prompt says so.
   */
  asking_for_information: boolean;
};

export type Case = Signals & {
  /** Which failure class this belongs to. */
  klass: string;
  /** The assistant's previous turn, where the signal depends on it. */
  prior?: string;
  /** What the visitor wrote. */
  text: string;
};

const none = {
  accepts_offer: false,
  direct_request: false,
  hesitation: false,
  impatience: false,
  asking_for_information: false,
};

/** Shorthand for the many cases that are a request and nothing else. */
const asking = { ...none, asking_for_information: true };

const OFFER_EN = "Would you like to see some before-and-after photos of cases like yours?";
const OFFER_AR = "هل تحب أن أريك صوراً قبل وبعد لحالات مشابهة لحالتك؟";
const OFFER_RU = "Хотите, покажу фотографии до и после по похожим случаям?";
const OFFER_ZH = "您想看看类似案例的前后对比照片吗？";
const OFFER_TR = "Benzer vakaların öncesi ve sonrası fotoğraflarını görmek ister misiniz?";
const OFFER_ES = "¿Quieres ver fotos de antes y después de casos como el tuyo?";

/**
 * The offers themselves, so a test can tell "an offer is pending" from
 * "the assistant said something". isAffirmative() is only ever asked the
 * question when one of these is outstanding.
 */
export const OFFERS = [OFFER_EN, OFFER_AR, OFFER_RU, OFFER_ZH, OFFER_TR, OFFER_ES];

export const CASES: Case[] = [
  // ── English (Latin baseline) ────────────────────────────────────────
  { klass: "English", ...none, prior: OFFER_EN, text: "yes please", accepts_offer: true },
  { klass: "English", ...none, prior: OFFER_EN, text: "go on then", accepts_offer: true },
  { klass: "English", ...none, prior: OFFER_EN, text: "no thanks" },
  { klass: "English", ...asking, text: "can I see photos of your work?", direct_request: true },
  { klass: "English", ...asking, text: "do you have pictures of the results?", direct_request: true },
  { klass: "English", ...none, text: "I need to think about it", hesitation: true },
  { klass: "English", ...none, text: "I want to talk to my wife first", hesitation: true },
  // Impatience without a request in it. A complaint about not being
  // answered does not itself say what they want, so there is nothing
  // for a judge to look up.
  { klass: "English", ...none, text: "I already asked you that", impatience: true },
  { klass: "English", ...none, text: "you still haven't answered my question", impatience: true },
  { klass: "English", ...none, text: "I lost my upper teeth about five years ago" },
  { klass: "English", ...asking, text: "how much does it cost?" },
  { klass: "English", ...none, text: "ok" },
  // A question ABOUT photos that is not a request to be shown one: the
  // visitor is the one who would send it. Still asking something the
  // business has to answer, so asking_for_information is true while
  // direct_request is false — the one case that separates them.
  { klass: "English", ...asking, text: "should I send you a photo of my teeth?" },
  { klass: "English", ...none, prior: "What's your name?", text: "yes" },

  // ── Arabic (right-to-left) ──────────────────────────────────────────
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "نعم من فضلك", accepts_offer: true },
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "أكيد، أرني", accepts_offer: true },
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "لا شكراً" },
  { klass: "Arabic", ...asking, text: "ممكن أشوف صور لنتائج سابقة؟", direct_request: true },
  { klass: "Arabic", ...asking, text: "عندكم صور للحالات اللي عملتوها؟", direct_request: true },
  { klass: "Arabic", ...none, text: "أحتاج أفكر في الموضوع", hesitation: true },
  { klass: "Arabic", ...none, text: "لازم أستشير زوجتي أولاً", hesitation: true },
  { klass: "Arabic", ...none, text: "سألتك هذا السؤال من قبل", impatience: true },
  { klass: "Arabic", ...none, text: "أنت لم تجب على سؤالي", impatience: true },
  { klass: "Arabic", ...none, text: "فقدت معظم أسناني العلوية منذ خمس سنوات" },
  { klass: "Arabic", ...asking, text: "كم التكلفة؟" },
  { klass: "Arabic", ...none, prior: "ما اسمك الكريم؟", text: "نعم" },

  // ── Russian (Cyrillic) ──────────────────────────────────────────────
  { klass: "Russian", ...none, prior: OFFER_RU, text: "да, покажите", accepts_offer: true },
  { klass: "Russian", ...none, prior: OFFER_RU, text: "давайте", accepts_offer: true },
  { klass: "Russian", ...none, prior: OFFER_RU, text: "нет, спасибо" },
  { klass: "Russian", ...asking, text: "можно посмотреть фото ваших работ?", direct_request: true },
  { klass: "Russian", ...asking, text: "у вас есть снимки результатов?", direct_request: true },
  { klass: "Russian", ...none, text: "мне нужно подумать", hesitation: true },
  { klass: "Russian", ...none, text: "сначала обсужу с женой", hesitation: true },
  { klass: "Russian", ...none, text: "я уже об этом спрашивал", impatience: true },
  { klass: "Russian", ...none, text: "вы так и не ответили на мой вопрос", impatience: true },
  { klass: "Russian", ...none, text: "я потерял большинство верхних зубов пять лет назад" },
  { klass: "Russian", ...asking, text: "сколько это стоит?" },

  // ── Chinese (no spaces between words) ───────────────────────────────
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "好的，麻烦您", accepts_offer: true },
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "想看", accepts_offer: true },
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "不用了，谢谢" },
  { klass: "Chinese", ...asking, text: "可以看看你们做过的案例照片吗？", direct_request: true },
  { klass: "Chinese", ...asking, text: "有没有效果图？", direct_request: true },
  { klass: "Chinese", ...none, text: "我需要再考虑一下", hesitation: true },
  { klass: "Chinese", ...none, text: "我想先和家人商量", hesitation: true },
  { klass: "Chinese", ...none, text: "这个问题我已经问过了", impatience: true },
  { klass: "Chinese", ...none, text: "你还没有回答我的问题", impatience: true },
  { klass: "Chinese", ...none, text: "我大约五年前失去了大部分上排牙齿" },
  { klass: "Chinese", ...asking, text: "费用是多少？" },

  // ── Turkish (dotted/dotless i) ──────────────────────────────────────
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "evet, lütfen", accepts_offer: true },
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "olur, görmek isterim", accepts_offer: true },
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "hayır, teşekkürler" },
  { klass: "Turkish", ...asking, text: "yaptığınız işlerin fotoğraflarını görebilir miyim?", direct_request: true },
  { klass: "Turkish", ...asking, text: "sonuç fotoğrafınız var mı?", direct_request: true },
  { klass: "Turkish", ...none, text: "biraz düşünmem gerek", hesitation: true },
  { klass: "Turkish", ...none, text: "önce eşimle konuşayım", hesitation: true },
  { klass: "Turkish", ...none, text: "bunu zaten sormuştum", impatience: true },
  { klass: "Turkish", ...none, text: "sorumu hâlâ cevaplamadınız", impatience: true },
  { klass: "Turkish", ...none, text: "beş yıl önce üst dişlerimin çoğunu kaybettim" },
  { klass: "Turkish", ...asking, text: "fiyat ne kadar?" },

  // ── Spanish (inverted punctuation) ──────────────────────────────────
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "sí, por favor", accepts_offer: true },
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "vale, enséñamelas", accepts_offer: true },
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "no, gracias" },
  { klass: "Spanish", ...asking, text: "¿puedo ver fotos de vuestros trabajos?", direct_request: true },
  { klass: "Spanish", ...asking, text: "¿tenéis imágenes de resultados?", direct_request: true },
  { klass: "Spanish", ...none, text: "necesito pensarlo", hesitation: true },
  { klass: "Spanish", ...none, text: "primero quiero hablarlo con mi mujer", hesitation: true },
  { klass: "Spanish", ...none, text: "ya te pregunté eso", impatience: true },
  { klass: "Spanish", ...none, text: "todavía no has respondido a mi pregunta", impatience: true },
  { klass: "Spanish", ...none, text: "perdí la mayoría de mis dientes superiores hace cinco años" },
  { klass: "Spanish", ...asking, text: "¿cuánto cuesta?" },

  // ════════════════════════════════════════════════════════════════════
  //  The real shapes, for asking_for_information
  // ════════════════════════════════════════════════════════════════════
  //
  // Every case above was written for a classifier whose job was photos
  // and mood, so almost all of them are well-formed sentences ending in
  // a question mark. Real traffic is not like that. prof-clinic's 57
  // visitor messages contain ZERO question marks and 82% of them are
  // three words or fewer.
  //
  // These are modelled directly on what is in that table — the
  // imperative, the bare topic, the one-word answer, the name, the
  // number, the duration — and carried across all six failure classes.
  // Written and committed BEFORE the prompt was measured against them.
  //
  // The negatives matter more than the positives here. A false positive
  // is a judge call AND a dashboard row reading "khaled" under
  // "customers asked — no answer yet".

  // ── Imperatives: a request with no question form at all ─────────────
  { klass: "English", ...asking, text: "give me the price" },
  { klass: "Arabic", ...asking, text: "اعطيني السعر" },
  { klass: "Russian", ...asking, text: "назовите цену" },
  { klass: "Chinese", ...asking, text: "告诉我价格" },
  { klass: "Turkish", ...asking, text: "fiyatı söyleyin" },
  { klass: "Spanish", ...asking, text: "dame el precio" },

  // ── Imperative asking to be shown — also direct_request ─────────────
  { klass: "English", ...asking, text: "send me before and after photos", direct_request: true },
  { klass: "Arabic", ...asking, text: "اعطيني صور قبل وبعد", direct_request: true },
  { klass: "Russian", ...asking, text: "пришлите фото до и после", direct_request: true },
  { klass: "Chinese", ...asking, text: "发给我前后对比照片", direct_request: true },
  { klass: "Turkish", ...asking, text: "bana öncesi sonrası fotoğraf gönderin", direct_request: true },
  { klass: "Spanish", ...asking, text: "mándame fotos de antes y después", direct_request: true },

  // ── A bare topic, typed as an opening message ───────────────────────
  // Labelled TRUE. Someone typing a service name into a sales chat
  // wants to know about that service, and if the business has written
  // nothing about it that is precisely what the owner needs to see.
  { klass: "English", ...asking, text: "dental implants" },
  { klass: "Arabic", ...asking, text: "زراعة اسنان" },
  { klass: "Russian", ...asking, text: "имплантация зубов" },
  { klass: "Chinese", ...asking, text: "种植牙" },
  { klass: "Turkish", ...asking, text: "diş implantı" },
  { klass: "Spanish", ...asking, text: "implantes dentales" },

  // ── A want, stated rather than asked ────────────────────────────────
  { klass: "English", ...asking, text: "I want to see results from previous patients", direct_request: true },
  { klass: "Arabic", ...asking, text: "بدي اشوف نتائج مرضى سابقين", direct_request: true },
  { klass: "Russian", ...asking, text: "хочу увидеть результаты прошлых пациентов", direct_request: true },
  { klass: "Chinese", ...asking, text: "我想看以前患者的效果", direct_request: true },
  { klass: "Turkish", ...asking, text: "önceki hastaların sonuçlarını görmek istiyorum", direct_request: true },
  { klass: "Spanish", ...asking, text: "quiero ver resultados de pacientes anteriores", direct_request: true },

  // ── NEGATIVE: a duration, answering the assistant ───────────────────
  { klass: "English", ...none, prior: "How long ago did you lose them?", text: "15 years" },
  { klass: "Arabic", ...none, prior: "منذ متى فقدتها؟", text: "15 سنه" },
  { klass: "Russian", ...none, prior: "Как давно вы их потеряли?", text: "15 лет" },
  { klass: "Chinese", ...none, prior: "您是多久以前失去的？", text: "15年" },
  { klass: "Turkish", ...none, prior: "Ne zaman kaybettiniz?", text: "15 yıl" },
  { klass: "Spanish", ...none, prior: "¿Hace cuánto los perdiste?", text: "hace 15 años" },

  // ── NEGATIVE: a name ────────────────────────────────────────────────
  { klass: "English", ...none, prior: "What's your name?", text: "David" },
  { klass: "Arabic", ...none, prior: "ما اسمك الكريم؟", text: "خالد" },
  { klass: "Russian", ...none, prior: "Как вас зовут?", text: "Дмитрий" },
  { klass: "Chinese", ...none, prior: "请问您怎么称呼？", text: "王伟" },
  { klass: "Turkish", ...none, prior: "Adınız nedir?", text: "Mehmet" },
  { klass: "Spanish", ...none, prior: "¿Cómo te llamas?", text: "Carlos" },

  // ── NEGATIVE: a phone number ────────────────────────────────────────
  // Script-neutral, so two classes is enough to cover it.
  { klass: "English", ...none, prior: "What's the best number to reach you on?", text: "+44 7700 900123" },
  { klass: "Arabic", ...none, prior: "ما هو أفضل رقم للتواصل معك؟", text: "+90 532 111 2233" },

  // ── NEGATIVE: describing their own situation ────────────────────────
  { klass: "English", ...none, text: "I can't eat or laugh" },
  { klass: "Arabic", ...none, text: "لا يمكنني الاكل او الضحك" },
  { klass: "Russian", ...none, text: "я не могу ни есть, ни смеяться" },
  { klass: "Chinese", ...none, text: "我没法吃东西也不能笑" },
  { klass: "Turkish", ...none, text: "yemek yiyemiyorum ve gülemiyorum" },
  { klass: "Spanish", ...none, text: "no puedo comer ni reír" },

  // ── NEGATIVE: a bare answer to what the assistant asked ─────────────
  { klass: "English", ...none, prior: "What would you most like to get back?", text: "eat and smile" },
  { klass: "Arabic", ...none, prior: "ما الذي تتمنى استعادته أكثر؟", text: "الاكل والضحك" },
  { klass: "Turkish", ...none, prior: "En çok neyi geri istersiniz?", text: "yemek ve gülmek" },

  // ── NEGATIVE: approval, and a bare yes with no offer pending ────────
  { klass: "Arabic", ...none, text: "ممتاز" },
  { klass: "English", ...none, prior: "Shall I take your number?", text: "yes" },
  { klass: "Chinese", ...none, text: "好的" },
];

export const SIGNAL_KEYS = [
  "accepts_offer",
  "direct_request",
  "hesitation",
  "impatience",
  "asking_for_information",
] as const satisfies readonly (keyof Signals)[];

/**
 * The cases that predate asking_for_information.
 *
 * The before/after on the four original keys is reported on THIS subset
 * as well as on everything, because the new cases are deliberately
 * unlike the old ones — fragments, names, numbers — and a four-key
 * score that moved could otherwise be the new cases rather than the new
 * key. Same cases, same labels, two prompts, one run.
 */
export const ORIGINAL_CASE_COUNT = 71;
