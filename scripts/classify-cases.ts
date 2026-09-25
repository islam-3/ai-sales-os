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
};

export type Case = Signals & {
  /** Which failure class this belongs to. */
  klass: string;
  /** The assistant's previous turn, where the signal depends on it. */
  prior?: string;
  /** What the visitor wrote. */
  text: string;
};

const none = { accepts_offer: false, direct_request: false, hesitation: false, impatience: false };

const OFFER_EN = "Would you like to see some before-and-after photos of cases like yours?";
const OFFER_AR = "هل تحب أن أريك صوراً قبل وبعد لحالات مشابهة لحالتك؟";
const OFFER_RU = "Хотите, покажу фотографии до и после по похожим случаям?";
const OFFER_ZH = "您想看看类似案例的前后对比照片吗？";
const OFFER_TR = "Benzer vakaların öncesi ve sonrası fotoğraflarını görmek ister misiniz?";
const OFFER_ES = "¿Quieres ver fotos de antes y después de casos como el tuyo?";

export const CASES: Case[] = [
  // ── English (Latin baseline) ────────────────────────────────────────
  { klass: "English", ...none, prior: OFFER_EN, text: "yes please", accepts_offer: true },
  { klass: "English", ...none, prior: OFFER_EN, text: "go on then", accepts_offer: true },
  { klass: "English", ...none, prior: OFFER_EN, text: "no thanks" },
  { klass: "English", ...none, text: "can I see photos of your work?", direct_request: true },
  { klass: "English", ...none, text: "do you have pictures of the results?", direct_request: true },
  { klass: "English", ...none, text: "I need to think about it", hesitation: true },
  { klass: "English", ...none, text: "I want to talk to my wife first", hesitation: true },
  { klass: "English", ...none, text: "I already asked you that", impatience: true },
  { klass: "English", ...none, text: "you still haven't answered my question", impatience: true },
  { klass: "English", ...none, text: "I lost my upper teeth about five years ago" },
  { klass: "English", ...none, text: "how much does it cost?" },
  { klass: "English", ...none, text: "ok" },
  // A question ABOUT photos that is not a request to be shown one: the
  // visitor is the one who would send it.
  { klass: "English", ...none, text: "should I send you a photo of my teeth?" },
  { klass: "English", ...none, prior: "What's your name?", text: "yes" },

  // ── Arabic (right-to-left) ──────────────────────────────────────────
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "نعم من فضلك", accepts_offer: true },
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "أكيد، أرني", accepts_offer: true },
  { klass: "Arabic", ...none, prior: OFFER_AR, text: "لا شكراً" },
  { klass: "Arabic", ...none, text: "ممكن أشوف صور لنتائج سابقة؟", direct_request: true },
  { klass: "Arabic", ...none, text: "عندكم صور للحالات اللي عملتوها؟", direct_request: true },
  { klass: "Arabic", ...none, text: "أحتاج أفكر في الموضوع", hesitation: true },
  { klass: "Arabic", ...none, text: "لازم أستشير زوجتي أولاً", hesitation: true },
  { klass: "Arabic", ...none, text: "سألتك هذا السؤال من قبل", impatience: true },
  { klass: "Arabic", ...none, text: "أنت لم تجب على سؤالي", impatience: true },
  { klass: "Arabic", ...none, text: "فقدت معظم أسناني العلوية منذ خمس سنوات" },
  { klass: "Arabic", ...none, text: "كم التكلفة؟" },
  { klass: "Arabic", ...none, prior: "ما اسمك الكريم؟", text: "نعم" },

  // ── Russian (Cyrillic) ──────────────────────────────────────────────
  { klass: "Russian", ...none, prior: OFFER_RU, text: "да, покажите", accepts_offer: true },
  { klass: "Russian", ...none, prior: OFFER_RU, text: "давайте", accepts_offer: true },
  { klass: "Russian", ...none, prior: OFFER_RU, text: "нет, спасибо" },
  { klass: "Russian", ...none, text: "можно посмотреть фото ваших работ?", direct_request: true },
  { klass: "Russian", ...none, text: "у вас есть снимки результатов?", direct_request: true },
  { klass: "Russian", ...none, text: "мне нужно подумать", hesitation: true },
  { klass: "Russian", ...none, text: "сначала обсужу с женой", hesitation: true },
  { klass: "Russian", ...none, text: "я уже об этом спрашивал", impatience: true },
  { klass: "Russian", ...none, text: "вы так и не ответили на мой вопрос", impatience: true },
  { klass: "Russian", ...none, text: "я потерял большинство верхних зубов пять лет назад" },
  { klass: "Russian", ...none, text: "сколько это стоит?" },

  // ── Chinese (no spaces between words) ───────────────────────────────
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "好的，麻烦您", accepts_offer: true },
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "想看", accepts_offer: true },
  { klass: "Chinese", ...none, prior: OFFER_ZH, text: "不用了，谢谢" },
  { klass: "Chinese", ...none, text: "可以看看你们做过的案例照片吗？", direct_request: true },
  { klass: "Chinese", ...none, text: "有没有效果图？", direct_request: true },
  { klass: "Chinese", ...none, text: "我需要再考虑一下", hesitation: true },
  { klass: "Chinese", ...none, text: "我想先和家人商量", hesitation: true },
  { klass: "Chinese", ...none, text: "这个问题我已经问过了", impatience: true },
  { klass: "Chinese", ...none, text: "你还没有回答我的问题", impatience: true },
  { klass: "Chinese", ...none, text: "我大约五年前失去了大部分上排牙齿" },
  { klass: "Chinese", ...none, text: "费用是多少？" },

  // ── Turkish (dotted/dotless i) ──────────────────────────────────────
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "evet, lütfen", accepts_offer: true },
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "olur, görmek isterim", accepts_offer: true },
  { klass: "Turkish", ...none, prior: OFFER_TR, text: "hayır, teşekkürler" },
  { klass: "Turkish", ...none, text: "yaptığınız işlerin fotoğraflarını görebilir miyim?", direct_request: true },
  { klass: "Turkish", ...none, text: "sonuç fotoğrafınız var mı?", direct_request: true },
  { klass: "Turkish", ...none, text: "biraz düşünmem gerek", hesitation: true },
  { klass: "Turkish", ...none, text: "önce eşimle konuşayım", hesitation: true },
  { klass: "Turkish", ...none, text: "bunu zaten sormuştum", impatience: true },
  { klass: "Turkish", ...none, text: "sorumu hâlâ cevaplamadınız", impatience: true },
  { klass: "Turkish", ...none, text: "beş yıl önce üst dişlerimin çoğunu kaybettim" },
  { klass: "Turkish", ...none, text: "fiyat ne kadar?" },

  // ── Spanish (inverted punctuation) ──────────────────────────────────
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "sí, por favor", accepts_offer: true },
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "vale, enséñamelas", accepts_offer: true },
  { klass: "Spanish", ...none, prior: OFFER_ES, text: "no, gracias" },
  { klass: "Spanish", ...none, text: "¿puedo ver fotos de vuestros trabajos?", direct_request: true },
  { klass: "Spanish", ...none, text: "¿tenéis imágenes de resultados?", direct_request: true },
  { klass: "Spanish", ...none, text: "necesito pensarlo", hesitation: true },
  { klass: "Spanish", ...none, text: "primero quiero hablarlo con mi mujer", hesitation: true },
  { klass: "Spanish", ...none, text: "ya te pregunté eso", impatience: true },
  { klass: "Spanish", ...none, text: "todavía no has respondido a mi pregunta", impatience: true },
  { klass: "Spanish", ...none, text: "perdí la mayoría de mis dientes superiores hace cinco años" },
  { klass: "Spanish", ...none, text: "¿cuánto cuesta?" },
];

export const SIGNAL_KEYS = [
  "accepts_offer",
  "direct_request",
  "hesitation",
  "impatience",
] as const satisfies readonly (keyof Signals)[];
