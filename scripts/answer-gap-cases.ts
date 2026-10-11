// Labelled questions for the "did the knowledge base answer this?" judge.
//
// ── Written BEFORE the judge existed, and committed before it ran ───
// Otherwise "zero false positives" means nothing: a label adjusted after
// seeing a verdict is a label fitted to the verdict. The git history of
// this file predates lib/answer-gap.ts for exactly that reason.
//
// The split is declared per case, by hand, not computed. Tuning happens
// on `tune` only; `heldout` is run once, at the end, and the numbers
// reported from it are the numbers that count.
//
// Each case is asked in four languages. That matters more than it looks:
// test-clinic's entries are ALL in English, so every `answered: true`
// case asked in Arabic, Russian or Turkish is the hard negative we care
// most about — the answer exists, in another language, and flagging it
// would tell an owner to re-add their own warranty.
//
// ── Labelled against what test-clinic actually contains ─────────────
// Twenty-three entries. The operational ones:
//
//   The warranty      20 years on the crowns, lifetime on the implants
//   Implants brand    Implant Swiss
//   Crowns brand      Straumann zirconia
//   The duration      implants 2 visits (5 days, 4 months, 7 days);
//                     Hollywood smile 7 days, one visit
//   The package       VIP airport transport and a 5-star hotel
//   Our history       15 years of experience
//
// Everything else is marketing prose about a procedure: what it is, who
// it suits, why Istanbul. None of it carries a price, a name, a policy
// or an eligibility rule.
//
// Thirty-three cases now. The last ten were added after the first
// held-out run reported Turkish recall at 60% against 75% overall — too
// small a sample to tell a real weakness from noise. They are labelled
// here, unrun, for the same reason as everything above.
//
// PARTIALLY answered counts as UNANSWERED, deliberately. The visitor
// asking what happens if an implant fails does not get their answer from
// an entry about what the warranty covers, and the owner adding one line
// is the right fix. Marked `partial` so the report can show them
// separately.

export type AnswerGapCase = {
  id: string;
  /** True when test-clinic's entries genuinely contain the answer. */
  answered: boolean;
  /**
   * Answered in part, and labelled UNANSWERED.
   *
   * The hardest class in both directions: close enough to an entry that
   * a judge may call it answered, and genuinely not an answer.
   */
  partial?: true;
  /** Why it is labelled the way it is. Written at labelling time. */
  because: string;
  split: "tune" | "heldout";
  en: string;
  ar: string;
  ru: string;
  tr: string;
};

