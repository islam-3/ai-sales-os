// Should this turn's message be judged for "no answer yet" capture?
//
// Pure, and in its own module so a free test can import it without
// loading a model or database client (scripts/test-live-gate.ts).

/**
 * Whether this turn is worth judging at all.
 *
 * ── Why not a question mark ─────────────────────────────────────────
 * That was the first gate, it was free, and it caught NOTHING: 0 of 57
 * visitor messages on the real clinic's tenant contain a question mark,
 * in any script. People type fragments — "give me the price", "dental
 * implants". A keyword list was the obvious alternative and is not
 * available either: the lists this project's classifier replaced scored
 * ZERO recall on every signal in five of six failure classes.
 *
 * So the gate is a key on the Haiku classifier that already runs on
 * every turn. Added cost ~$0.00005 per turn, measured at ~45 more input
 * and ~8 more output tokens.
 *
 * ── Why the OR, which is the measurement talking ────────────────────
 * `asking_for_information` alone scored 100% precision and only 42%
 * recall, and 24 of the 25 misses per run were ONE behaviour: the model
 * treats the keys as mutually exclusive, so a request to be shown
 * photos sets `direct_request` and leaves this one false. Identical in
 * all six classes, all three runs.
 *
 * `direct_request` scored 100% precision and 100% recall in the same
 * run, and there is not a single labelled case where it is true while
 * `asking_for_information` is false — so the OR adds no false-positive
 * surface at all. Together: recall 97.7%, still zero false positives.
 *
 * Both halves come from the one validated run,
 * docs/classifier-five-key-2026-10-11.log.
 *
 * ── Which way it fails ──────────────────────────────────────────────
 * A false positive here costs a judge call AND puts a non-question on
 * an owner's dashboard — "khaled" under "customers asked, no answer
 * yet". Zero of those in 360 calls. A false negative costs a row nobody
 * sees. The one surviving miss is "should I send you a photo of my
 * teeth?", which the classifier reads as hesitation instead.
 *
 * ── The dependency this gate introduces ─────────────────────────────
 * The classifier has to complete. It runs on a 2,000ms budget and
 * returns NO_SIGNALS on a timeout or any error, so every key reads
 * false and nothing is captured for that turn. Capture fails CLOSED,
 * which is the right direction — a missed row beats a wrong one — but
 * it is a dependency the question-mark gate did not have. A degraded
 * classifier now means a quietly empty dashboard as well as a quietly
 * blunted assistant.
 *
 * ── asks_about_price joins the OR, for the same reason ──────────────
 * Adding the sixth key (docs/classifier-price-key-2026-11-12.log) took
 * asking_for_information recall from 42% to 31% on the same 120 cases,
 * with precision unchanged: the model partitions again, and a price
 * question now sets asks_about_price instead. Price is the most-captured
 * question on the dashboard, so without this the gate would quietly
 * stop capturing it. asks_about_price scored 100% precision and recall
 * in all six classes, so it adds no false-positive surface.
 *
 * ── An acceptance is not a question (2026-11-19) ────────────────────
 * On gpt-6-luna the gate scored 91.8% precision against Haiku's 100%:
 * 11 of its 13 false positives over two runs were the visitor accepting
 * an offer ("yes please", "أكيد، أرني", "vale, enséñamelas"), with
 * direct_request set as well as accepts_offer (docs/capture-gate-luna-
 * 2026-11-19.log). Nothing between this gate and the judge filters
 * them, so "yes please" would be judged as a question and could reach
 * the dashboard. So a turn the classifier reads as accepting an offer is
 * not captured, UNLESS it also asks about price: "yes, and how much is
 * it?" is still a question the business may not answer.
 */
export function shouldJudge(signals: {
  asking_for_information: boolean;
  direct_request: boolean;
  asks_about_price?: boolean;
  accepts_offer?: boolean;
}): boolean {
  if (signals.asks_about_price === true) return true;
  if (signals.accepts_offer === true) return false;
  return signals.asking_for_information || signals.direct_request;
}
