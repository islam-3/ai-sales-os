// Which of the business's own facts bear on what the visitor just asked?
//
// Chosen by code, worded by the model. Measured on gpt-6.1-terra, the
// reply drew on the business's material in 0.6 distinct facts per
// conversation against Sonnet's 3.5: its process reply named none of the
// brands or warranties the material states. Telling it to "use the
// material" more is prompt tuning; choosing the right sentences and
// handing them over is not.
//
// ── Language-independent, by rule ───────────────────────────────────
// A business may write its material in any language, and Arabic,
// Chinese and Japanese have no letter case (Turkish casing is a trap of
// its own). So nothing here looks at case. Selection rests on:
//   - MEANING: entries ranked by the cosine of their stored embedding
//     against the visitor's last two messages, the same multilingual
//     vectors coverage-relevance uses;
//   - FIGURES: within a long entry, the sentences carrying a number, in
//     any digit system;
//   - the ENTRY itself: a short entry is handed over whole, because the
//     material's differentiators are often one-line entries with no
//     figure at all (a brand name).
// "Already said" is a verbatim match of a token found in no other entry
// (a figure, or a rare word in any script), never a casing test.
//
// Pure: the query vector is computed by the caller. Tested in
// scripts/test-business-facts.ts, with entries in Turkish and Arabic.

import { cosineSimilarity } from "./vectors";

export type FactEntry = { content: string; embedding: number[] | null; title?: string; category?: string };

/** An entry this short is handed over whole. */
export const WHOLE_ENTRY_CHARS = 280;
/** Entries in the best entry's category within this share of its score are candidates. */
const CUTOFF_RATIO = 0.75;
/**
 * Below this the best match is not about the question at all.
 * Calibrated, not guessed: see scripts/calibrate-business-facts.ts and
 * docs/business-facts-calibration-*.txt. The first value, 0.3, was a
 * guess, and sat above the best match (0.24) for "walk me through the
 * steps", so the process reply was offered nothing. 0.18 sits below every
 * on-topic question in six languages (Arabic, against English material,
 * is lowest at 0.19). The distributions overlap: one off-topic question
 * ("bugün hava nasıl?", 0.217) passes it. The gate (the visitor asked
 * something) and the category rule below carry the rest. It applies to
 * the best match only.
 */
export const MIN_SIMILARITY = Number(process.env.FACTS_MIN_SIMILARITY ?? 0.18);

/**
 * An entry shorter than this, or the same as its own title, is a label
 * ("Before and after ( dental implants )"), not a fact.
 */
export const MIN_FACT_CHARS = 40;

/** Whether an entry has anything to say beyond its own heading. */
export function isLabel(e: FactEntry): boolean {
  const text = e.content.replace(/\s+/g, " ").trim();
  // Short AND without a figure: "we have 15 years of experience" is a
  // short entry and a real fact.
  if (hasFigure(text)) return false;
  return text.length < MIN_FACT_CHARS || (e.title !== undefined && text.toLowerCase() === e.title.replace(/\s+/g, " ").trim().toLowerCase());
}

/**
 * The text the entries are ranked against: every visitor message so far,
 * newest last, capped. All of them, not the last two: "how much does it
 * cost?" followed by "walk me through the steps" has lost the topic the
 * visitor gave earlier.
 */
export function factsQueryText(visitorMessages: string[], maxChars = 1500): string {
  const joined = visitorMessages.map((m) => m.trim()).filter(Boolean).join("\n");
  return joined.length <= maxChars ? joined : joined.slice(joined.length - maxChars);
}

const DIGITS: Record<string, string> = {};
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGITS[d] = String(i)));
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGITS[d] = String(i)));
"０１２３４５６７８９".split("").forEach((d, i) => (DIGITS[d] = String(i)));

// Built with the constructor: the "u" flag, needed for \p{L} (a letter in
// any script), is not allowed in a regex literal at this project's
// compile target.
const SENTENCE_END = new RegExp("(?<=[.!?。！？؟۔])\\s*|\\n+", "u");
const NOT_A_WORD = new RegExp("[^\\p{L}\\p{M}\\d]+", "u");
const MARKS = new RegExp("\\p{M}", "gu");