export const ANSWER_GAP_CASES: AnswerGapCase[] = [
  // ── Answered, asked plainly ───────────────────────────────────────
  {
    id: "warranty",
    answered: true,
    because: "\"The warranty\" gives 20 years on crowns and lifetime on implants.",
    split: "tune",
    en: "what warranty do you give on the crowns?",
    ar: "ما هو الضمان على التيجان؟",
    ru: "какая гарантия на коронки?",
    tr: "kronlar için garanti nedir?",
  },
  {
    id: "implant-brand",
    answered: true,
    because: "\"Implants brand\" names Implant Swiss.",
    split: "tune",
    en: "which implant brand do you use?",
    ar: "ما نوع الغرسات التي تستخدمونها؟",
    ru: "какие импланты вы используете?",
    tr: "hangi implant markasını kullanıyorsunuz?",
  },
  {
    id: "visits",
    answered: true,
    because: "\"The duration\" gives 2 visits, 5 days, 4 months healing, 7 days.",
    split: "tune",
    en: "how many visits does implant treatment take?",
    ar: "كم زيارة تحتاج زراعة الأسنان؟",
    ru: "сколько визитов нужно для имплантации?",
    tr: "implant tedavisi kaç ziyaret sürüyor?",
  },
  {
    id: "whitening-offered",
    answered: true,
    because: "There is a whole entry on teeth whitening.",
    split: "tune",
    en: "do you do teeth whitening?",
    ar: "هل تقومون بتبييض الأسنان؟",
    ru: "вы делаете отбеливание зубов?",
    tr: "diş beyazlatma yapıyor musunuz?",
  },
  {
    id: "years",
    answered: true,
    because: "\"we have 15 years of experience\".",
    split: "heldout",
    en: "how long have you been doing this?",
    ar: "منذ متى تعملون في هذا المجال؟",
    ru: "сколько лет вы этим занимаетесь?",
    tr: "ne zamandan beri bu işi yapıyorsunuz?",
  },
  {
    id: "crowns-brand",
    answered: true,
    because: "\"Crowns brand\" names Straumann zirconia.",
    split: "heldout",
    en: "which crowns do you use?",
    ar: "ما نوع التيجان التي تستخدمونها؟",
    ru: "какие коронки вы используете?",
    tr: "hangi kronları kullanıyorsunuz?",
  },
  {
    id: "package",
    answered: true,
    because: "\"The package\" lists VIP airport transport and a 5-star hotel.",
    split: "heldout",
    en: "what is included in the package?",
    ar: "ماذا تشمل الباقة؟",
    ru: "что входит в пакет?",
    tr: "pakete neler dahil?",
  },
  {
    id: "female-hair",
    answered: true,
    because: "\"Hair transplant for female\" is a dedicated entry.",
    split: "heldout",
    en: "do you do hair transplants for women?",
    ar: "هل تقومون بزراعة الشعر للنساء؟",
    ru: "вы делаете пересадку волос женщинам?",
    tr: "kadınlara saç ekimi yapıyor musunuz?",
  },

  // ── Answered, phrased nothing like the entry ──────────────────────
  {
    id: "cover-reworded",
    answered: true,
    because: "Asks for the warranty without using the word — the entry answers it.",
    split: "heldout",
    en: "if a crown breaks in a few years, am I covered?",
    ar: "إذا تكسر التاج بعد سنوات، هل أنا مشمول؟",
    ru: "если коронка сломается через несколько лет, это покрывается?",
    tr: "kron birkaç yıl sonra kırılırsa kapsam dahilinde mi?",
  },
  {
    id: "screws-reworded",
    answered: true,
    because: "\"Screws that go in the jaw\" is the implant. The brand is named.",
    split: "tune",
    en: "what make are the screws that go into the jaw?",
    ar: "ما ماركة البراغي التي توضع في الفك؟",
    ru: "какой марки винты, которые ставят в челюсть?",
    tr: "çeneye takılan vidaların markası nedir?",
  },
  {
    id: "nose-offered",
    answered: true,
    because: "Rhinoplasty has its own entry.",
    split: "tune",
    en: "can you fix the shape of my nose?",
    ar: "هل يمكنكم تعديل شكل أنفي؟",
    ru: "вы можете исправить форму носа?",
    tr: "burnumun şeklini düzeltebilir misiniz?",
  },
  {
    id: "weight-offered",
    answered: true,
    because: "Bariatric surgery has its own entry.",
    split: "heldout",
    en: "do you help people lose a lot of weight surgically?",
    ar: "هل تساعدون في إنقاص الوزن بالجراحة؟",
    ru: "вы помогаете сильно похудеть хирургически?",
    tr: "cerrahi yolla çok kilo vermeye yardım ediyor musunuz?",
  },

  // ── Not answered anywhere ─────────────────────────────────────────
  {
    id: "price",
    answered: false,
    because: "No entry carries a price or a range for anything.",
    split: "tune",
    en: "how much do dental implants cost?",
    ar: "كم تكلفة زراعة الأسنان؟",
    ru: "сколько стоит имплантация зубов?",
    tr: "diş implantı ne kadar?",
  },
  {
    id: "instalments",
    answered: false,
    because: "Nothing about payment terms, deposits or financing.",
    split: "tune",
    en: "can I pay in instalments?",
    ar: "هل يمكن الدفع على أقساط؟",
    ru: "можно ли оплатить в рассрочку?",
    tr: "taksitle ödeyebilir miyim?",
  },
  {
    id: "doctors",
    answered: false,
    because: "No doctor is named and no qualification is stated.",
    split: "tune",
    en: "who are the doctors and what are their qualifications?",
    ar: "من هم الأطباء وما هي مؤهلاتهم؟",
    ru: "кто врачи и какая у них квалификация?",
    tr: "doktorlar kim ve nitelikleri neler?",
  },
  {
    id: "insurance",
    answered: false,
    because: "Insurance is never mentioned.",
    split: "tune",
    en: "do you accept health insurance?",
    ar: "هل تقبلون التأمين الصحي؟",
    ru: "вы принимаете медицинскую страховку?",
    tr: "sağlık sigortası kabul ediyor musunuz?",
  },
  {
    id: "diabetes",
    answered: false,
    because: "No eligibility or health-condition rule anywhere.",
    split: "heldout",
    en: "I am diabetic, can I still have implants?",
    ar: "أنا مريض سكري، هل يمكنني إجراء الزراعة؟",
    ru: "у меня диабет, можно ли мне имплантацию?",
    tr: "şeker hastasıyım, implant yapılabilir mi?",
  },
  {
    id: "visa",
    answered: false,
    because: "Travel help is the hotel and transfer only; no visa letter.",
    split: "heldout",
    en: "can you send an invitation letter for my visa?",
    ar: "هل يمكنكم إرسال خطاب دعوة للحصول على التأشيرة؟",
    ru: "можете ли вы прислать приглашение для визы?",
    tr: "vize için davet mektubu gönderebilir misiniz?",
  },
  {
    id: "parking",
    answered: false,
    because: "Nothing about the premises beyond the city.",
    split: "heldout",
    en: "is there parking at the clinic?",
    ar: "هل يوجد موقف سيارات في العيادة؟",
    ru: "есть ли парковка у клиники?",
    tr: "klinikte otopark var mı?",
  },
  {
    id: "aftercare",
    answered: false,
    because: "No entry says what happens after the patient flies home.",
    split: "tune",
    en: "what aftercare do I get once I'm back home?",
    ar: "ما هي المتابعة بعد عودتي إلى بلدي؟",
    ru: "какое наблюдение после возвращения домой?",
    tr: "eve döndükten sonra bakım nasıl oluyor?",
  },

  // ── Partially answered — labelled UNANSWERED ──────────────────────
  {
    id: "implant-fails",
    answered: false,
    partial: true,
    because:
      "The warranty entry covers the crowns and implants as MATERIALS. It says nothing about what happens, who to contact, or who pays if one fails — which is what was asked.",
    split: "tune",
    en: "what happens if an implant fails after I go home?",
    ar: "ماذا يحدث إذا فشلت الغرسة بعد عودتي إلى بلدي؟",
    ru: "что будет, если имплант не приживётся после возвращения домой?",
    tr: "eve döndükten sonra implant tutmazsa ne olur?",
  },
  {
    id: "hotel-nights",
    answered: false,
    partial: true,
    because:
      "\"The package\" says a 5-star hotel is included. It never says how many nights, which is the question.",
    split: "heldout",
    en: "how many nights in the hotel are included?",
    ar: "كم ليلة في الفندق مشمولة؟",
    ru: "сколько ночей в отеле включено?",
    tr: "otelde kaç gece dahil?",
  },
  {
    id: "anaesthesia",
    answered: false,
    partial: true,
    because:
      "Entries mention sedation as part of the procedure but never whether it is inside the quoted price.",
    split: "heldout",
    en: "is the anaesthetic included in the price?",
    ar: "هل التخدير مشمول في السعر؟",
    ru: "наркоз входит в стоимость?",
    tr: "anestezi fiyata dahil mi?",
  },

  // ── Ten more, added to strengthen Turkish ─────────────────────────
  //
  // Turkish was the weakest language on the held-out run: 100%
  // precision, same as the rest, but 60% recall against 75% overall.
  // Ten cases is not enough to tell a real weakness from a small
  // sample, so these ten were added — asked in all four languages, as
  // the structure requires, and weighted toward UNANSWERED because
  // recall is what was weak.
  //
  // The Turkish wordings lean on what makes Turkish hard for this
  // judge rather than on more of the same: agglutination carrying the
  // question ("kalırsam", "gerekiyor") where the other languages use a
  // separate word, and the dotted/dotless i pair, which is one of the
  // six failure classes this project tracks.
  //
  // Labelled before being run, like every case above. Four tune, six
  // held-out.

  // Answered — hard negatives, the ones that cost trust if flagged.
  {
    id: "hollywood-duration",
    answered: true,
    because: "\"The duration\" gives the Hollywood smile as 7 days, one visit.",
    split: "tune",
    en: "how long does a Hollywood smile take?",
    ar: "كم تستغرق ابتسامة هوليوود؟",
    ru: "сколько времени занимает голливудская улыбка?",
    tr: "Hollywood gülüşü ne kadar sürüyor?",
  },
  {
    id: "airport-pickup",
    answered: true,
    because: "\"The package\" includes VIP airport transport — asked without the word.",
    split: "heldout",
    en: "will someone pick me up from the airport?",
    ar: "هل سيستقبلني أحد في المطار؟",
    ru: "меня встретят в аэропорту?",
    tr: "beni havalimanından alacak biri olacak mı?",
  },
  {
    id: "crowns-years",
    answered: true,
    because: "\"The warranty\" gives 20 years on the crowns.",
    split: "heldout",
    en: "for how many years are the crowns guaranteed?",
    ar: "كم سنة ضمان التيجان؟",
    ru: "на сколько лет гарантия на коронки?",
    tr: "kronların garantisi kaç yıl?",
  },
  {
    id: "istanbul-location",
    answered: true,
    because: "Several entries state the clinic is in Istanbul.",
    split: "heldout",
    en: "which city is the clinic in?",
    ar: "في أي مدينة تقع العيادة؟",
    ru: "в каком городе находится клиника?",
    tr: "klinik hangi şehirde?",
  },

  // Not answered — what recall is measured on.
  {
    id: "women-only-area",
    answered: false,
    because: "Nothing about the premises, facilities or any separate area.",
    split: "tune",
    en: "do you have a women-only treatment area?",
    ar: "هل لديكم قسم مخصص للنساء فقط؟",
    ru: "есть ли у вас отделение только для женщин?",
    tr: "sadece kadınlara ayrılmış bir bölüm var mı?",
  },
  {
    id: "deposit",
    answered: false,
    because: "No payment terms of any kind — no deposit, no schedule.",
    split: "tune",
    en: "how much deposit do I pay upfront?",
    ar: "كم العربون المطلوب مقدماً؟",
    ru: "какой нужен депозит заранее?",
    tr: "peşin olarak ne kadar kapora ödemem gerekiyor?",
  },
  {
    id: "smoking-after",
    answered: false,
    because: "No post-operative instruction appears anywhere.",
    split: "tune",
    en: "can I smoke after the implant surgery?",
    ar: "هل يمكنني التدخين بعد عملية الزراعة؟",
    ru: "можно ли курить после имплантации?",
    tr: "implant ameliyatından sonra sigara içebilir miyim?",
  },
  {
    id: "cancellation",
    answered: false,
    because: "No booking, cancellation or refund policy exists.",
    split: "heldout",
    en: "what happens if I have to cancel my trip?",
    ar: "ماذا يحدث إذا اضطررت لإلغاء رحلتي؟",
    ru: "что будет, если мне придётся отменить поездку?",
    tr: "seyahatimi iptal etmek zorunda kalırsam ne olur?",
  },
  {
    id: "bone-graft",
    answered: false,
    because:
      "Two things asked, neither present: no eligibility rule naming grafting, and no price for anything.",
    split: "heldout",
    en: "will I need a bone graft, and does it cost extra?",
    ar: "هل أحتاج إلى ترقيع عظم، وهل تكلفته إضافية؟",
    ru: "понадобится ли костная пластика и стоит ли она отдельно?",
    tr: "kemik grefti gerekir mi, ayrı ücret mi?",
  },
  {
    id: "translator",
    answered: false,
    partial: true,
    because:
      "\"The package\" lists what the trip includes — transport and a hotel — and a translator is not among them. Close enough to the package entry that a judge may read it as covered, and genuinely not stated either way.",
    split: "heldout",
    en: "is a translator provided during the treatment?",
    ar: "هل يوجد مترجم خلال العلاج؟",
    ru: "предоставляется ли переводчик во время лечения?",
    tr: "tedavi sırasında tercüman sağlanıyor mu?",
  },
];

export const LANGUAGES = ["en", "ar", "ru", "tr"] as const;
export type CaseLanguage = (typeof LANGUAGES)[number];
