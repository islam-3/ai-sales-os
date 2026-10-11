// What to show on day one, before any customer has asked anything.
//
// The list this sits above is built from real questions, and on a new
// tenant it is empty. An empty list is not a problem to solve with
// invented content — but it is the moment an owner decides whether the
// page is for them, and four lines showing the SHAPE of what will appear
// is worth more than a sentence explaining it.
//
// ── What makes these different from the card that was removed ───────
// The twelve-question card asked the business our questions and counted
// their answers: "0 of 12" while the warranty, the brands and the
// durations all sat in the list below. These are not a checklist and
// nothing counts them. They are four suggestions, they disappear the
// moment real questions arrive, and each one disappears on its own as
// soon as it is answered.
//
// They are also the four that every business gets asked, whatever it
// sells — not a guess at an industry. A customer deciding whether to
// buy wants to know what it costs, what they get, how long it takes and
// what happens if it goes wrong. A clinic, a law firm, a garage and a
// language school are all asked these; none of them is asked ours.

/** How many to show. Four fits above the fold and does not read as a form. */
export const MAX_STARTERS = 4;

export type StarterQuestion = {
  /**
   * Stable key, written to knowledge_base.question_key when answered.
   *
   * This is the one thing question_key survives for: it is how a
   * suggestion knows it has been dealt with, without reading the text
   * of any entry to guess.
   */
  key: string;
  /** Shown to the owner, phrased as a customer would ask it. */
  question: string;
  /** Prefilled as the entry's title when [Add answer] is clicked. */
  title: string;
};

export const STARTER_QUESTIONS: StarterQuestion[] = [
  {
    key: "starter_price",
    question: "How much does it cost?",
    title: "Prices",
  },
  {
    key: "starter_included",
    question: "What is included in the price?",
    title: "What's included",
  },
  {
    key: "starter_duration",
    question: "How long does it take?",
    title: "How long it takes",
  },
  {
    key: "starter_guarantee",
    question: "What happens if something goes wrong?",
    title: "Guarantee",
  },
];

/**
 * The starters still worth showing.
 *
 * Empty once any real question has been captured — a suggestion of ours
 * must never compete for space with something a customer actually
 * asked. Also empty once all four are answered.
 */
export function remainingStarters(
  answeredKeys: string[],
  capturedQuestionCount: number
): StarterQuestion[] {
  if (capturedQuestionCount > 0) return [];
  const answered = new Set(answeredKeys);
  return STARTER_QUESTIONS.filter((s) => !answered.has(s.key)).slice(0, MAX_STARTERS);
}
