// Grouping and dismissal for captured customer questions.
//
// Everything here is a pure function over rows. The database stores
// asks; it does not know what a group is, whether one is dismissed, or
// whether a dismissed one has come back. That is deliberate — the
// come-back rule has an off-by-one that is easy to get wrong and
// impossible to notice in production, so it is tested rather than
// trusted.

import { cosineSimilarity } from "./vectors";

/** One ask, as stored. */
export type UnansweredAsk = {
  id: string;
  sessionId: string;
  askedAt: string;
  questionRaw: string;
  questionShort: string;
  /** The script they typed in, not a language. See the migration. */
  script: string | null;
  embedding: number[] | null;
  groupId: string;
  /** Set only on the row where id === groupId. */
  dismissedAt: string | null;
};

/** What the dashboard renders: one line per question, however many asked. */
export type QuestionGroup = {
  groupId: string;
  /** The canonical short wording — the first ask's. */
  question: string;
  /** How many customers have asked this. */
  count: number;
  /** The most recent ask, for the link and the date. */
  latest: UnansweredAsk;
  /** Distinct scripts it has been asked in, so an owner knows who is asking. */
  scripts: string[];
  dismissedAt: string | null;
  /** True when it was dismissed and has since come back. */
  returned: boolean;
};

/**
 * How similar two short questions must be to count as the same question.
 *
 * NO LONGER DECIDES GROUPING. The model does that now, choosing among
 * nearestGroups below; this threshold under-merged exactly as predicted
 * here. Kept because scripts/measure-question-grouping.ts still reports
 * against it and the measurement below is why similarity only ranks.
 *
 * ── What the measurement found ──────────────────────────────────────
 * scripts/measure-question-grouping.ts embeds 14 hand-labelled
 * same-meaning pairs and 13 different-meaning ones. The two
 * distributions OVERLAP, and there is no threshold that separates them:
 *
 *   same       min 0.501   median 0.732   max 0.941
 *   different  min 0.151   median 0.460   max 0.685
 *
 * "how much does it cost?" against "what are your prices?" scores 0.529
 * — lower than "is the hotel included?" against "how many nights are
 * included?" at 0.685, which are different questions and one of the
 * judge's labelled partials. Similarity cannot tell those apart, for the
 * same reason it could not decide answerability: it measures topic.
 *
 * ── So the bar is set by which error is worse ───────────────────────
 * Not by the midpoint. The two errors are not comparable:
 *
 *   wrongly MERGED — a real question hidden inside another's group,
 *     never shown, never answered. Unrecoverable: nothing surfaces it.
 *   wrongly SPLIT — the same question listed twice. Untidy, visible,
 *     and self-correcting, because one answer clears both lines.
 *
 * 0.75 sits 0.065 above the worst different-meaning pair observed, which
 * is margin against a set of 13 being an incomplete picture, and gives
 * zero wrong merges. It costs 9 of the 14 same pairs, so an owner WILL
 * sometimes see one question on two lines. That is the known weak spot
 * here, chosen deliberately, and it is the cheap one.
 *
 * If under-merging becomes the complaint, the fix is not a lower number
 * — it is to ask the model whether two short questions are the same
 * question, the way answerability is decided. Not built: a duplicate
 * line costs an owner nothing like enough to justify a model call per
 * captured question.
 */
export const SAME_QUESTION_SIMILARITY = 0.75;

/**
 * How many more customers must ask before a dismissed question returns.
 *
 * Dismissing says "I know, and I am not writing that." Fair once. At the
 * tenth customer it is a different decision, and the owner should get to
 * make it again with the new number in front of them.
 */
export const ASKS_TO_UNDISMISS = 3;

/**
 * How many existing groups the shortening call is shown.
 *
 * Ten because ten is what was validated: 41 labelled cases x 3 runs
 * against ten groups, zero wrong merges, zero splits
 * (docs/question-match-2026-10-30.txt). It also keeps the call's cost
 * flat however long a tenant's list grows. More groups is an untested
 * condition, not a free improvement.
 */
