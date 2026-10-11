// Which questions a business has dealt with, and how.
//
// Pure: given the stored entries and the stored declines, it says what
// state every question is in. Nothing here reads prose to decide
// anything — the state comes from a question_key column and an
// answer_kind column, both set explicitly when the owner acts.
//
// ── Why answers are scoped to a category ────────────────────────────
// Asking each question once is actively wrong. A clinic that answers
// "20 years on the crowns, lifetime on the implants" has answered it for
// DENTAL, and serving that to a hair-transplant visitor as fact is a
// warranty the business never gave. The real clinic this was designed
// from is exactly that shape: ten dental entries carrying every
// operational answer, four hair-transplant entries carrying none.
//
// So an answer belongs to a category, "all categories" is an explicit
// choice rather than the default, and the same question can be answered
// more than once. A question counts as resolved once it has at least one
// answer — because a business that has only one service line should not
// be stuck at nine out of ten.
//
// A NEGATIVE is scoped identically. "We don't offer a guarantee" said
// for Dental treatment says nothing about Hair transplant, which stays
// open until it is addressed.

import type { GuidedQuestion } from "./guided-questions";

/** How an answer came to exist. Set explicitly; never inferred. */
export type AnswerKind =
  /** The owner wrote it. */
  | "answered"
  /** The owner chose a defined "we don't offer this" sentence. */
  | "not_offered"
  /** An entry that already existed, which the owner confirmed covers it. */
  | "existing";

/** A knowledge entry that is tied to a question, as much as this needs. */
export type GuidedEntry = {
  id: string;
  questionKey: string;
  /** Null means it applies whatever the customer asks about. */
  category: string | null;
  answerKind: AnswerKind;
  /** Shown back to the owner so they can see what they said. */
  content: string;
};

/**
 * Questions the owner has explicitly chosen not to answer, by category.
 *
 * Separate from the entries because this state has NO content by
 * definition. "Prefer not to say" must leave the assistant with nothing
 * at all — writing a row saying the business declined to comment would
 * be worse than silence, and would reach a customer.
 *
 * Null inside the array is the all-categories decline, matching how an
 * answer's category works.
 */
export type Declines = Record<string, (string | null)[]>;

export type QuestionState =
  | "answered"
  | "not_offered"
  | "existing"
  | "declined"
  | "open";

export type CategoryState = {
  /** Null for the all-categories row. */
  category: string | null;
  state: QuestionState;
  entryId?: string;
  content?: string;
};

export type QuestionProgress = {
  question: GuidedQuestion;
  /**
   * Whether this question needs no further attention.
   *
   * True once it has at least one ANSWER of any kind, or has been
   * declined. One service line answered is enough to resolve the
   * question — a business with one category should not sit at 9/10
   * forever, and a business with four can see the gaps per category
   * below without the headline number nagging.
   */
  resolved: boolean;
  /** One row per category that has something, newest intent last. */
  byCategory: CategoryState[];
  /** Categories with nothing said either way, for the "add another" prompt. */
  openCategories: string[];
};

export type GuidedProgress = {
  questions: QuestionProgress[];
  resolved: number;
  total: number;
};

const sameCategory = (a: string | null, b: string | null) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * The state of every question for this tenant.
 *
 * `categories` is the tenant's own knowledge-base categories, used only
 * to work out which ones have nothing said about them yet. A tenant with
 * no categories gets no per-category gaps, which is correct — there is
 * nothing to scope to.
 */
export function guidedProgress(
  questions: GuidedQuestion[],
  entries: GuidedEntry[],
  declines: Declines,
  categories: string[]
): GuidedProgress {
  const result: QuestionProgress[] = questions.map((question) => {
    const mine = entries.filter((e) => e.questionKey === question.key);
    const declinedFor = declines[question.key] ?? [];

    const byCategory: CategoryState[] = mine.map((e) => ({
      category: e.category,
      state: e.answerKind as QuestionState,
      entryId: e.id,
      content: e.content,
    }));

    // Declines that are not already represented by an answer. An answer
    // wins: if the owner wrote something and also once declined, the
    // thing they wrote is the truth.
    for (const category of declinedFor) {
      if (byCategory.some((c) => sameCategory(c.category, category))) continue;
      byCategory.push({ category, state: "declined" });
    }

    const coversEverything = byCategory.some((c) => c.category === null);
    const openCategories = coversEverything
      ? []
      : categories.filter((c) => !byCategory.some((b) => sameCategory(b.category, c)));

    return {
      question,
      // A decline resolves it too: the owner has dealt with the question,
      // they have simply chosen silence, and continuing to count it as
      // outstanding would be nagging them for an answer they declined.
      resolved: byCategory.length > 0,
      byCategory,
      openCategories,
    };
  });

  return {
    questions: result,
    resolved: result.filter((q) => q.resolved).length,
    total: result.length,
  };
}

/**
 * The entries a visitor's question should be answered from.
 *
 * Not used by retrieval — answers are ordinary knowledge_base rows and
 * reach the prompt the same way everything else does. This exists so the
 * dashboard can show the owner which of their answers apply to a given
 * category without re-querying.
 */
export function entriesForCategory(
  entries: GuidedEntry[],
  category: string | null
): GuidedEntry[] {
  return entries.filter((e) => e.category === null || sameCategory(e.category, category));
}
