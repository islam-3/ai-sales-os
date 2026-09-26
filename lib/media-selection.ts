// Which photo, if any, matches what the visitor is talking about.
//
// The old answer was lexical overlap between the visitor's sentence and
// an entry's title. Measured against the real knowledge base, for an
// English conversation plainly about full mouth implants:
//
//     0.148  "Before and after ( dental implants )"   threshold 0.25
//     0.113  "Implants brand"
//     0.000  everything else
//
// and in Arabic every entry scored 0.000. So the most obviously relevant
// photo did not clear the bar in the language the mechanism was written
// for, and nothing cleared it in any other. Raising the threshold to let
// 0.148 through would have been tuning a broken mechanism, and would
// have left every other language at zero regardless.
//
// Embeddings answer the question the lexical score was standing in for -
// is this entry ABOUT what they are discussing - and the model behind
// them is multilingual, so an Arabic sentence and an English title land
// near each other when they mean the same thing.
//
// ── This is NOT RAG ──────────────────────────────────────────────────
// RAG retrieval is switched off deliberately (see RAG_RETRIEVAL_ENABLED
// in the chat route): it was injecting verbatim duplicates of the full
// knowledge dump already in the prompt, costing tokens to tell the model
// nothing new. This uses the SAME vectors for a different purpose -
// choosing one photo - and adds nothing to the prompt at all. The two
// uses must not be confused, or the cost regression comes back with it.

/** An entry as selection needs it: its media and its stored vector. */
export type EmbeddedCandidate = {
  id: string;
  title: string;
  media: { url: string; type: string | null }[];
  /** The stored embedding, already parsed. Null when it has none. */
  embedding: number[] | null;
};

export type Selection = {
  entry: EmbeddedCandidate;
  similarity: number;
};

/**
 * Supabase returns a pgvector column as a JSON-ish string, not an array.
 * Parsed once per request rather than per comparison.
 */
export function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/** Cosine similarity. Both vectors come from the same model, so same length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * A floor, not a gate.
 *
 * Calibrated on real conversations against the real knowledge base in six
 * languages (scripts/calibrate-media-selection.ts, output in docs/), and
 * the calibration is the reason this is only a floor:
 *
 *   top-1 correct        9 / 9   in every language
 *   similarity, correct  0.17 (Arabic) .. 0.60 (English)
 *   similarity, wrong    up to 0.39
 *   relative lift        overlaps too: a negative reached 2.03
 *
 * Ranking is excellent and magnitude is meaningless across languages —
 * the SAME correct match scores 0.55 in English and 0.17 in Arabic,
 * because these entries are written in English and cross-lingual
 * similarity is simply weaker. No absolute bar and no relative one
 * separates "should show" from "should not".
 *
 * So similarity does not decide WHETHER to show a photo. It decides
 * WHICH, once something else has established that a photo is wanted —
 * the visitor asked (the classifier, 100% recall in every class) or took
 * up an offer (the stored offer plus a yes, 100/100). Using similarity
 * for "whether" is precisely the mistake the old lexical threshold made,
 * and it is why the most obviously relevant photo scored 0.148 against a
 * bar of 0.25 in the language the mechanism was written for.
 *
 * This floor exists only so that a request made when the catalogue holds
 * nothing remotely related sends nothing at all.
 */
export const MEDIA_SIMILARITY_FLOOR = Number(process.env.MEDIA_SIMILARITY_FLOOR ?? 0.08);

/**
 * How much clearer the best match must be than the runner-up.
 *
 * REMOVED, and the reason is worth keeping. It was set at 1.04 by eye -
 * the same tuning-by-eye this file criticises elsewhere - and measured
 * against a real request it rejected a CORRECT pick: an Arabic "can I
 * see before and afters of implant cases" scored
 *
 *     0.347  "Before and after ( dental implants )"   <- right
 *     0.338  "Before and after"                        <- generic
 *     0.316  "Before and after ( Hollywood smile )"
 *
 * a margin of 1.03, and nothing was sent.
 *
 * The guard was there because this product once sent a Hollywood-smile
 * photo to an implant patient. But look at what a margin can actually
 * see: the harmless ambiguity here (two before-and-after galleries,
 * either of which answers the request) is TIGHTER than the harmful one
 * it was meant to catch (implants vs Hollywood, 1.10 apart). A single
 * ratio cannot tell those apart, so it blocks the safe case and lets the
 * dangerous one through - the worst of both.
 *
 * What protects against the wrong photo instead:
 *   - INTENT gates the decision. Nothing is sent unless the visitor
 *     asked or took up an offer, which is what actually went wrong in
 *     the original incident (accept-all bypassed the topic tie-break).
 *   - RANKING is measured at 9 of 9 correct across six languages, and
 *     it puts Hollywood first for a Hollywood question and implants
 *     first for an implant one.
 *   - The floor below still refuses a catalogue with nothing related.
 *
 * If a wrong photo is ever seen again, this is the first place to look,
 * and the honest fix would be a subject check rather than a ratio.
 */

/**
 * The entry whose photo best matches this text, or null.
 *
 * Answers WHICH, never WHETHER — see the note above. The caller must
 * already have decided that a photo is wanted.
 */
export function selectByMeaning(
  queryEmbedding: number[] | null,
  candidates: EmbeddedCandidate[],
  alreadySent: ReadonlySet<string> = new Set()
): Selection | null {
  if (!queryEmbedding || queryEmbedding.length === 0) return null;

  const scored = candidates
    .filter((c) => c.embedding && c.media.some((m) => !alreadySent.has(m.url)))
    .map((entry) => ({ entry, similarity: cosineSimilarity(queryEmbedding, entry.embedding!) }))
    .sort((a, b) => b.similarity - a.similarity);

  if (scored.length === 0) return null;
  const best = scored[0];
  if (best.similarity < MEDIA_SIMILARITY_FLOOR) return null;

  return best;
}
