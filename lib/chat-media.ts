// ─────────────────────────────────────────────────────────────────────
// Media: one decision, made by the server, before the model writes.
//
// This replaces roughly seventeen interacting rules — promise detection,
// offer-versus-delivery, tag parsing, plan-overrides-tag, relevance
// ranking, cross-entry fallback — that existed only to reconcile two
// actors who could not see each other. The model decided what to write
// and could emit its own media tag; the server decided what to attach.
// Every rule was a translation layer between them, each new one broke an
// older case, and it was not converging.
//
// Now the server decides alone and the model has no way to send anything
// at all. The rule is deliberately conservative:
//
//   send an image ONLY when the visitor has just accepted a specific
//   offer, or has directly asked to see something, AND an entry with
//   media confidently matches what was asked for, AND that entry has an
//   image not yet shown in this conversation.
//
// Everything else sends nothing, and sending nothing is the normal case.
// The previous design behaved as though it were obliged to find an image,
// so when the right one was unavailable it substituted whatever else
// scored highest — which is how a Hollywood-smile photo reached a
// full-mouth implant patient. An unrelated image is far worse than no
// image, so the dedupe step below never falls through to another entry.
// ─────────────────────────────────────────────────────────────────────

import {
  ACCEPTANCE_CUES,
  CONVERSATIONAL_FILLER,
  OFFER_CUES,
  contentWords,
  sentencesOf,
  type ChatTurn,
} from "./conversation-state";

/** A knowledge entry as the media decision needs it. */
export type MediaCandidate = {
  title: string;
  content: string;
  media: { url: string; type: string | null }[];
};

export type MediaDecision =
  | {
      send: true;
      url: string;
      type: string | null;
      /** What the image depicts, so the reply can introduce it. */
      title: string;
      /**
       * Other entries from the same offer that still have an unshown
       * image, so the reply can offer one of them next.
       *
       * Only populated when the visitor accepted ALL of a multi-option
       * offer. One image goes per reply; without this the model is told
       * about one picture while the visitor plainly asked for two, and
       * that contradiction is what it narrates aloud.
       */
      alsoAvailable: string[];
      reason: "accepted-offer" | "direct-request";
    }
  | {
      send: false;
      reason: "no-request" | "no-media" | "no-confident-match" | "already-shown";
    };

/**
 * Whether an assistant sentence offers to show the visitor something.
 *
 * OFFER_CUES enumerates the phrasings the assistant reliably produces,
 * and on its own it is not enough — the model invents new ones freely.
 * "Would it help to see some before and after photos of implant cases
 * we've done?" matched nothing, so an unmistakable offer followed by an
 * unmistakable "yes" was classified as no request at all. Adding that one
 * phrasing to the list would have bought a week.
 *
 * So there is a general rule behind the list: a question that invites the
 * visitor to LOOK at something is an offer, whatever words it uses.
 *
 * The viewing verbs are what keep this honest. "Could you send a photo of
 * your teeth?" is a question about photographs, but the visitor is the
 * one sending and the clinic is the one looking, so it is not an offer
 * and accepting it must not attach anything.
 */
function isOfferSentence(sentence: string): boolean {
  if (OFFER_CUES.some((cue) => cue.test(sentence))) return true;
  // "?" or "!": "I would love to show you our before-and-afters!" is an
  // offer in every sense that matters. Punctuation is not the signal —
  // the viewing verb is, and a false positive still has to clear the
  // title-match bar before anything is sent.
  return (
    /[?!]\s*$/.test(sentence.trim()) &&
    // Who is doing the showing decides this. "show you" is an offer;
    // "show me a photo of your teeth" is the clinic asking the visitor
    // for one, and accepting that must not attach anything.
    (/\b(?:see|view|look at|looking at)\b/i.test(sentence) ||
      /\b(?:show|send) you\b/i.test(sentence))
  );
}

