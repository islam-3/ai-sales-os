// The questions a business is asked instead of being handed an empty box.
//
// ── Why this exists ──────────────────────────────────────────────────
// Businesses paste their website's marketing copy into the knowledge
// base and do not realise the operational answers customers actually ask
// about are missing. The assistant then looks weak and the platform gets
// blamed.
//
// The evidence is one real clinic's knowledge base. Twenty entries, and
// the split is stark. The pasted marketing: Liposuction at 2,707
// characters, Face-Lift 1,756, "Get a Celebrity Smile in the Heart of
// Istanbul, Shine Like a Star!" 1,383. The operational answers, every
// one added BY HAND after live testing exposed the gap:
//
//     The warranty      80 chars   20 years on crowns, lifetime implants
//     Duration         232         2 visits, 5 days, 4 months, 7 days
//     Implants brand   238         Implant Swiss
//     Crowns brand     218         Straumann
//     The package      104         VIP transport and a 5-star hotel
//
// Under 900 characters of answers, reverse-engineered by watching the
// assistant fail. That list is this module's requirement.
//
// ── Universal first, packs second ───────────────────────────────────
// The core set is the foundation and has to be good on its own, because
// most tenants will only ever see it. A pack is a thin overlay: wording,
// examples, and at most a question or two. A tenant whose industry has
// no pack gets the full core set with neutral wording and no
// degradation.
//
// Validated on paper against four unlike businesses — a dental clinic, a
// real-estate agency, a language school and a car rental — before any of
// it was written. Eight of the ten worked as first worded; two needed
// rewording and are noted where they are defined.
//
// ── Everything here is fixed in code ────────────────────────────────
// Never generated per tenant. These will later define when a lead is
// complete, so they have to be stable and testable.

/** The sentinel for an answer that applies whatever the customer asks about. */
export const ALL_CATEGORIES = null;

export type GuidedQuestionKey =
  | "pricing"
  | "included"
  | "excluded"
  | "duration"
  | "guarantee"
  | "if_wrong"
  | "materials"
  | "people"
  | "not_a_fit"
  | "to_quote"
  // Clinic pack.
  | "aftercare"
  | "travel";

/**
 * A "we don't offer this" option, with the sentence spelled out.
 *
 * The exact words are here rather than composed by the model, for the
 * same reason the no-images instruction is: a sentence about what a
 * business cannot do reaches a customer verbatim, and one the model
 * improvises is one nobody approved.
 *
 * Only on questions where "we don't offer this" is a FACT about the
 * business. Not on questions every business has an answer to — offering
 * it there invites a skip where the truth is "I have not written it
 * yet", and the assistant would then announce a gap that does not exist.
 */
export type NotOfferedOption = {
  /** What the owner clicks. */
  label: string;
  /** Stored verbatim as the entry's content. Never composed. */
  sentence: string;
};

/**
 * How a business prices, chosen rather than parsed.
 *
 * The third shape is the one that matters and the one a real clinic
 * needs: "we quote after assessing your case" is a confident, complete
 * answer, not a refusal. Said plainly it stops the assistant replying
 * "the team will confirm" to every single pricing question — which is
 * what it does today, on every conversation.
 */
export type PricingShape = {
  id: "fixed" | "range" | "on_assessment";
  label: string;
  /** Asks the owner for the figures or the drivers. */
  needsText: boolean;
  /** Placeholder for the text field, when there is one. */
  placeholder?: string;
  /**
   * Fixed opening the stored answer begins with, when the shape has one.
   *
   * on_assessment is the only shape that carries a sentence of its own,
   * because that is the whole point of it: the confident version of "it
   * depends" has to be words we chose, not words an owner has to find.
   */
  sentence?: string;
  /**
   * Another question this shape makes urgent.
   *
   * Quoting on assessment is only honest if the business says what it
   * needs in order to quote, so choosing it points at to_quote.
   */
  thenAsk?: GuidedQuestionKey;
};

export type GuidedQuestion = {
  key: GuidedQuestionKey;
  /** Asked of the owner. Industry-neutral unless a pack overrides it. */
  prompt: string;
  /** One line on why a customer cares, shown under the prompt. */
  why: string;
  /** The title stored on the knowledge entry, and what the embedding sees. */
  entryTitle: string;
  /** Concrete prompts for what to write. Packs replace these. */
  examples: string;
  notOffered?: NotOfferedOption;
  shapes?: PricingShape[];
};

// ─────────────────────────────────────────────────────────────────────
// The universal core
// ─────────────────────────────────────────────────────────────────────

