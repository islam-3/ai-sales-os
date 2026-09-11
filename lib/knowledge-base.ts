export type MediaType = "image" | "video";

export type KnowledgeMedia = {
  id: string;
  url: string;
  type: MediaType;
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: string | null;
  content: string;
  hasEmbedding: boolean;
  media: KnowledgeMedia[];
  created_at: string;
};

/**
 * Titles are labels, not sentences: one line in a list row, and a short
 * prefix on the fact handed to the model. Enforced in the form and
 * re-checked in the server action, which is the only write path.
 */
export const TITLE_MAX_LENGTH = 100;

// One char under the column/form cap so the appended ellipsis still
// leaves the result saveable — a derived title longer than
// TITLE_MAX_LENGTH would be rejected the first time an owner opened that
// entry to edit it.
const DERIVED_TITLE_MAX = TITLE_MAX_LENGTH - 1;
const SNIPPET_MAX = 120;

// Words that take a full stop without ending a sentence. Without this,
// "Dr. Sarah Ahmed leads a team of 4 specialists" would derive as "Dr."
const ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "st",
  "jr",
  "sr",
  "vs",
  "etc",
  "inc",
  "ltd",
  "co",
  "no",
  "approx",
  "est",
  "min",
  "max",
]);

/**
 * Index just past the end of the first real sentence, or -1.
 *
 * A terminator only counts when followed by whitespace or the end of the
 * string, which already rules out decimals like "5.000". Abbreviations
 * and single-letter initials are skipped explicitly.
 */
function findSentenceEnd(text: string): number {
  const pattern = /[.!?]+(?=\s|$)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const trailingWord = before.match(/([A-Za-z][A-Za-z.]*)$/);
    const word = trailingWord ? trailingWord[1].replace(/\./g, "").toLowerCase() : "";

    // "Dr." / "J." are mid-sentence; keep looking.
    if (word && (ABBREVIATIONS.has(word) || word.length === 1)) continue;

    return match.index + match[0].length;
  }
  return -1;
}

/** Cuts on a word boundary and ellipsizes, never mid-word. */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only respect the boundary if it isn't absurdly early, otherwise one
  // very long word would collapse the whole string to an ellipsis.
  const end = lastSpace > max * 0.5 ? lastSpace : max;
  return `${text.slice(0, end).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

function firstLineOf(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.replace(/\s+/g, " ");
  }
  return "";
}

function flatten(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

/**
 * A heading guessed from the content, used only when an entry has no
 * written title — rows created before the title column existed, or one
 * inserted outside the dashboard form.
 *
 * Prefers a complete first sentence, falling back to a word-boundary
 * truncation. This is also what the one-time backfill uses, so migrated
 * rows read exactly as they did before the column was added.
 */
export function deriveEntryTitle(content: string): string {
  const first = firstLineOf(content);
  if (!first) return "Untitled entry";

  // A first line that already fits is the heading, whether it was
  // written as one ("Face-Lift") or is simply a short fact.
  if (first.length <= TITLE_MAX_LENGTH) return first;

  // Otherwise it is prose: a complete first sentence makes the best
  // heading because it reads as a finished thought and needs no ellipsis.
  const full = flatten(content);
  const sentenceEnd = findSentenceEnd(full);
  if (sentenceEnd > 0 && sentenceEnd <= TITLE_MAX_LENGTH) {
    return full.slice(0, sentenceEnd).trim();
  }

  // Use the whole available budget rather than stopping short: this is
  // the value an owner will see and edit, so the more of the sentence it
  // keeps, the less retyping they have to do.
  return truncateAtWord(full, DERIVED_TITLE_MAX);
}

/** The title to display: what the business wrote, or a derived fallback. */
export function entryTitle(entry: { title: string; content: string }): string {
  const written = entry.title.trim();
  return written || deriveEntryTitle(entry.content);
}

/**
 * The muted second line of a collapsed row: the start of the content.
 *
 * With a real title this no longer has to continue from wherever a
 * derived heading stopped — the old rule that split one sentence across
 * two lines and severed words is gone entirely.
 *
 * The one wrinkle: backfilled titles were taken FROM the content, so a
 * naive "start of content" snippet would repeat the title word for word.
 * When the content opens with the title, that prefix is skipped.
 */
export function entrySnippet(entry: { title: string; content: string }): string {
  const flat = flatten(entry.content);
  if (!flat) return "";

  // Trailing "…" on a truncated derived title isn't in the content, so
  // strip it before comparing prefixes.
  const heading = entryTitle(entry).replace(/…\s*$/, "").trim();

  let body = flat;
  if (heading && flat.toLowerCase().startsWith(heading.toLowerCase())) {
    body = flat.slice(heading.length);
  }

  // Whatever separated the heading from the body — a full stop, a dash —
  // would otherwise lead the snippet.
  body = body.replace(/^[\s.,;:—–-]+/, "").trim();

  if (!body) return "";
  return truncateAtWord(body, SNIPPET_MAX);
}

/**
 * Case-insensitive match across the title, the full body, and the
 * category.
 *
 * Deliberately searches the whole content, not just the title: a term
 * buried in a 2,700-character entry is exactly what an owner can't find
 * by eye, which is the reason the search box exists.
 */
export function entryMatchesQuery(entry: KnowledgeEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.content.toLowerCase().includes(q) ||
    (entry.category ?? "").toLowerCase().includes(q)
  );
}

/**
 * How one entry is presented to the model, in both the full knowledge
 * dump and the RAG path.
 *
 * A labelled fact is more useful than a bare paragraph: it tells the
 * model what the text is about before it reads it, which helps it pick
 * the right fact for the question it was asked. Kept in one place so the
 * two paths can't format differently.
 */
export function formatEntryForPrompt(entry: { title: string; content: string }): string {
  const title = entry.title.trim();
  if (!title) return entry.content;
  return `${title}: ${entry.content}`;
}

/**
 * The text an entry's embedding is generated from.
 *
 * The title is included on purpose. It is a human-written summary of what
 * the entry is about, which is exactly the signal semantic search wants —
 * a query for "warranty" should match an entry titled "Warranty &
 * guarantees" strongly, even if the body never repeats the word.
 *
 * Changing this changes what existing vectors mean relative to new ones,
 * so entries embedded before the title column existed should be
 * re-embedded (npm run embed-knowledge-base) for consistent matching.
 */
export function embeddingTextFor(entry: { title: string; content: string }): string {
  const title = entry.title.trim();
  return title ? `${title}\n\n${entry.content}` : entry.content;
}
