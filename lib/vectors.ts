// Vector helpers, independent of what anyone wants vectors for.
//
// These lived in lib/media-selection.ts, which chose which photo to send.
// That feature was removed, and coverage relevance still needs them: it
// works out which pre-close questions a business calls for by comparing
// its knowledge entries against fixed probes, which has nothing to do
// with images.

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