export const CORE_QUESTIONS: GuidedQuestion[] = [
  {
    key: "pricing",
    prompt: "How does your pricing work, and what makes it go up or down?",
    why: "The most asked question of all. Without it the assistant says \"the team will confirm\" every time.",
    entryTitle: "How pricing works",
    examples: "What the price depends on — size, quantity, how complex the job is, which option they choose.",
    shapes: [
      {
        id: "fixed",
        label: "Fixed prices I can state",
        needsText: true,
        placeholder: "e.g. A standard clean is 15 EUR. A deep clean is 40 EUR.",
      },
      {
        id: "range",
        label: "A range, depending on the job",
        needsText: true,
        placeholder: "e.g. Between 800 and 2,500 EUR, depending on how many units are needed.",
      },
      {
        id: "on_assessment",
        label: "We quote after looking at the case",
        needsText: false,
        // Confident and complete. "It depends" is the same information
        // delivered as an apology.
        sentence:
          "Every case is priced individually after the team has looked at it, so there is no list price to quote. Once they have what they need, the quote is exact rather than a guess — and it does not change afterwards.",
        thenAsk: "to_quote",
      },
    ],
  },
  {
    key: "included",
    prompt: "What's included in the price?",
    why: "Customers assume either too much or too little. Both lose the sale.",
    entryTitle: "What is included",
    examples: "Everything the price covers that they might not expect.",
    notOffered: {
      label: "Just the service itself — nothing bundled",
      sentence: "The price covers just the service itself. Nothing else is bundled with it.",
    },
  },
  {
    key: "excluded",
    prompt: "What isn't included?",
    why: "The question behind \"are there hidden costs?\". Answering it plainly builds more trust than any claim.",
    entryTitle: "What is not included",
    examples: "Anything they would have to pay for separately.",
    notOffered: {
      label: "Nothing extra — the quoted price is all of it",
      sentence: "There are no extra costs beyond the quoted price.",
    },
  },
  {
    key: "duration",
    // Reworded after validation. "How long does it take?" alone is
    // meaningless for a car rental, where the duration is the customer's
    // choice — but "minimum one day, book 48 hours ahead in August" is a
    // real answer. The constraint half carries it.
    prompt: "How long does it take, and are there any timing constraints?",
    why: "Second only to price. People are planning around the answer.",
    entryTitle: "How long it takes",
    examples: "Start to finish, plus anything about timing they need to plan around.",
  },
  {
    key: "guarantee",
    prompt: "What guarantee or cover do you give, and on what exactly?",
    why: "\"On what exactly\" is the part that matters — a guarantee on one part and not another is the thing people feel cheated by.",
    entryTitle: "Guarantee and cover",
    examples: "What is covered, for how long, and what is not.",
    // Two of the four businesses this was validated against would
    // honestly answer "we don't", which is why this state exists at all.
    notOffered: {
      label: "We don't offer a guarantee",
      sentence: "This business does not offer a guarantee or warranty on this.",
    },
  },
  {
    key: "if_wrong",
    prompt: "What happens if something goes wrong afterwards?",
    why: "The fear behind every expensive decision. Nobody asks it directly.",
    entryTitle: "If something goes wrong afterwards",
    examples: "Who they contact, what you do about it, and who pays.",
  },
  {
    key: "materials",
    prompt: "What do you use or work with?",
    why: "The question that separates you from a cheaper competitor — if you name it.",
    entryTitle: "What we use",
    examples: "Brands, materials, systems, partners, suppliers — whatever a customer would recognise.",
    // Deliberately NO "we don't offer this". "This business has not
    // named particular brands" is a fact about the FORM, not about the
    // business, and a visitor reading it hears an unserious operation.
    // Silence is better, and "prefer not to say" gives exactly that.
  },
  {
    key: "people",
    // Reworded after validation. "Who does the work" assumes something
    // performed on the customer; it broke on car rental, where nobody
    // does work for them. "Who they will be dealing with" covers a
    // surgeon, an agent, a teacher and a branch counter alike.
    prompt: "Who will the customer be dealing with, and what are their credentials?",
    why: "People buy from people. A name and a qualification does more than any amount of description.",
    entryTitle: "Who you will be dealing with",
    examples: "Names, qualifications, years doing this, languages spoken.",
  },
  {
    key: "not_a_fit",
    prompt: "Who is this not a fit for?",
    why: "Saying who you cannot help makes everything else believable — and saves the team calls that go nowhere.",
    entryTitle: "Who this is not for",
    examples: "Requirements they must meet, or cases you turn away.",
  },
  {
    key: "to_quote",
    prompt: "What do you need from the customer before you can give a real answer?",
    why: "Tells the assistant what to gather, so the team gets a lead it can act on rather than a name.",
    entryTitle: "What we need from you",
    examples: "Details, documents or photos you cannot quote without.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Packs — a thin overlay, never a replacement
// ─────────────────────────────────────────────────────────────────────

export type IndustryPack = {
  id: string;
  /** Shown in the dashboard so the owner knows which wording they got. */
  label: string;
  /** Matched against the tenant's own industry setting. Never asked again. */
  match: RegExp;
  /** Per-question overrides. Anything absent keeps the core wording. */
  overrides?: Partial<Record<GuidedQuestionKey, Partial<GuidedQuestion>>>;
  /** At most one or two. A pack that adds six is a new core set. */
  extra?: GuidedQuestion[];
};

export const INDUSTRY_PACKS: IndustryPack[] = [
  {
    id: "clinic",
    label: "Clinic",
    // Deliberately broad: the tenant's industry field is free text, and
    // "Dental clinic", "dentist", "aesthetic surgery" and "hair
    // transplant" are all the same pack.
    match: /clinic|dental|dentist|medical|surgery|surgeon|aesthet|cosmetic|hair transplant|hospital|health/i,
    overrides: {
      pricing: {
        examples:
          "What the price depends on — how many units or teeth, whether grafting is needed, which brand they choose.",
      },
      included: {
        examples: "Transfers, hotel nights, temporaries, medication, follow-up appointments.",
      },
      excluded: { examples: "Flights, extra nights, medication after they go home, revision travel." },
      duration: {
        prompt: "How many visits does it take, and how long is each one?",
        examples: "Visits, days per visit, healing time in between, and when they can fly.",
      },
      guarantee: { examples: "What is guaranteed, for how long — and whether the guarantee differs by part." },
      if_wrong: {
        prompt: "What happens if there's a problem once they're home?",
        examples: "Who they contact, whether they need to travel back, and who pays if they do.",
      },
      materials: { examples: "Implant and crown brands, devices, laboratories." },
      people: {
        prompt: "Which doctors will treat them, and what are their credentials?",
        examples: "Names, specialities, years practising, languages spoken.",
      },
      not_a_fit: {
        examples: "Health conditions, medication, age limits, smoking, anything you turn away.",
      },
      to_quote: { examples: "Photos, an X-ray or scan, medical history, medication they take." },
    },
    extra: [
      {
        key: "aftercare",
        prompt: "What does recovery and aftercare involve once they're home?",
        why: "The part people worry about most and ask about least before booking.",
        entryTitle: "Recovery and aftercare",
        examples: "What to expect week by week, what they must avoid, and how you stay in touch.",
      },
      {
        key: "travel",
        prompt: "Do you help with travel — transfers, hotel, a visa letter?",
        why: "For anyone travelling to you, this decides whether it feels manageable.",
        entryTitle: "Travel and stay",
        examples: "Airport transfers, which hotel, how many nights, visa or invitation letters.",
        // A local clinic with no international patients must be able to
        // say so plainly rather than leave it blank.
        notOffered: {
          label: "We don't arrange travel",
          sentence: "This business does not arrange travel, transfers or accommodation.",
        },
      },
    ],
  },
];

/** The pack for a tenant's industry, or null when none matches. */
export function packForIndustry(industry: string | null | undefined): IndustryPack | null {
  const text = (industry ?? "").trim();
  if (!text) return null;
  return INDUSTRY_PACKS.find((p) => p.match.test(text)) ?? null;
}

/**
 * The questions to ask this tenant: the core set, overlaid, plus extras.
 *
 * A tenant with no pack gets CORE_QUESTIONS unchanged — the same ten
 * questions in neutral wording, not a reduced set. That is the whole
 * design: the universal set has to stand on its own because most
 * tenants will only ever see it.
 */
export function questionsFor(industry: string | null | undefined): GuidedQuestion[] {
  const pack = packForIndustry(industry);
  if (!pack) return CORE_QUESTIONS;

  const overlaid = CORE_QUESTIONS.map((q) => {
    const over = pack.overrides?.[q.key];
    return over ? { ...q, ...over } : q;
  });
  return [...overlaid, ...(pack.extra ?? [])];
}

/** Looked up by key, across the core set and every pack's extras. */
export function questionByKey(
  key: string,
  industry: string | null | undefined
): GuidedQuestion | null {
  return questionsFor(industry).find((q) => q.key === key) ?? null;
}