/** Ways a visitor asks to see something without having been offered it. */
const DIRECT_REQUEST_CUES = [
  /\b(?:can|could|may) i see\b/i,
  /\b(?:can|could) you (?:show|send)\b/i,
  /\bshow me\b/i,
  /\bsend me\b/i,
  /\bdo you have (?:any )?(?:photos?|pictures?|images?|examples?)\b/i,
  /\bany (?:photos?|pictures?|images?|befores?)\b/i,
  /\bi(?:'d| would) like to see\b/i,
  /\blet me see\b/i,
];

/**
 * Taking up an entire multi-option offer rather than choosing from it.
 *
 * "Both" is not ambiguity, it is agreement, and the two must not be
 * treated alike. When a visitor names one thing and several entries could
 * be it, we genuinely do not know which they meant and sending anything
 * is a guess — that is how a Hollywood-smile case reached a full-mouth
 * implant patient. When they say "both", every option is one they asked
 * for, so there is no wrong choice among them.
 *
 * Conflating the two is what produced the worst failure in this system:
 * "both" was classified as no request at all, the model understood
 * perfectly well that it had been accepted, and it narrated the
 * contradiction to the visitor along with the whole state block.
 */
const ACCEPT_ALL_CUES = [
  /^\s*(?:both|all|either|any)\b/i,
  /\ball of (?:them|those)\b/i,
  /\bboth (?:please|of them|would be)\b/i,
  /\beverything\b/i,
];

/**
 * What the visitor is asking to be shown, or null when they are not.
 *
 * Acceptance is tested first: "show me" is both an acceptance and a
 * direct request, and when an offer is on the table it is the offer that
 * defines the subject.
 */
function findMediaRequest(history: ChatTurn[]): {
  texts: string[];
  reason: "accepted-offer" | "direct-request";
  /** They took the whole offer, so any of its entries is one they asked for. */
  acceptedAll: boolean;
} | null {
  const lastUserIndex = history.map((h) => h.role).lastIndexOf("user");
  if (lastUserIndex < 0) return null;

  const latest = history[lastUserIndex].content;

  const prior = history
    .slice(0, lastUserIndex)
    .reverse()
    .find((h) => h.role === "assistant");

  const offerSentences = prior ? sentencesOf(prior.content).filter(isOfferSentence) : [];

  // An offer can be taken up by naming part of it rather than by saying
  // yes. "Would you like to see the crowns we use?" answered with "the
  // crowns" is an acceptance that no cue list recognises, and the visitor
  // who answered a two-option offer with "the brands" got four turns of
  // promises instead of a picture.
  //
  // One condition: the reply must REFER to the offer by sharing a real
  // word with it. That is what stops this swallowing a change of subject
  // — "how much does it cost?" after the same offer shares nothing, so
  // the offer is not treated as taken up and no photo goes to someone who
  // asked about price.
  const offeredWords = contentWords(offerSentences.join(" "));
  const saidWords = Array.from(contentWords(latest)).filter(
    (w) => !CONVERSATIONAL_FILLER.has(w)
  );
  const refersToOffer = offeredWords.size > 0 && saidWords.some((w) => offeredWords.has(w));

  // A NAMED selection narrows the offer; a bare "yes" accepts all of it.
  //
  // These cannot share a code path. "Would you like to see some before
  // and after photos, or the implant/crown brands we use?" answered with
  // "the brands" resolved, on the offer sentence, to a before-and-after —
  // because the offer names before-and-afters too. The visitor said which
  // half they wanted and got the other one, which is the same mismatch
  // this module exists to prevent. When they name something, their words
  // ARE the request and the offer is not consulted.
  // Taking the whole offer. Checked before the narrowing rule below,
  // because "both" would otherwise be read as naming something.
  if (offerSentences.length > 0 && ACCEPT_ALL_CUES.some((cue) => cue.test(latest.trim()))) {
    return { texts: [offerSentences.join(" ")], reason: "accepted-offer", acceptedAll: true };
  }

  if (refersToOffer && !ACCEPTANCE_CUES.some((cue) => cue.test(latest.trim()))) {
    return { texts: [latest], reason: "accepted-offer", acceptedAll: false };
  }

  if (ACCEPTANCE_CUES.some((cue) => cue.test(latest.trim()))) {
    if (offerSentences.length > 0 && prior) {
      // Narrowest first, then the whole message, and the caller stops at
      // the first one that resolves confidently.
      //
      // The OFFER SENTENCE has to come first, because a reply that
      // described crowns at length and then added "I can show you a
      // before-and-after" overlaps the crowns entry far more than the
      // before-and-after one, and matching the whole message is how the
      // wrong photo used to be chosen.
      //
      // But the offer sentence alone is not always enough to identify
      // anything. Offers are frequently anaphoric — "we use Straumann
      // zirconia crowns... would you like to see what THEY look like up
      // close?" — where the pronoun carries the subject and the sentence
      // holding the offer contains nothing matchable at all. Narrow-only
      // matching answered that acceptance with no image and an apology.
      // So the surrounding message is kept as a fallback, consulted only
      // when the offer sentence resolves to nothing.
      const texts = [offerSentences.join(" ")];
      if (prior.content.trim() !== texts[0].trim()) texts.push(prior.content);
      return { texts, reason: "accepted-offer", acceptedAll: false };
    }
    // "Yes" with nothing on the table is not a request for anything.
  }

  // Or they asked directly, unprompted. Their own words are all there is.
  if (DIRECT_REQUEST_CUES.some((cue) => cue.test(latest))) {
    return { texts: [latest], reason: "direct-request", acceptedAll: false };
  }

  return null;
}

/**
 * How much of what was asked for a given entry actually covers, 0..2.
 *
 * Two rules, and the first one is the one that matters.
 *
 * ONE: the request must name something in the entry's TITLE. The title is
 * what the owner wrote to say what this entry is, so a request that does
 * not touch it is not a request for this entry — whatever the body text
 * happens to mention in passing. This is what stops "can I see a photo of
 * your clinic building?" from being answered with a before-and-after on
 * the strength of the word "clinic" appearing in its description.
 *
 * TWO: of the words we can actually judge, how many does this entry
 * cover, weighted by rarity, with title hits counting double.
 *
 * Words absent from the entire catalogue are dropped rather than counted
 * against the match. Counting them was a mistake that made the score a
 * measure of how WORDY the request was: the same offer scored 1.067 as
 * "I can show you a before-and-after" and 0.267 as "would you like to see
 * some before and after photos from patients who've had similar full-arch
 * work done?", because every unmatchable extra word voted at full weight
 * against it. The assistant's verbosity varies freely from turn to turn,
 * so no threshold could survive that. A word nothing in the catalogue
 * contains is evidence about the catalogue, not about this entry.
 */
function matchStrength(
  requestText: string,
  entry: MediaCandidate,
  documentFrequency: Map<string, number>,
  corpusSize: number
): number {
  const titleWords = contentWords(entry.title);
  const allWords = contentWords(`${entry.title} ${entry.content}`);

  const requestWords = Array.from(contentWords(requestText)).filter(
    (w) => !CONVERSATIONAL_FILLER.has(w) && (documentFrequency.get(w) ?? 0) > 0
  );
  if (requestWords.length === 0) return 0;

  // Smoothed so a single-entry catalogue still produces non-zero weights.
  const idf = (word: string) =>
    Math.log(1 + corpusSize / (documentFrequency.get(word) ?? 1));

  let matched = 0;
  let total = 0;
  let touchedTitle = false;
  for (const word of requestWords) {
    const weight = idf(word);
    total += weight;
    if (titleWords.has(word)) {
      matched += weight * 2;
      touchedTitle = true;
    } else if (allWords.has(word)) {
      matched += weight;
    }
  }

  if (!touchedTitle || total === 0) return 0;

  // Not capped. Clamping made two entries tie at the cap, and the winner
  // became whichever was evaluated first.
  return matched / total;
}

/**
 * Confidence required before any image is sent.
 *
 * Secondary. The real safety property is the title rule in matchStrength:
 * a request that does not name something in an entry's title scores a
 * flat zero, and across a real 23-entry catalogue every request that
 * should send nothing — "would you like to see some examples?", "can I
 * see your price list?", "a photo of your clinic building?", "what they
 * actually look like up close?" — scores exactly 0.000. Every request
 * that should send something scores 0.41 or above.
 *
 * Both suites therefore pass at every value from 0.10 to 0.50, which
 * means they do not pin this number and it should not be read as though
 * they do. It is set from the measured distribution: clear of zero, so a
 * title hit on a single very common word is not enough on its own, and
 * well under the weakest genuine match observed.
 */
export const MEDIA_MATCH_THRESHOLD = 0.25;

/**
 * How far ahead the best entry must be before we believe it was the one
 * meant.
 *
 * Two entries can score identically on the only informative word in the
 * request — "want to take a look at the implants themselves?" matches
 * "Before and after ( dental implants )" and "We use Implant Swiss dental
 * implants" exactly equally, because "implants" is in both titles. With
 * no margin the winner was whichever came first out of the database,
 * which is not a decision, it is a coin flip with a stable seed.
 *
 * An unrelated image is far worse than no image, so a tie does not resolve
 * to a guess. It falls through to the conversation-topic tie-break in
 * decideMedia, and if that cannot separate them either, nothing is sent.
 *
 * The sweep could not discriminate between 1.0 and 1.6 here, because the
 * collisions in real data are EXACT ties rather than near ones. This is
 * set for headroom instead: comfortably above 1.0 so floating-point and
 * near-identical entries are caught, and well below the 1.92x gap of the
 * narrowest genuine win observed.
 */
export const MEDIA_AMBIGUITY_MARGIN = 1.15;

/**
 * Every entry that has media, scored against the request, best first.
 *
 * Exported because the threshold and the margin above are calibrated
 * against real catalogues rather than guessed, and a calibration tool that
 * reimplements the scoring is a calibration tool that drifts out of step
 * with the thing it is calibrating.
 */
export function rankByRequest(
  requestText: string,
  entries: MediaCandidate[]
): { entry: MediaCandidate; score: number }[] {
  // Every entry is scored, including those with no photo. Callers filter.
  // Entries without media still matter: they are how we tell "this asks
  // for something we simply have no picture of" apart from "this asks for
  // nothing identifiable at all", and those two cases are handled
  // differently in decideMedia.
  const documentFrequency = new Map<string, number>();
  for (const entry of entries) {
    Array.from(contentWords(`${entry.title} ${entry.content}`)).forEach((word) => {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    });
  }

  return entries
    .map((entry) => ({
      entry,
      score: matchStrength(requestText, entry, documentFrequency, entries.length),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * The entire media decision, as a pure function of the conversation, the
 * entries, and what has already been shown.
 *
 * Pure on purpose. The previous design could only be checked by replaying
 * conversations, where the model's wording varies run to run — two runs
 * passed by luck and hid real defects underneath. Every branch here is
 * reachable from a fixture.
 */
/**
 * The single entry a request confidently identifies, or null.
 *
 * Null means "we cannot say", and it is not a failure — it is the answer
 * for anything vague, and it is by far the most common one.
 */
function resolveEntry(
  requestText: string,
  entries: MediaCandidate[],
  history: ChatTurn[],
  /**
   * The visitor took the whole offer rather than choosing from it.
   *
   * This changes one thing only: what happens when nothing can separate
   * the candidates. Normally that means we cannot tell which was meant
   * and nothing is sent. When every candidate is one they asked for,
   * silence is the wrong answer and the strongest match goes instead.
   *
   * Every other guard stays on, the conversation-topic tie-break above
   * all. Accepting everything settles which OPTION was wanted; it says
   * nothing about which of three entries titled "Before and after" is the
   * right one, and treating it as though it did is how a Hollywood-smile
   * case reached a full-mouth implant patient the first time.
   */
  acceptedAll = false
): { entry: MediaCandidate | null; namedSomething: boolean; alsoMatched: MediaCandidate[] } {
  const all = rankByRequest(requestText, entries);

  // Whether this text picks out a subject in the catalogue, photo or not.
  // Distinct from whether we can confidently attach an image to it.
  //
  // Held to the same bar as a match, because any score above zero is far
  // too twitchy for this: an anaphoric offer ("what they actually look
  // like up close") brushes some incidental word in some entry, and that
  // was enough to count as naming a subject and block the fallback it
  // depends on.
  const namedSomething = (all[0]?.score ?? 0) >= MEDIA_MATCH_THRESHOLD;
  const none = { entry: null, namedSomething, alsoMatched: [] as MediaCandidate[] };

  const ranked = all.filter((r) => r.entry.media.length > 0);
  const [top] = ranked;
  if (!top || top.score < MEDIA_MATCH_THRESHOLD) return none;

  // What the visitor has actually been talking about, used both to break
  // ties below and to order what is offered next.
  const visitorWords = history
    .filter((h) => h.role === "user")
    .map((h) => h.content)
    .join(" ");
  const byTopic = rankByRequest(visitorWords, entries);
  const topicOrder = new Map(byTopic.map((r, i) => [r.entry, i]));

  /**
   * The other things this offer covered, best-first by what the visitor
   * came for.
   *
   * Everything the offer matched counts, not only the entries close
   * enough to have been ambiguous with the winner. "Crowns, or a
   * before-and-after?" answered with "both" is won outright by the crowns
   * entry, and the before-and-afters are exactly what still has to be
   * mentioned — reporting nothing there is how the visitor asks for two
   * things, receives one, and hears about it only if the model improvises.
   *
   * Topic order matters because this is what gets offered next: an
   * implant patient should be offered the implant before-and-after, not
   * the Hollywood smile. Capped, because a list of five is not an offer.
   */
  const otherMatches = (chosen: MediaCandidate) =>
    ranked
      .filter((r) => r.entry !== chosen && r.score >= MEDIA_MATCH_THRESHOLD)
      .sort((a, b) => (topicOrder.get(a.entry) ?? 1e9) - (topicOrder.get(b.entry) ?? 1e9))
      .slice(0, 2)
      .map((r) => r.entry);

  // Entries too close to the leader to separate on the request alone.
  const contenders = ranked.filter((r) => r.score * MEDIA_AMBIGUITY_MARGIN >= top.score);
  if (contenders.length === 1) {
    return {
      entry: top.entry,
      namedSomething,
      alsoMatched: acceptedAll ? otherMatches(top.entry) : [],
    };
  }

  // Accepting everything removes ambiguity BETWEEN the options offered.
  // It does not remove ambiguity WITHIN one of them, and the two must not
  // be confused. "Crowns, or a before-and-after?" answered with "both"
  // settles crowns-versus-before-and-after; it says nothing about which
  // of three entries titled "Before and after" was meant. Taking the
  // top-scoring entry at that point put a Hollywood-smile case in front
  // of a full-mouth implant patient — the original bug, through a new
  // door — so the conversation still decides, exactly as below.
  //
  // What acceptedAll changes is only the outcome when nothing separates
  // them: send the strongest match rather than nothing, because every
  // candidate is one they asked for.

  // The request does not distinguish them, so ask the conversation.
  //
  // This is the exact shape of the failure that prompted the rewrite: a
  // catalogue with three entries titled "Before and after" cannot be
  // resolved by the words "before and after", and the old code broke the
  // tie on database order — which is how a Hollywood-smile case reached a
  // full-mouth implant patient. What that patient had been talking about
  // for the whole conversation was implants, and it was the one signal
  // nobody consulted.
  //
  // Only the visitor's own words count. The assistant's are full of
  // whatever it has been reciting, which would bias this towards whatever
  // was mentioned last rather than what the visitor came for.
  const inContention = new Set(contenders.map((c) => c.entry));
  const onTopic = byTopic.filter((r) => inContention.has(r.entry));

  // Needs the same clear margin, over the contenders only.
  const [first, second] = onTopic;
  const separated =
    !!first &&
    first.score > 0 &&
    !(second && second.score > 0 && first.score < second.score * MEDIA_AMBIGUITY_MARGIN);

  // Nothing separates them. Normally nobody knows which was meant and
  // nothing is sent — but if they accepted every option, any of these is
  // one they asked for, so the strongest match goes rather than silence.
  if (!separated) {
    if (!acceptedAll) return none;
    return { entry: top.entry, namedSomething, alsoMatched: otherMatches(top.entry) };
  }

  return {
    entry: first.entry,
    namedSomething,
    alsoMatched: acceptedAll ? otherMatches(first.entry) : [],
  };
}

export function decideMedia(
  history: ChatTurn[],
  entries: MediaCandidate[],
  alreadySent: ReadonlySet<string> = new Set()
): MediaDecision {
  const request = findMediaRequest(history);
  if (!request) return { send: false, reason: "no-request" };

  if (!entries.some((e) => e.media.length > 0)) {
    return { send: false, reason: "no-media" };
  }

  for (const text of request.texts) {
    const { entry: best, namedSomething, alsoMatched } = resolveEntry(
      text,
      entries,
      history,
      request.acceptedAll
    );

    if (!best) {
      // The wider reading may only RESOLVE a subject the offer sentence
      // failed to name. It must never REPLACE one it did name.
      //
      // Without this the fallback reopened the exact bug it sits behind.
      // "We use premium Straumann zirconia crowns... would you like to
      // see some before and after photos of implant cases?" scores the
      // before-and-after entries at 0.483 — real signal, just under the
      // bar — so widening to the whole message handed back the crowns
      // photo, against an offer that plainly said before-and-after.
      //
      // Naming something we cannot confidently match is a reason to send
      // nothing, not a reason to go looking elsewhere. That includes
      // naming something real that simply has no photo on file.
      if (namedSomething) break;
      continue;
    }

    // Deduplication happens WITHIN the matched entry only, and stops here
    // rather than widening the search. When the identified entry's images
    // have all been shown the answer is nothing — never a different
    // entry's picture. Falling through is exactly what sent a
    // Hollywood-smile case to a full-mouth implant patient.
    const unsent = best.media.find((m) => !alreadySent.has(m.url));
    if (!unsent) return { send: false, reason: "already-shown" };

    return {
      send: true,
      url: unsent.url,
      type: unsent.type,
      title: best.title,
      // Only what is genuinely still showable: an entry whose images have
      // all gone already must not be offered again.
      alsoAvailable: alsoMatched
        .filter((entry) => entry.media.some((m) => !alreadySent.has(m.url)))
        .map((entry) => entry.title)
        .filter(Boolean),
      reason: request.reason,
    };
  }

  return { send: false, reason: "no-confident-match" };
}

/**
 * The one thing every non-send branch must say.
 *
 * The decision above is server-owned and was already correct in the
 * failure this exists to prevent: the assistant offered a choice between
 * before-and-afters and the implant/crown brands, the visitor replied
 * "the brands", and sending nothing was right — a two-option menu does
 * not identify an entry. What went wrong is that nothing TOLD the model
 * that. It was handed a list of titles it may offer and no statement that
 * this reply carries no image, so it wrote "Here you go!" and then, over
 * three more turns, "the crowns will follow right after!".
 *
 * Both halves matter. Forbidding "here you go" alone still permits a
 * promise about a later message, and a promise the server has no way to
 * keep is the same broken experience one turn deferred.
 */
const NOTHING_ATTACHED = [
  "THIS REPLY CARRIES NO IMAGE, and none is being sent.",
  "That is information for you, not for the visitor: never say it to them, never mention what is or is not attached, and never explain how images work here. Just write as though no picture were part of the exchange — no \"here you go\", no \"as you can see\", no \"take a look at this\", no describing something they can see.",
  "And never promise one is coming in a later message. You cannot send images, so \"the photos will follow right after\" is a promise you have no way to keep.",
].join(" ");

/**
 * What the model is told about media this turn.
 *
 * Either an image is attached and this says what it shows, or it does
 * not and this says so. There is no third shape, and no branch may be
 * silent about it: an instruction that lists what the model MAY offer
 * without stating that nothing is attached is how four consecutive turns
 * promised an image that never arrived.
 *
 * No URLs ever reach the model — it cannot send anything itself, so it
 * has nothing to do with them.
 */
export function buildMediaInstruction(
  decision: MediaDecision,
  offerableTitles: string[]
): string | null {
  if (decision.send) {
    const lines = [
      `AN IMAGE IS ATTACHED TO THIS REPLY, automatically. It shows: "${decision.title}"`,
      "Write a reply that introduces THAT image. The visitor is looking at it while they read your words, so describe what they can see and say something specific about it. Do not change the subject, and do not ask a new question before you have presented it.",
    ];

    // They asked for more than one thing and exactly one is attached.
    // Saying so is what keeps the reply honest: the alternative is a
    // model that knows two were requested, sees one, and either goes
    // quiet about the difference or promises a picture it cannot send.
    if (decision.alsoAvailable.length > 0) {
      lines.push(
        "",
        "The visitor asked to see more than one thing, and ONE image goes per reply. Still to come, if they want it:",
        ...decision.alsoAvailable.map((title) => `  • ${title}`),
        'Mention naturally that you can show one of these next — as an offer they can take up, not as a promise that it is on its way. Something like "I can show you the before-and-afters next if you like" is right; "the before-and-afters will follow" is not, because only their acceptance makes it happen.'
      );
    }

    return lines.join("\n");
  }

  if (decision.reason === "already-shown") {
    return [
      NOTHING_ATTACHED,
      "The visitor has asked to see something you have already shown them. Say so warmly — there is nothing further to send on that — and offer something else worth knowing instead.",
    ].join("\n");
  }

  if (decision.reason === "no-confident-match" || decision.reason === "no-media") {
    return [
      NOTHING_ATTACHED,
      "The visitor has asked to see something and there is nothing on file that confidently matches it. Tell them plainly that you will have the team send it across, and carry on.",
    ].join("\n");
  }

  // No request this turn. The model may still OFFER, which is a question
  // rather than a delivery — so the warning above is what keeps the two
  // apart, and it is stated whether or not there is anything to list.
  if (offerableTitles.length === 0) return NOTHING_ATTACHED;

  return [
    NOTHING_ATTACHED,
    "",
    "You may OFFER to show the visitor these, and nothing else:",
    ...offerableTitles.map((title) => `  • ${title}`),
    "An offer is a question, not a delivery. If they accept, the image is attached automatically to the reply you write next, and you will be told so in advance.",
  ].join("\n");
}
