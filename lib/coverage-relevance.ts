// Which coverage questions this BUSINESS needs asked at all.
//
// Pre-close coverage has two halves. The first asks whether a dimension
// is relevant — does this treatment span several visits, does it involve
// travel, does it have health prerequisites — and that was answered by
// matching English words against the material the assistant had been
// given. Measured across six languages on the identical case, coverage
// fired in 1 of 6: an Arabic conversation where the assistant had itself
// explained "two visits, four months apart" took a name and a number and
// closed without asking when the visitor could travel or for how long.
//
// ── Why this is the structural fix ───────────────────────────────────
// Relevance is a property of the BUSINESS, not of the conversation. A
// clinic whose work spans two visits needs travel dates asked whatever
// language the visitor happens to write in, and the server already knows
// what that clinic does — it supplied the knowledge base itself. There
// was never any reason to infer it from the words of a conversation.
//
// So it is derived from the tenant's own entries, by MEANING rather than
// by wording, using the vectors already stored against those entries.
// The probes are English and the entries may be Turkish; the embedding
// model is multilingual, which is the whole point.
//
// Computed once per process and cached: a knowledge base changes when an
// owner edits it, not between turns of a conversation.

import { cosineSimilarity } from "./media-selection";

export type CoverageDimensionId = "dates" | "duration" | "origin" | "health";

/**
 * What each dimension is actually about, written plainly.
 *
 * These are compared against the business's own entries. They describe
 * the SITUATION that makes a question worth asking, not the question.
 */
const PROBES: { id: CoverageDimensionId; text: string }[] = [
  {
    id: "dates",
    text: "Treatment that takes place over more than one visit, with months of healing in between, so the patient must travel more than once and the timing has to be planned.",
  },
  {
    id: "duration",
    text: "A stay of several days or weeks is required for the procedure, and how many days the patient can stay decides what can be completed on each trip.",
  },
  {
    id: "origin",
    text: "Patients travel internationally from other countries for this treatment, arriving by air, and transfers and accommodation are arranged around their journey.",
  },
  {
    id: "health",
    text: "Medical history matters before this procedure: existing conditions, medication, diabetes, blood pressure or previous surgery affect whether and how it can be done.",
  },
];

/**
 * How close an entry must be before the dimension counts as relevant.
 *
 * Calibrated by scripts/measure-coverage.ts against a real knowledge
 * base rather than chosen by eye — this codebase has already shipped one
 * threshold set by eye that rejected a correct answer.
 */
export const COVERAGE_RELEVANCE_THRESHOLD = Number(
  process.env.COVERAGE_RELEVANCE_THRESHOLD ?? 0.3
);

export type ProbeVectors = Partial<Record<CoverageDimensionId, number[]>>;

/** The probe texts, for whoever embeds them. */
export function coverageProbes(): { id: CoverageDimensionId; text: string }[] {
  return PROBES;
}

/**
 * Which dimensions this business's material actually calls for.
 *
 * Returns every dimension when the probes are unavailable, because the
 * failure this replaces was coverage going SILENT — asking a question
 * the visitor has already answered is a small annoyance, while closing a
 * lead without knowing when they can travel loses the booking.
 */
export function relevantDimensions(
  entryVectors: (number[] | null)[],
  probes: ProbeVectors
): Set<CoverageDimensionId> {
  const usable = entryVectors.filter((v): v is number[] => !!v && v.length > 0);
  const known = PROBES.filter((p) => probes[p.id]?.length);

  if (usable.length === 0 || known.length === 0) {
    return new Set(PROBES.map((p) => p.id));
  }

  const relevant = new Set<CoverageDimensionId>();
  for (const probe of known) {
    const vector = probes[probe.id]!;
    const best = usable.reduce((max, entry) => Math.max(max, cosineSimilarity(vector, entry)), 0);
    if (best >= COVERAGE_RELEVANCE_THRESHOLD) relevant.add(probe.id);
  }
  return relevant;
}