export const MATCH_CANDIDATES = 10;

/**
 * Which existing groups the model is asked to choose between.
 *
 * Embeddings pick the candidates; the model decides whether any of them
 * is the same question. Similarity is not trusted to decide that — see
 * SAME_QUESTION_SIMILARITY above for why it cannot — but it is good
 * enough to put the right group in a top ten.
 *
 * At or under the limit every group is sent and nothing is ranked, so
 * the query embedding is not needed. Over it, with no query embedding,
 * nothing is sent: the question starts its own group. Both failures land
 * on a duplicate line, never on a wrong merge, because a group that is
 * not shown cannot be chosen.
 *
 * Ranked against each group's CANONICAL embedding, the first ask's, for
 * the same reason grouping always anchored there: matching any member
 * lets a group drift from A to C through B.
 */
export function nearestGroups<G extends { embedding: number[] | null }>(
  query: number[] | null,
  canonical: G[],
  limit = MATCH_CANDIDATES
): G[] {
  if (canonical.length <= limit) return canonical;
  if (!query) return [];
  return canonical
    .map((g) => ({ g, score: g.embedding ? cosineSimilarity(query, g.embedding) : -Infinity }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ g }) => g);
}

/**
 * Rolls asks up into the lines an owner sees.
 *
 * Dismissed groups are included, with `dismissedAt` set, and the caller
 * decides what to do with them — `activeGroups` below is what the
 * dashboard uses. Keeping the split here rather than filtering in the
 * query means the come-back rule is one tested function instead of a
 * condition spread across SQL.
 */
export function groupAsks(asks: UnansweredAsk[]): QuestionGroup[] {
  const byGroup = new Map<string, UnansweredAsk[]>();
  for (const ask of asks) {
    const list = byGroup.get(ask.groupId) ?? [];
    list.push(ask);
    byGroup.set(ask.groupId, list);
  }

  const groups: QuestionGroup[] = [];
  for (const [groupId, members] of Array.from(byGroup.entries())) {
    const sorted = [...members].sort((a, b) => a.askedAt.localeCompare(b.askedAt));
    const canonical = sorted.find((m) => m.id === groupId);
    const dismissedAt = canonical?.dismissedAt ?? null;

    // Asked AFTER the dismissal — the only ones that count toward
    // bringing it back. A strict comparison, so the dismissal itself
    // can never be its own first vote to return.
    const since = dismissedAt
      ? sorted.filter((m) => m.askedAt > dismissedAt).length
      : 0;

    groups.push({
      groupId,
      // The canonical row's wording, not the newest. An owner who has
      // seen a line should not find it reworded next week because
      // someone phrased it differently.
      question: (canonical ?? sorted[0]).questionShort,
      count: sorted.length,
      latest: sorted[sorted.length - 1],
      scripts: Array.from(
        new Set(sorted.map((m) => m.script).filter((s): s is string => !!s))
      ).sort(),
      dismissedAt,
      returned: dismissedAt !== null && since >= ASKS_TO_UNDISMISS,
    });
  }

  return groups;
}

/**
 * The lines actually shown, most-asked first.
 *
 * A group is shown when it has never been dismissed, or when enough
 * customers have asked since it was.
 */
export function activeGroups(asks: UnansweredAsk[]): QuestionGroup[] {
  return groupAsks(asks)
    .filter((g) => g.dismissedAt === null || g.returned)
    .sort((a, b) => {
      // Most asked first: that is the ranking an owner needs, because it
      // is the one that says what is costing them business.
      if (b.count !== a.count) return b.count - a.count;
      // Ties broken by recency, so a question asked this morning beats
      // one asked once in March.
      return b.latest.askedAt.localeCompare(a.latest.askedAt);
    });
}
