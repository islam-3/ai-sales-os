// Facts about the conversation so far, computed fresh each turn and handed
// to the model as an explicit state block.
//
// Everything here is something the model could in principle work out for
// itself — it has the whole transcript. In practice it doesn't. A real
// test conversation had the assistant offer "want to see before/after
// photos?" in four consecutive replies, including immediately after the
// visitor said they needed to think about it. The transcript was right
// there; an implicit rule to not repeat itself was not enough.
//
// So the division of labour is: anything that can be established by
// looking at the text is established HERE and stated as fact, and the
// prompt is left to make the judgements that genuinely need judgement —
// whether a question is still unanswered, whether someone is relaxed
// enough to hear about another service, which details matter for a
// particular case.

export type ChatTurn = { role: string; content: string };

/**
 * Phrases that make a message an offer rather than a statement. Deliberately
 * narrow: these are the shapes the assistant actually produces when it
 * proposes showing or sending something, and a loose pattern here would
 * flag ordinary sentences and suppress offers that were never made.
 */
const OFFER_CUES = [
  /\bwant to see\b/i,
  /\bwould you like (?:to see|me to)\b/i,
  /\bwould you like\b[^.?!]*\?/i,
  /\bi can (?:show|send)\b/i,
  /\bshall i (?:show|send)\b/i,
  /\bcan i (?:show|send)\b/i,
  /\bhappy to (?:show|send)\b/i,
  /\blet me know if you(?:'d| would) like\b/i,
];

/** Splits into sentences without cutting on decimals or abbreviations. */
function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The offers the assistant has already put on the table, as the sentences
 * it actually used.
 *
 * Quoting them back verbatim is the point: "you have already offered X"
 * is a far stronger instruction than "do not repeat yourself", because
 * there is nothing left to interpret.
 */
export function extractPriorOffers(history: ChatTurn[]): string[] {
  const offers: string[] = [];
  const seen = new Set<string>();

  for (const turn of history) {
    if (turn.role !== "assistant") continue;

    for (const sentence of sentencesOf(turn.content)) {
      if (!OFFER_CUES.some((cue) => cue.test(sentence))) continue;

      // Near-identical repeats collapse to one line; the count of how
      // often it was said is not what the model needs to know.
      const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      if (!key || seen.has(key)) continue;

      seen.add(key);
      offers.push(sentence);
    }
  }

  return offers;
}

const IMPATIENCE_CUES = [
  /\bstill waiting\b/i,
  /\byou (?:didn'?t|did not|never) (?:answer|reply|respond|say)\b/i,
  /\bi (?:already )?asked\b/i,
  /\bi asked you\b/i,
  /\bjust (?:tell|give|answer|say)\b/i,
  /\banswer (?:my|the) question\b/i,
  /\bstop (?:asking|avoiding)\b/i,
  /\bhello\s*\?/i,
  /\bare you (?:there|listening)\b/i,
  /\bnot what i asked\b/i,
  /\bfor the (?:second|third|last) time\b/i,
];

/** Words too common to indicate that two questions are the same one. */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "you",
  "your", "i", "me", "my", "we", "it", "to", "of", "for", "and", "or", "in",
  "on", "at", "with", "how", "what", "when", "where", "can", "could", "would",
  "will", "much", "many", "have", "has", "about", "that", "this", "be", "so",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * True when the visitor has asked substantially the same question twice.
 *
 * Someone repeating themselves is the clearest signal that the previous
 * reply missed — clearer than any wording cue, because a polite person
 * re-asks rather than complaining.
 */
function hasRepeatedQuestion(userMessages: string[]): boolean {
  const questions = userMessages.filter((m) => m.includes("?"));
  if (questions.length < 2) return false;

  const latest = contentWords(questions[questions.length - 1]);
  if (latest.size === 0) return false;

  for (const earlier of questions.slice(0, -1)) {
    const previous = contentWords(earlier);
    if (previous.size === 0) continue;

    let shared = 0;
    Array.from(latest).forEach((word) => {
      if (previous.has(word)) shared += 1;
    });

    // Most of the meaningful words in common means it's the same ask
    // rephrased, not a new question that happens to share vocabulary.
    if (shared / latest.size >= 0.6) return true;
  }
  return false;
}

export type ImpatienceSignal = {
  impatient: boolean;
  /** Short, human-readable reasons, for the state block. */
  reasons: string[];
};

/**
 * Whether the visitor is showing signs of frustration.
 *
 * Only the most recent message is checked for wording cues — impatience is
 * a current state, and someone who was short three messages ago may be
 * perfectly happy now. Question repetition looks further back, because
 * that is a pattern rather than a mood.
 */
export function detectImpatience(history: ChatTurn[]): ImpatienceSignal {
  const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
  if (userMessages.length === 0) return { impatient: false, reasons: [] };

  const latest = userMessages[userMessages.length - 1];
  const reasons: string[] = [];

  if (IMPATIENCE_CUES.some((cue) => cue.test(latest))) {
    reasons.push("they have said their question was not answered");
  }

  // "??" or "?!" is exasperation; a single "?" is just a question.
  if (/[?!]{2,}/.test(latest)) {
    reasons.push("their message carries repeated punctuation");
  }

  // Shouting. Short acronyms are excluded so "BBL" or "UK" don't count.
  const shouted = latest.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (shouted.length > 0) reasons.push("part of their message is in capitals");

  // A message that is nothing but punctuation is a prod, not a question.
  if (/^[\s?!.]+$/.test(latest)) reasons.push("they replied with punctuation only");

  if (hasRepeatedQuestion(userMessages)) {
    reasons.push("they have now asked the same question more than once");
  }

  return { impatient: reasons.length > 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────
// Hesitation
//
// "I need to think about it" is the commercially decisive moment. Backing
// off silently loses the lead outright when there is no way to reach
// them; pitching harder loses it too, because they have already closed
// mentally. Which move is right depends on a fact — whether we can reach
// them — so that fact is established here rather than left to judgement.
// ─────────────────────────────────────────────────────────────────────

const HESITATION_CUES = [
  /\bneed to think\b/i,
  /\bhave to think\b/i,
  /\blet me think\b/i,
  /\bthink about it\b/i,
  /\bthink it over\b/i,
  /\bnot ready\b/i,
  /\bnot sure yet\b/i,
  /\bmaybe later\b/i,
  /\bget back to you\b/i,
  /\b(?:talk|speak|discuss|check) (?:to|with) (?:my )?(?:wife|husband|partner|family|parents|mum|mom|dad)\b/i,
  /\bdiscuss (?:it|this) with\b/i,
  /\bsleep on it\b/i,
  /\bstill (?:deciding|considering|looking)\b/i,
];

// A dialable number, an email, or nothing. Kept strict: a stray year or
// house number must not read as contactable.
const CONTACT_SIGNALS = [
  /\+\d[\d\s().-]{7,}/,
  /\b\d[\d\s().-]{8,}\d\b/,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
];

/**
 * Whether the visitor has given a way to reach them, judged from what
 * they actually typed.
 *
 * Deliberately reads the transcript rather than lead_profile: extraction
 * is throttled and runs after the reply, so on the very turn where this
 * matters the row may not exist yet. What they typed is available
 * immediately and cannot be stale.
 */
export function hasContactDetails(history: ChatTurn[]): boolean {
  return history
    .filter((turn) => turn.role === "user")
    .some((turn) => CONTACT_SIGNALS.some((signal) => signal.test(turn.content)));
}

export type HesitationSignal = {
  /** True when the message that just arrived expresses hesitation. */
  hesitating: boolean;
  /** How many times they have hesitated, including now. */
  occurrences: number;
};

export function detectHesitation(history: ChatTurn[]): HesitationSignal {
  const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
  const occurrences = userMessages.filter((m) => HESITATION_CUES.some((c) => c.test(m))).length;
  const latest = userMessages[userMessages.length - 1] ?? "";

  return {
    hesitating: HESITATION_CUES.some((c) => c.test(latest)),
    occurrences,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Pre-close coverage
//
// A conversation that ends with a name, a number and a photo can still be
// useless to the team. In a real test the assistant closed the moment a
// photo arrived, having itself explained two turns earlier that the
// treatment needs two visits four months apart — and never asked when the
// visitor could travel or how long they could stay.
//
// Each dimension is a pair: a trigger deciding whether it matters for
// THIS business and conversation, and a detector for whether it has been
// addressed. Nothing is industry-specific — the triggers read the
// business's own knowledge base and the assistant's own words, so a
// builder, a law firm and a clinic each surface whatever their own
// material implies.
// ─────────────────────────────────────────────────────────────────────

/** The shape of a knowledge_base row, as much of it as this module needs. */
export type KnowledgeEntryLike = {
  title: string;
  content: string;
  /** Public URLs of anything attached to this entry. */
  mediaUrls?: string[];
};

type CoverageDimension = {
  id: string;
  /**
   * Where the evidence for relevance has to come from.
   *
   * "case" — the shape of the work being discussed. Drawn from what the
   *   assistant has said AND from the knowledge entries that match what
   *   the visitor asked for. Both halves are needed: the assistant may
   *   never spell out that implants take two visits, but the visitor
   *   saying "full mouth implants" still makes it a two-visit case.
   * "user" — the visitor's own circumstances, which only they can
   *   establish. Travel is the clear example: a business offering airport
   *   transfers says nothing about whether THIS person is flying in.
   */
  source: "case" | "user";
  /** Does this matter here? Tested against the conversation, never the whole catalogue. */
  trigger: RegExp;
  /** Has the visitor addressed it? Tested against everything they have typed. */
  covered: RegExp;
  /** Named in the state block as the thing still to establish. */
  need: string;
  /** Why it matters, so the model asks with a reason rather than out of process. */
  because: string;
};

const MULTI_STAGE =
  /\b(?:two|three|2|3|multiple|separate|second|third)\s+(?:visits?|trips?|stages?|sessions?|appointments?|stays?)\b|\bsecond visit\b|\bmulti-?(?:visit|stage|phase)\b|\bhealing period\b|\bphase (?:one|two|1|2)\b/i;

// There is deliberately no "single session" suppressor here. One was
// written and removed: assistants naturally say "some complete it in a
// single visit, while others need two visits spaced a few months apart",
// and the suppressor matched the first half and cancelled a case that
// genuinely was multi-visit. A conversation about same-day work contains
// no multi-stage language at all, so the trigger already excludes it —
// the suppressor only ever fired on the mixed sentence it got wrong.
const COVERAGE_DIMENSIONS: CoverageDimension[] = [
  {
    id: "dates",
    source: "case",
    trigger: MULTI_STAGE,
    covered:
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}[/.-]\d{1,2}\b|\bnext (?:week|month|year)\b|\bthis (?:week|month|summer|winter|spring|autumn|fall)\b|\bin (?:the )?(?:summer|winter|spring|autumn|fall)\b|\b20\d{2}\b/i,
    need: "when they are planning to come — the actual dates, or at least the month",
    because:
      "this work happens across more than one visit, so the team cannot plan or quote it without knowing when they can travel",
  },
  {
    id: "duration",
    source: "case",
    trigger: MULTI_STAGE,
    covered:
      /\b\d+\s*(?:day|night|week|month)s?\b|\ba (?:week|fortnight|month)\b|\bcouple of (?:days|weeks)\b/i,
    need: "how long they are able to stay on each visit",
    because:
      "the days available decide what can realistically be completed in one trip, and the team plans around that",
  },
  {
    id: "origin",
    // Read from the VISITOR, not the business. A clinic that mentions
    // airport transfers in its material says nothing about whether this
    // particular person is flying in — and asking a local walk-in where
    // they are travelling from is exactly the wrong question.
    source: "user",
    trigger:
      /\b(?:travel|travell?ing|flying|fly|flights?|abroad|overseas|from another country|coming over)\b/i,
    covered:
      /\b(?:i(?:'m| am)|we(?:'re| are))\s+(?:in|from|based in|coming from)\s+\w+|\bfrom the\s+\w+|\blive in\b|\bbased in\b|\bflying (?:in )?from\b/i,
    need: "where they will be travelling from",
    because:
      "the team arranges transfers and timing around the journey, and cannot do that without knowing the origin",
  },
  {
    id: "health",
    source: "case",
    trigger:
      /\b(?:surgery|surgical|surgically|anesthe|anaesthe|sedation|pre-?operative|bone graft|incision)\b/i,
    // An explicit "none" counts as covered: they answered, and the topic
    // is closed. Without that this would nag for something already given.
    covered:
      /\b(?:diabet|blood pressure|heart|asthma|allerg|medication|thyroid|pregnan|smoking|epilep|cancer)\w*\b|\bno (?:health|medical|conditions?|medications?|allergies)\b|\bnothing (?:medical|health)\b|\bi(?:'m| am) (?:healthy|fit)\b|\bno issues\b/i,
    need: "any health conditions or medication the team should know about",
    because:
      "it changes what the team can safely recommend, and is needed before they can assess the case",
  },
];

/**
 * The knowledge entries that describe what the visitor is actually asking
 * about, joined into one string.
 *
 * This is the middle ground between two failures, both of which happened.
 * Feeding the WHOLE knowledge base in made every conversation look like a
 * multi-visit trip abroad, because the catalogue mentions implants and
 * airport transfers whatever the visitor came for. Reading only the
 * assistant's words missed the opposite case: a visitor saying "I lost all
 * my teeth, I need full mouth implants" is plainly a multi-visit case even
 * if the assistant spent its replies talking about crowns and brands.
 *
 * Matching is weighted by rarity. A word that appears in most entries —
 * "teeth" for a dental practice, "kitchen" for a fitter — says nothing
 * about which service is meant, and matching on it would drag the whole
 * catalogue back in. Only words that appear in a minority of entries
 * count, which is what makes "implants" select implant entries while
 * "whitening" selects whitening ones.
 */
/**
 * Words that carry conversation rather than meaning. They are ordinary
 * enough to appear in a business's material by chance, and matching on
 * them pulls in entries that have nothing to do with what was asked.
 */
const CONVERSATIONAL_FILLER = new Set([
  "take", "takes", "taking", "good", "great", "sounds", "know", "tell",
  "like", "want", "wants", "need", "needs", "needed", "looking", "look",
  "thinking", "think", "interested", "please", "thanks", "thank", "hello",
  "hey", "yes", "yeah", "sure", "get", "got", "give", "make", "makes",
  "come", "coming", "say", "said", "see", "seen", "help", "helps", "time",
  "long", "more", "also", "just", "really", "very", "some", "any", "one",
  "two", "there", "here", "then", "than", "but", "not", "now", "out",
  "name", "number", "email", "whatsapp", "phone", "call",
]);

/**
 * How well each entry matches what the visitor asked for, rarity-weighted
 * and length-normalised. Exposed so callers can apply their own cutoff:
 * relevance uses a relative bar, while the media bias only needs to know
 * which entry scored best among those carrying images.
 */
function scoreEntries(userText: string, entries: KnowledgeEntryLike[]): number[] {
  if (entries.length === 0) return [];

  const entryWords = entries.map((e) => contentWords(`${e.title} ${e.content}`));

  const documentFrequency = new Map<string, number>();
  for (const words of entryWords) {
    Array.from(words).forEach((w) => {
      documentFrequency.set(w, (documentFrequency.get(w) ?? 0) + 1);
    });
  }

  const userWords = Array.from(contentWords(userText)).filter(
    (w) => !CONVERSATIONAL_FILLER.has(w)
  );

  return entryWords.map((words) => {
    const raw = userWords.reduce((total, word) => {
      if (!words.has(word)) return total;
      const df = documentFrequency.get(word) ?? 0;
      return df === 0 ? total : total + Math.log(entries.length / df);
    }, 0);
    return raw / Math.sqrt(Math.max(MIN_ENTRY_WORDS, words.size));
  });
}

export function selectRelevantEntries(
  userText: string,
  entries: KnowledgeEntryLike[],
  // How close to the best match an entry must score.
  //
  // Measured rather than guessed: swept against four real enquiries
  // (whitening, full-mouth implants, bare "implants", hair transplant),
  // 0.5 was the only value that failed — it let a whitening enquiry match
  // an implant case study on the shared word "teeth" and inherit "two
  // visits" from it. Everything from 0.6 up classified all four
  // correctly, so 0.7 sits clear of that edge.
  cutoffRatio = 0.7
): KnowledgeEntryLike[] {
  if (entries.length === 0) return [];

  const scores = scoreEntries(userText, entries);
  const best = Math.max(...scores);
  if (best <= 0) return [];

  // Relative, not absolute. An absolute bar let a whitening enquiry match
  // an implant case study on the single word "teeth" — shared vocabulary
  // for a dental practice — and inherit "two visits" from it. Requiring a
  // score near the best match means an incidental word cannot drag an
  // unrelated entry in alongside a strong one.
  return entries.filter((_, i) => scores[i] >= best * cutoffRatio);
}

/**
 * The best-matching entry that actually has photos or video attached, or
 * null when nothing relevant does.
 *
 * Held to a far lower bar than ordinary relevance, on purpose. The
 * entries carrying images here are things like "Before and after (dental
 * implants)" — thirty-six characters, four words. Against a rarity-
 * weighted, length-normalised score they never clear a relative cutoff
 * set by a long descriptive page, so they were never offered as topics
 * and the assistant went five turns without once offering to show
 * anything. A before-and-after is among the most persuasive things this
 * business owns; it should not lose a scoring contest to prose.
 */
export function selectMediaEntry(
  userText: string,
  entries: KnowledgeEntryLike[]
): KnowledgeEntryLike | null {
  return rankMediaEntries(userText, entries)[0] ?? null;
}

/**
 * Every relevant entry that carries media, best match first.
 *
 * Ranked rather than reduced to one, so a caller can skip past entries
 * whose images have already been sent instead of giving up on the first
 * collision.
 */
export function rankMediaEntries(
  userText: string,
  entries: KnowledgeEntryLike[]
): KnowledgeEntryLike[] {
  if (entries.length === 0) return [];

  const scores = scoreEntries(userText, entries);
  const best = Math.max(...scores);
  if (best <= 0) return [];

  // Held well below the relevance cutoff so a short before-and-after can
  // still qualify, but not at zero: with no floor at all, a hair
  // transplant enquiry was offered photos of dental crowns, because the
  // hair entry is titled "Before and after" with no words to match and
  // anything scoring above nothing won by default.
  const floor = best * MEDIA_FLOOR_RATIO;

  return entries
    .map((entry, i) => ({ entry, score: scores[i] }))
    .filter(
      ({ entry, score }) => (entry.mediaUrls ?? []).length > 0 && score >= floor
    )
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

/** The same selection, flattened — used where only the text matters. */
export function selectRelevantKnowledge(
  userText: string,
  entries: KnowledgeEntryLike[]
): string {
  return selectRelevantEntries(userText, entries)
    .map((e) => `${e.title} ${e.content}`)
    .join(" ");
}

const CLOSING_CUES = [
  /\bteam will\b/i,
  /\bwill (?:review|be in touch|follow up|reach out|get back)\b/i,
  /\bbe in touch\b/i,
  /\bget back to you\b/i,
  /\bfollow up with you\b/i,
  /\breach out to you\b/i,
];

/**
 * Whether the assistant has already told them the team will follow up.
 *
 * Without this the close instruction fires again on every later turn, and
 * a visitor who keeps volunteering useful details gets the same sign-off
 * three times in a row, which reads as broken rather than polite.
 */
export function hasAlreadyClosed(history: ChatTurn[]): boolean {
  return history
    .filter((t) => t.role === "assistant")
    .some((t) => CLOSING_CUES.some((cue) => cue.test(t.content)));
}

export type CoverageGap = { id: string; need: string; because: string };

export type Coverage = {
  /** Dimensions that actually apply to this case. */
  relevant: string[];
  /** Of those, the ones the visitor has not addressed. */
  gaps: CoverageGap[];
};

/**
 * Which decision-relevant details apply here, and which are still missing.
 *
 * Relevance is judged from THIS CONVERSATION only — never from the
 * business's whole knowledge base. That distinction is the whole fix: the
 * knowledge base is a catalogue of everything the business can do, so a
 * clinic that offers implants (two visits) and airport transfers would
 * trigger travel questions on every conversation, including a walk-in
 * asking about a same-day whitening appointment. It did exactly that.
 *
 * The knowledge base still drives this, just transitively and correctly:
 * the assistant only says "two visits, four months apart" about a case
 * because the stored material told it so. Reading the assistant's words
 * scopes that knowledge to the person actually being spoken to.
 */
export function assessCoverage(
  history: ChatTurn[],
  entries: KnowledgeEntryLike[] = []
): Coverage {
  const assistantText = history
    .filter((t) => t.role === "assistant")
    .map((t) => t.content)
    .join(" ");
  const userText = history
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join(" ");

  // What the work involves: how the assistant has described it, plus what
  // the business's own material says about the thing the visitor asked
  // for. Either alone leaves a hole — see selectRelevantKnowledge.
  const caseText = `${assistantText} ${selectRelevantKnowledge(userText, entries)}`;

  const relevantDimensions = COVERAGE_DIMENSIONS.filter((d) => {
    const subject = d.source === "user" ? userText : caseText;
    return d.trigger.test(subject);
  });

  return {
    relevant: relevantDimensions.map((d) => d.id),
    gaps: relevantDimensions
      .filter((d) => !d.covered.test(userText))
      .map(({ id, need, because }) => ({ id, need, because })),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Engagement, significance, and what is still worth telling them
//
// Everything above this point is a brake. That imbalance was itself the
// bug: with only brakes, the assistant became a well-mannered form —
// polite, responsive, and completely uninteresting. A visitor who had
// lost all his teeth, showed no impatience and no urgency, was asked
// which month, how many days, and about health conditions, one after the
// other, and was never told a single thing about the clinic worth
// remembering.
//
// The product's whole premise is that the visitor should feel familiar
// with THIS business by the time a person calls them. Collecting a phone
// number well is a lead form. So the signals below exist to answer the
// opposite question from the ones above: is this person relaxed and
// curious, does their case warrant building real confidence, and what is
// there left to tell them?
// ─────────────────────────────────────────────────────────────────────

const RECEPTIVE_CUES = [
  /\b(?:sounds?|looks?) (?:good|great|interesting|promising)\b/i,
  /\b(?:that'?s |very |really )?(?:interesting|helpful|reassuring|impressive|amazing|great|good to know)\b/i,
  /\btell me more\b/i,
  /\bi'?d like to (?:know|hear|see)\b/i,
  /\b(?:yes|yeah|sure|ok|okay|perfect|nice|wow)\b/i,
  /\bwhat about\b/i,
  /\bhow (?:do|does|long|many)\b/i,
];

/** A message long enough that they are explaining rather than acknowledging. */
const ELABORATION_CHARS = 55;

export type EngagementSignal = {
  engaged: boolean;
  reasons: string[];
};

/**
 * Whether the visitor is relaxed and interested — the mirror of
 * detectImpatience, and the signal the system was missing entirely.
 *
 * Requires the absence of every brake: someone who is frustrated or
 * stepping back is not "engaged" however long their message is. That
 * mutual exclusion is what stops the accelerator and the brakes from
 * both firing on the same turn.
 */
export function detectEngagement(history: ChatTurn[]): EngagementSignal {
  const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
  if (userMessages.length === 0) return { engaged: false, reasons: [] };

  if (detectImpatience(history).impatient || detectHesitation(history).hesitating) {
    return { engaged: false, reasons: [] };
  }

  const latest = userMessages[userMessages.length - 1];
  const recent = userMessages.slice(-3);
  const reasons: string[] = [];

  if (recent.some((m) => m.includes("?"))) {
    reasons.push("they are asking questions back");
  }
  if (recent.some((m) => m.trim().length >= ELABORATION_CHARS)) {
    reasons.push("they are explaining their situation rather than replying in one word");
  }
  if (RECEPTIVE_CUES.some((cue) => cue.test(latest))) {
    reasons.push("their replies are receptive");
  }

  return { engaged: reasons.length > 0, reasons };
}

// Generic markers that a decision is a big one. Deliberately not a list
// of treatments: work that runs over stages, involves a procedure, or
// carries a long guarantee is a significant commitment in any industry —
// a full house rewire reads the same way as a full-mouth reconstruction.
const SIGNIFICANCE_IN_MATERIAL = [
  MULTI_STAGE,
  /\b(?:surgery|surgical|surgically|anesthe|anaesthe|sedation|procedure)\b/i,
  /\b(?:lifetime|\d{2}[- ]year|\d{2} years?) (?:guarantee|warranty)\b/i,
  /\b(?:package|financing|instal?ments?|investment)\b/i,
];

// Scale language from the visitor themselves.
const SIGNIFICANCE_FROM_VISITOR =
  /\b(?:all|full|whole|entire|complete|everything|both)\b|\b(?:\d{1,2})\s+(?:teeth|units|rooms|items|pieces)\b/i;

export type CaseSignificance = "standard" | "significant";

/**
 * How much confidence this case warrants building before logistics.
 *
 * A whitening enquiry and a full reconstruction should not get the same
 * treatment: one is a small booking, the other is a decision someone will
 * think about for weeks and discuss with their family.
 */
export function assessCaseSignificance(
  history: ChatTurn[],
  entries: KnowledgeEntryLike[]
): CaseSignificance {
  const userText = history
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join(" ");
  const assistantText = history
    .filter((t) => t.role === "assistant")
    .map((t) => t.content)
    .join(" ");

  const material = `${assistantText} ${selectRelevantKnowledge(userText, entries)}`;

  let score = SIGNIFICANCE_IN_MATERIAL.filter((p) => p.test(material)).length;
  if (SIGNIFICANCE_FROM_VISITOR.test(userText)) score += 1;

  return score >= 2 ? "significant" : "standard";
}

/**
 * Topics relevant to this visitor that the assistant has NOT yet drawn
 * on, as their titles.
 *
 * The direct counterpart to offer de-duplication. That tells the model
 * what it has already said so it stops repeating; this tells it what it
 * still has, so it has something to say. Without it the assistant runs
 * out of material and falls back to asking questions.
 */
/** How close to the best overall match a media entry must score to be offered. */
const MEDIA_FLOOR_RATIO = 0.35;

/** Length-normalisation floor — see the scoring comment above. */
const MIN_ENTRY_WORDS = 25;

const ACCEPTANCE_CUES = [
  /^\s*(?:yes|yeah|yep|sure|ok|okay|please|go on|why not)\b/i,
  /\byes please\b/i,
  /\b(?:i'?d|i would) (?:love|like) to (?:see|have a look)\b/i,
  /\b(?:show|send) (?:me|it|them|that)\b/i,
  /\blet'?s see\b/i,
  /\bplease do\b/i,
  /\bthat would be (?:great|good|helpful)\b/i,
];

/**
 * Whether the visitor has just said yes to something the assistant
 * offered to show them.
 *
 * Computed rather than left to judgement for the same reason as
 * everything else here: told only "send it if they asked", the assistant
 * replied "Here you go — take a look!" with nothing attached, because it
 * had described a case that has no photo and then had no URL to send.
 */
export function visitorAcceptedOffer(history: ChatTurn[]): boolean {
  const lastUserIndex = history.map((t) => t.role).lastIndexOf("user");
  if (lastUserIndex < 1) return false;

  const latest = history[lastUserIndex].content;
  if (!ACCEPTANCE_CUES.some((cue) => cue.test(latest.trim()))) return false;

  // The offer has to have been the thing immediately before it.
  const priorAssistant = history
    .slice(0, lastUserIndex)
    .reverse()
    .find((t) => t.role === "assistant");
  if (!priorAssistant) return false;

  return OFFER_CUES.some((cue) => cue.test(priorAssistant.content));
}

/**
 * The media to attach when the visitor has accepted an offer but the
 * model produced no usable tag.
 *
 * This exists because three separate attempts to fix the problem with
 * instructions all failed in live testing: the assistant would describe a
 * case that has no photo, offer to show it, and then answer "here you go
 * — take a look!" with nothing attached. A visitor who says yes and
 * receives an empty promise is worse off than one who was never offered
 * anything, and no amount of emphasis in the prompt changed it.
 *
 * Returns null when nothing relevant has media, so a conversation about
 * something the business has no pictures of still sends nothing.
 */
export function pickMediaForAcceptance(
  history: ChatTurn[],
  entries: KnowledgeEntryLike[],
  alreadySent: ReadonlySet<string> = new Set()
): string | null {
  const userText = history
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join(" ");

  for (const entry of rankMediaEntries(userText, entries)) {
    const unsent = (entry.mediaUrls ?? []).find((url) => !alreadySent.has(url));
    if (unsent) return unsent;
  }

  // Everything relevant has been shown already. Sending nothing is
  // correct here — repeating a picture they have seen is worse than the
  // reply simply not carrying one.
  return null;
}

// Phrases that promise the visitor is about to see something. These are
// what the assistant writes when it believes it is sending an image.
const IMAGE_PROMISE_CUES = [
  // "Here's" is one word — an earlier version required a space after
  // "here" and missed every contraction, which is the most common way
  // the assistant actually introduces a picture.
  /\bhere'?s\b/i,
  /\bhere (?:you go|it is|are)\b/i,
  /\b(?:take|have) a look\b/i,
  /\bas you can see\b/i,
  /\bthis is (?:her|his|their|the) (?:result|before|case|smile)\b/i,
  /\bbelow (?:is|you)\b/i,
];

/**
 * Whether a reply promises a picture without one attached.
 *
 * This, not "the visitor said yes", is the precise failure: the assistant
 * writes "Here you go — take a look!" and sends nothing. Keying the
 * fallback on acceptance instead re-sent the same image on the following
 * turn, attached to a reply about something else entirely.
 */
export function promisesImageWithoutSending(reply: string): boolean {
  return IMAGE_PROMISE_CUES.some((cue) => cue.test(reply));
}

export type UnsharedTopic = { title: string; mediaUrls: string[] };

export function findUnsharedTopics(
  history: ChatTurn[],
  entries: KnowledgeEntryLike[],
  limit = 5
): UnsharedTopic[] {
  const userText = history
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join(" ");
  const assistantText = history
    .filter((t) => t.role === "assistant")
    .map((t) => t.content)
    .join(" ");

  const relevant = selectRelevantEntries(userText, entries);
  if (relevant.length === 0) return [];

  const saidWords = contentWords(assistantText);

  const isUnshared = (entry: KnowledgeEntryLike) => {
    // An entry counts as already used when the assistant has echoed a
    // meaningful share of its distinctive wording.
    const words = Array.from(contentWords(`${entry.title} ${entry.content}`)).filter(
      (w) => !CONVERSATIONAL_FILLER.has(w)
    );
    if (words.length === 0) return false;
    return words.filter((w) => saidWords.has(w)).length / words.length < 0.3;
  };

  const unshared = relevant.filter(isUnshared);

  // A relevant entry with images is added even when it scored below the
  // relevance cutoff, because those entries are short and lose to prose
  // on score — see selectMediaEntry. Put first: it is the strongest thing
  // available to show someone.
  const mediaEntry = selectMediaEntry(userText, entries);
  const ordered =
    mediaEntry && isUnshared(mediaEntry) && !unshared.includes(mediaEntry)
      ? [mediaEntry, ...unshared]
      : [...unshared].sort(
          (a, b) => (b.mediaUrls ?? []).length - (a.mediaUrls ?? []).length
        );

  return ordered
    .filter((e) => e.title)
    .slice(0, limit)
    .map((e) => ({ title: e.title, mediaUrls: e.mediaUrls ?? [] }));
}

const LOGISTICS_QUESTION =
  /\b(?:when|which month|what month|how long|how many days|dates?|stay|travel|travelling|flying|coming|health conditions?|medications?|allergies)\b/i;

/**
 * How many of the assistant's last three replies ended in a logistics
 * question.
 *
 * This is the brake on the brakes. Three of these in a row is exactly
 * what turned a high-value conversation into an intake form, and it is
 * plainly countable — so it is counted rather than discouraged.
 */
export function countRecentLogisticsQuestions(history: ChatTurn[]): number {
  return history
    .filter((t) => t.role === "assistant")
    .slice(-3)
    .filter((t) => t.content.includes("?") && LOGISTICS_QUESTION.test(t.content)).length;
}

/**
 * Whether closing has become likely — contact details given, or a photo
 * sent. This is the moment the coverage check has to bite, and it is
 * exactly where it failed: the assistant wrapped up as soon as a photo
 * arrived.
 */
export function isNearingClose(history: ChatTurn[]): boolean {
  if (hasContactDetails(history)) return true;
  return history.some((t) => t.role === "user" && t.content.includes("[Photo attached:"));
}

/**
 * The per-turn state block appended to the system prompt, or null when
 * there is nothing worth saying.
 *
 * This must be appended AFTER the cached prefix, never inside it: it
 * changes on every turn, so folding it into the cached block would
 * invalidate the cache on every message and undo the saving that caching
 * exists for.
 */
/** Enough exchange to have understood the case, so a number given early can't trigger a close. */
const MIN_TURNS_BEFORE_CLOSING = 3;

export function buildConversationStateBlock(
  history: ChatTurn[],
  entries: KnowledgeEntryLike[] = [],
  /** URLs already shown to this visitor, so exhausted media is not promised again. */
  alreadySent: ReadonlySet<string> = new Set()
): string | null {
  const offers = extractPriorOffers(history);
  const impatience = detectImpatience(history);
  const hesitation = detectHesitation(history);
  const engagement = detectEngagement(history);
  const contactKnown = hasContactDetails(history);
  const alreadyClosed = hasAlreadyClosed(history);
  const userTurns = history.filter((t) => t.role === "user").length;

  const significance = assessCaseSignificance(history, entries);
  const unshared = engagement.engaged ? findUnsharedTopics(history, entries) : [];
  const logisticsRun = countRecentLogisticsQuestions(history);
  const accepted = visitorAcceptedOffer(history);

  // Interest-building applies only while the visitor is receptive: the
  // brakes above take precedence, and detectEngagement already returns
  // false whenever one of them is active.
  const shouldBuildInterest = engagement.engaged && unshared.length > 0 && !alreadyClosed;

  // Coverage is suppressed while they are hesitating: chasing case
  // details from someone stepping back is exactly the pressure the
  // hesitation rules exist to prevent.
  const checkCoverage = isNearingClose(history) && !hesitation.hesitating;
  const { gaps } = checkCoverage
    ? assessCoverage(history, entries)
    : { gaps: [] as CoverageGap[] };

  // Nothing left to establish, and the lead is reachable. Silence here is
  // not neutral — left without an instruction the assistant filled the
  // space by pitching the implant brand again and offering another photo,
  // after everything had already been captured.
  const readyToClose =
    checkCoverage &&
    gaps.length === 0 &&
    contactKnown &&
    userTurns >= MIN_TURNS_BEFORE_CLOSING;

  if (
    offers.length === 0 &&
    !impatience.impatient &&
    !hesitation.hesitating &&
    gaps.length === 0 &&
    !readyToClose &&
    !shouldBuildInterest
  ) {
    return null;
  }

  const lines: string[] = ["CONVERSATION STATE (computed, this turn only)"];

  if (offers.length > 0) {
    lines.push(
      "",
      "You have ALREADY made these offers in this conversation:",
      ...offers.map((o) => `  • "${o}"`),
      "",
      // Polarity flips with engagement. For a receptive visitor "offer
      // nothing" is the wrong default — it is how the assistant ran out
      // of things to say and fell back to interrogating.
      engagement.engaged
        ? "Do not make any of these offers again — they have been heard. Offer something DIFFERENT instead: there is more below that you have not shown them yet."
        : "Do not make any of these offers again. They have been heard. If the visitor wanted to take one up, they would have. Offer something different, or — more often the better choice — offer nothing and simply continue the conversation."
    );
  }

  // ── The accelerator ────────────────────────────────────────────────
  if (shouldBuildInterest) {
    lines.push(
      "",
      `The visitor is engaged, not impatient: ${engagement.reasons.join("; ")}.`,
      "You have NOT yet told them about:",
      ...unshared.map(
        (topic) =>
          `  • ${topic.title}${topic.mediaUrls.length ? "   [HAS PHOTOS]" : ""}`
      ),
      "",
      "Share one of these now, using the specific facts, numbers and names given to you below rather than a generic summary.",
      "The point of this conversation is that by the time someone from the business calls, this person already feels they know it — its people, its experience, its results, what is included. Someone who only handed over a phone number has been processed, not won."
    );

    // Marked separately and emphatically. A general "offer media where it
    // exists" line produced five turns without a single offer, because
    // nothing told the model which topics actually had anything to show.
    // Only count media they have not already been shown. Everything else
    // is spent, and offering it again would either repeat a picture or
    // promise one that never arrives.
    const withMedia = unshared
      .map((topic) => ({
        ...topic,
        mediaUrls: topic.mediaUrls.filter((url) => !alreadySent.has(url)),
      }))
      .filter((topic) => topic.mediaUrls.length > 0);

    const mediaExhausted =
      alreadySent.size > 0 &&
      withMedia.length === 0 &&
      rankMediaEntries(
        history.filter((h) => h.role === "user").map((h) => h.content).join(" "),
        entries
      ).every((entry) =>
        (entry.mediaUrls ?? []).every((url) => alreadySent.has(url))
      );

    if (mediaExhausted) {
      lines.push(
        "",
        "You have already shown this visitor every photo available for what they are asking about. Do NOT offer, promise or refer to another image — there is nothing left to send, and saying \"here's another\" produces a message with no picture in it. Describe results in words instead."
      );
    }
    if (withMedia.length > 0) {
      lines.push(
        "",
        "IMPORTANT — real images are available, and they are among the most persuasive things this business has. Seeing an actual result does more to build confidence than any description of one.",
        ...withMedia.map(
          (topic) =>
            `  • ${topic.title}
      send with: [[MEDIA:${topic.mediaUrls[0]}]]`
        ),
        accepted
          ? "THEY HAVE JUST SAID YES to seeing something. This reply MUST end with the exact tag above — copy it character for character. Saying \"here you go\" or \"take a look\" without the tag sends nothing at all and leaves them staring at a message with no image in it. Do not offer again, do not describe the picture instead, and do not change the subject."
          : "Offer to show them in this reply — naturally, as part of what you are telling them, not as a question tacked on the end.",
        "When you want to show a result, talk about THE ITEM LISTED ABOVE — it is the one that actually has an image. Describing a different case and offering to show a photo of it leaves you with nothing to send when they accept, which is exactly what happened before this instruction existed.",
        "Use ONLY a URL listed above or in the business information below, copied exactly. Never write an empty tag and never invent a URL: if you have no URL for the thing you are describing, describe it in words and offer the item you DO have a URL for instead."
      );
    }

    if (significance === "significant") {
      lines.push(
        "This is a significant decision for them, not a small booking. Build real confidence before pressing for logistics — a case of this size deserves it."
      );
    }
  }

  if (logisticsRun >= 2) {
    lines.push(
      "",
      `Your last ${logisticsRun} replies each ended in a logistics question — dates, length of stay, health, travel. Do not ask another one in this reply. Tell them something worth knowing about the business instead, and let the next detail come up naturally afterwards.`
    );
  }

  if (impatience.impatient) {
    lines.push(
      "",
      `The visitor appears impatient or frustrated: ${impatience.reasons.join("; ")}.`,
      "For this reply: answer what they actually asked, directly and first. Do not ask a new question, do not introduce a new topic, do not mention any other service, and do not make an offer. If you genuinely cannot answer, say so plainly and tell them you will have the team confirm it — do not deflect into something else."
    );
  }

  // Hesitation. Three outcomes, and which one applies is a fact rather
  // than a judgement call, so it is decided here and stated plainly.
  if (hesitation.hesitating) {
    if (hesitation.occurrences > 1) {
      lines.push(
        "",
        "The visitor has now expressed hesitation more than once. They have heard everything they need. Acknowledge warmly, thank them, make no offer, ask no question, and end your message. Do not try again — a second attempt after a second hesitation reads as pressure and loses the goodwill you still have."
      );
    } else if (contactKnown) {
      lines.push(
        "",
        "The visitor is hesitating, and they have ALREADY given contact details. The lead is safe and the team can follow up, so there is nothing left to secure. Acknowledge it genuinely, tell them there is no rush, and confirm the team will be there when they are ready. No pitch, no facts, no offer, no question. End your message there."
      );
    } else {
      lines.push(
        "",
        "The visitor is hesitating and has NOT given any contact details yet. This is the one moment where backing off silently loses them entirely — there would be no way to reach them again.",
        "Make exactly ONE gentle attempt, in this reply only. It must be a concrete, low-commitment offer whose natural result is them sharing a WhatsApp number or equivalent — for example inviting them to send a photo so the team can prepare a no-obligation assessment and send it over whenever they are ready.",
        "FORBIDDEN in this reply: restating the business's credentials, experience or years in operation; listing benefits again; repeating any offer already made; asking what is holding them back; or pressing them to decide. They have already closed mentally, and answering hesitation with a re-pitch is the single worst response available. Keep it short, warm, and free of any obligation."
      );
    }
  }

  if (readyToClose && alreadyClosed) {
    // They are still talking after the hand-off line. Repeating it is
    // what made three identical sign-offs in a row.
    lines.push(
      "",
      "You have ALREADY told them the team will follow up, and they are still sharing useful details. Do not say it again — repeating a closing line every turn reads as broken.",
      "Simply acknowledge what they have just told you, briefly and warmly, in a way that shows you registered the specific thing they said. One or two sentences. No closing line, no new information, no offer, no question."
    );
  } else if (readyToClose) {
    lines.push(
      "",
      "Everything the team needs for this case is now captured, and you have a way to reach them. Close the conversation warmly in this reply: thank them, tell them the team will review it and follow up, and end there.",
      "This overrides the checklist: it does NOT matter that categories remain uncovered. The conversation is finished. Do not say you want to share a few things first, and do not work through anything further.",
      "FORBIDDEN in this reply: introducing any new fact about the business, naming brands or warranties, mentioning another service, making any offer including showing a photo or video, or asking another question. There is nothing left to gather, so anything you add now is a pitch to someone who has already agreed — it reads as selling and it is the wrong note to end on."
    );
  }

  if (gaps.length > 0) {
    const next = gaps[0];
    lines.push(
      "",
      "This conversation is close to the point of handing over to the team, but the case is NOT yet complete. Still missing:",
      ...gaps.map((g) => `  • ${g.need}`),
      "",
      `Do NOT wrap up, close, or say the team will follow up until these are covered. The next one to establish is ${next.need}, because ${next.because}.`
    );

    // How to ask depends entirely on the visitor. Interrogating an
    // engaged person is what made a high-value conversation read like an
    // intake form; drawing it out for someone impatient is worse.
    if (shouldBuildInterest) {
      lines.push(
        "Do not ask it on its own as a bare logistics question, and never ask two such questions in a row. Lead with something worth knowing from the list above, then let the question follow naturally from it — the detail is easier to give when it is clear why it matters."
      );
    } else {
      lines.push(
        "Ask it as one natural question, not a list, and not alongside anything else."
      );
    }
  }

  return lines.join("\n");
}