/** Every digit as ASCII, whatever system it was written in. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹０-９]/g, (d) => DIGITS[d] ?? d);
}

/** Sentences, split on the full stops of any script, and on line breaks. */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

const hasFigure = (s: string) => /\d/.test(asciiDigits(s));

/**
 * What of an entry is handed over: the whole entry if it is short, or a
 * long entry's sentences with figures. Null for a long entry with none:
 * its opening sentence is usually a heading ("Best Dental Implants in
 * Istanbul Turkey"), which is not a fact.
 */
export function snippetOf(content: string): string | null {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= WHOLE_ENTRY_CHARS) return text;
  const withFigures = splitSentences(content).filter(hasFigure).slice(0, 2);
  if (withFigures.length === 0) return null;
  const chosen = withFigures.join(" ");
  return chosen.length <= WHOLE_ENTRY_CHARS ? chosen : `${chosen.slice(0, WHOLE_ENTRY_CHARS - 1).trimEnd()}…`;
}

/**
 * Words in any script, compared without their combining marks: Turkish
 * "İmplant" lower-cases to "i̇mplant" (with a combining dot) and must
 * still match "implant", and Arabic vowel marks are optional in writing.
 */
function wordsOf(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(MARKS, "").split(NOT_A_WORD).filter(Boolean);
}

/**
 * For each entry, the tokens that identify it: its figures, and its words
 * of five or more characters that appear in no other entry.
 */
export function distinctiveTokens(entries: FactEntry[]): string[][] {
  const perEntry = entries.map((e) => new Set(wordsOf(asciiDigits(e.content))));
  const df = new Map<string, number>();
  for (const set of perEntry) for (const w of Array.from(set)) df.set(w, (df.get(w) ?? 0) + 1);
  return perEntry.map((set) =>
    Array.from(set).filter((w) => /^\d+$/.test(w) ? w.length >= 2 : w.length >= 5 && df.get(w) === 1)
  );
}

/**
 * Up to `max` facts for this turn, most relevant first.
 *
 * Returns [] when no entry is close enough in meaning, when no entry has
 * an embedding, or when every candidate has already been said.
 */
export function selectBusinessFacts(
  queryEmbedding: number[] | null,
  entries: FactEntry[],
  /** Everything the assistant has said so far in this conversation. */
  assistantSoFar: string,
  max = 2
): string[] {
  if (!queryEmbedding || entries.length === 0) return [];
  const scored = entries
    .map((e, i) => ({ i, score: e.embedding && !isLabel(e) ? cosineSimilarity(queryEmbedding, e.embedding) : -1 }))
    .filter((x) => x.score > -1)
    .sort((a, b) => b.score - a.score);
  // The floor is on the best match: below it, the question is not about
  // anything the business wrote.
  if (scored.length === 0 || scored[0].score < MIN_SIMILARITY) return [];
  const best = scored[0].score;
  // The business's own grouping keeps the topic: candidates come from the
  // best entry's category. Similarities compress across languages (an
  // Arabic question against English material scores about 0.2), and
  // without this a hair-transplant entry with figures sat as close to an
  // implant question as the implant entries did.
  const topic = entries[scored[0].i].category;
  const tokens = distinctiveTokens(entries);
  const said = new Set(wordsOf(asciiDigits(assistantSoFar)));

  const facts: string[] = [];
  for (const { i, score } of scored) {
    if (score < best * CUTOFF_RATIO || facts.length >= max) break;
    if (topic !== undefined && entries[i].category !== topic) continue;
    // Already said: one of its identifying tokens is in an earlier reply.
    if (tokens[i].some((t) => said.has(t))) continue;
    const snippet = snippetOf(entries[i].content);
    if (snippet && !facts.includes(snippet)) facts.push(snippet);
  }
  return facts;
}
