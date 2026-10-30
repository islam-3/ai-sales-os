// Capturing a question the business has no answer for.
//
// Runs AFTER the reply has gone out, through keepAlive, so a visitor
// never waits on any of it. Four steps, in this order, each one gated by
// the last so the expensive ones only run when they can matter:
//
//   1. is the visitor asking for anything at all?  — one key on the
//                                                    classifier that
//                                                    already ran this turn
//   2. has this conversation used up either cap?   — a reservation
//                                                    taken in Postgres,
//                                                    free: 4 rows and
//                                                    8 judge calls
//   3. does the knowledge base answer it?          — the judge, Sonnet
//   4. rewrite it for the dashboard and group it   — one Sonnet call,
//                                                    choosing among the
//                                                    ten nearest groups
//
// ── Structural, never by reading the reply ──────────────────────────
// Nothing here looks at what the assistant said. The reply sounding
// unsure, apologising, or hedging is not evidence: a good assistant
// hedges about a price it does not have AND about one it does, and a bad
// one states a price nobody gave it. The only question asked is whether
// the material the business wrote contains the answer, and it is asked
// of the material directly.

import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  judgeAnswerGap,
  ANSWER_GAP_MODEL,
  MAX_CAPTURED_ROWS_PER_CONVERSATION,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
  type KnowledgeForJudge,
} from "./answer-gap";
import { shortenAndMatch, SHORTEN_MODEL } from "./question-short";
import { generateEmbedding } from "./embeddings";
import { recordUsage } from "./usage";
import { nearestGroups, MATCH_CANDIDATES } from "./unanswered-questions";
import { parseEmbedding } from "./vectors";

export type CaptureOutcome =
  /** The conversation already has its four rows. */
  | "capped"
  /**
   * The conversation has spent its eight judge calls.
   *
   * Told apart from "capped" on purpose. They mean different things to
   * anyone reading logs: the first is a dashboard that has heard enough
   * from one visitor, the second is a conversation that has cost what
   * it is allowed to cost — and a tenant hitting the second often is
   * the signal that the real-time judge should become the daily batch.
   */
  | "judge_capped"
  | "answered"
  | "judge_unreachable"
  | "captured"
  | "failed";

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
 */
export function shouldJudge(signals: {
  asking_for_information: boolean;
  direct_request: boolean;
}): boolean {
  return signals.asking_for_information || signals.direct_request;
}

/**
 * Judges one question and, if the business has no answer, records it.
 *
 * Never throws. Every failure path returns an outcome instead, because
 * this runs detached from the request and an unhandled rejection here
 * would be an unexplained log line and nothing else.
 */
export async function captureIfUnanswered({
  supabase,
  anthropic,
  tenantId,
  sessionId,
  question,
  knowledge,
  teamLanguage,
  script,
}: {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  tenantId: string;
  sessionId: string;
  /** The visitor's message, as they typed it. */
  question: string;
  /** Everything the business has written. The judge sees all of it. */
  knowledge: KnowledgeForJudge[];
  /** The language the team reads, as a NAME. */
  teamLanguage: string;
  /** The script the visitor is writing in. Detected from the text, never a model's guess. */
  script: string | null;
}): Promise<CaptureOutcome> {
  try {
    // The gate is the caller's decision, not re-derived here. It reads
    // the classifier result the chat route already has, and re-reading
    // it would mean a second classifier call on every turn.

    // ── The cap ───────────────────────────────────────────────────────
    //
    // A RESERVATION, not a count. This used to count the session's rows
    // and then call the judge, which is two operations with seconds
    // between them: the judge, the rewrite and the embedding all run
    // before the row exists. A visitor whose next message arrives inside
    // that window got a second capture counting the same stale total.
    //
    // Observed, not theorised — 2026-10-17, against production: a
    // session captured five rows against a cap of four, and the fifth
    // was inserted 2.8s after the fourth, less time than its own chain
    // takes. The cost of the overrun is a judge call, which is a whole
    // knowledge base of input.
    //
    // reserve_capture_slot takes the slot under an advisory lock on the
    // session, counting rows AND slots held by captures still deciding,
    // so two in flight cannot both pass. See the migration for why the
    // reservations are not pending rows in this table.
    //
    // TWO caps, one reservation. Rows bound what reaches the dashboard;
    // judge calls bound what the conversation can spend. The second did
    // not exist before — the old cap counted rows and let an answered
    // question buy a judge call for free.
    const { data, error: reserveError } = await supabase.rpc("reserve_capture_slot", {
      p_tenant_id: tenantId,
      p_session_id: sessionId,
      p_max_rows: MAX_CAPTURED_ROWS_PER_CONVERSATION,
      p_max_judge_calls: MAX_JUDGE_CALLS_PER_CONVERSATION,
    });

    // A failed reservation is treated as at the cap, not under it. Each
    // judge call is a whole knowledge base of input; the failure that
    // costs money is the one that decides to spend it.
    if (reserveError) {
      console.error("[capture] could not reserve a capture slot", reserveError);
      return "failed";
    }

    // A table-returning function comes back as an array of one row.
    const reservation = (Array.isArray(data) ? data[0] : data) as
      | { slot_id: string | null; refusal: string | null }
      | undefined;
    const slotId = reservation?.slot_id ?? null;
    if (!slotId) return reservation?.refusal === "judge_calls" ? "judge_capped" : "capped";

    // Released on EVERY path below, including the throw: a slot still
    // held by a capture that is no longer running is a dashboard row
    // this session can never fill. Marked released rather than deleted,
    // so it still counts as a judge call spent — see the migration.
    // The row, once written, is what holds the row count.
    try {
      return await judgeAndRecord();
    } finally {
      const { error: releaseError } = await supabase
        .from("unanswered_capture_slots")
        .update({ released_at: new Date().toISOString() })
        .eq("id", slotId);
      if (releaseError) {
        // Not fatal and not worth failing an outcome that already
        // happened. The reservation is swept five minutes from now, and
        // until then this session is one row poorer — which is the
        // direction that does not spend money.
        console.warn("[capture] could not release the capture slot", releaseError.message);
      }
    }
  } catch (error) {
    console.error("[capture] unexpected failure", error);
    return "failed";
  }

  /**
   * Everything the reserved slot pays for. Inner so that the release
   * above wraps all of it, including the paths that return early.
   */
  async function judgeAndRecord(): Promise<CaptureOutcome> {
    // ── The judge ─────────────────────────────────────────────────────
    const verdict = await judgeAnswerGap(anthropic, question, knowledge);

    // Metered whatever it decided. "Answered" is the common case and
    // the cheapest outcome for the owner, but it is not a free call,
    // and a breakdown that only recorded the gaps would understate
    // this feature by however often the business has the answer.
    if (verdict.usage) {
      await recordUsage({
        tenantId,
        sessionId,
        callType: "answer_gap_judge",
        provider: "anthropic",
        model: ANSWER_GAP_MODEL,
        tokens: {
          inputTokens: verdict.usage.input,
          outputTokens: verdict.usage.output,
          cacheReadInputTokens: verdict.usage.cacheRead,
          cacheWriteInputTokens: verdict.usage.cacheWrite,
        },
      });
    }

    if (verdict.failed) {
      console.warn("[capture] judge unreachable", { tenantId, note: verdict.note });
      return "judge_unreachable";
    }
    if (verdict.answered) return "answered";

    // ── The groups it might belong to ─────────────────────────────────
    // Read BEFORE shortening now, because the shortening call is also
    // the call that picks the group. Only each group's canonical row —
    // see nearestGroups for why anchoring beats matching any member.
    //
    // Dismissed groups are included: a new ask has to join the group it
    // belongs to whether or not the owner dismissed it, because joining
    // it is exactly what eventually brings it back.
    const { data: canonicalRows, error: groupError } = await supabase
      .from("unanswered_questions")
      .select("group_id, embedding, question_short")
      .eq("tenant_id", tenantId)
      .eq("is_canonical", true);

    if (groupError) {
      // Not fatal. Worst case this ask starts its own group and shows
      // up as a near-duplicate of one already listed, which an owner
      // can read past. Losing the question would be worse.
      console.warn("[capture] could not read existing groups", groupError.message);
    }

    const canonical = (canonicalRows ?? []).map((r) => ({
      id: r.group_id as string,
      title: r.question_short as string,
      embedding: parseEmbedding(r.embedding),
    }));

    // Ranked by the customer's OWN words, not the short line: the short
    // line does not exist until the call these candidates are for. Raw
    // text in any script against short English lines ranks less well
    // than English against English, and a right group that misses the
    // top ten is a duplicate line, never a wrong merge. Skipped entirely
    // at ten groups or fewer, where every group is sent.
    let queryEmbedding: number[] | null = null;
    if (canonical.length > MATCH_CANDIDATES) {
      try {
        queryEmbedding = await generateEmbedding(question, tenantId, {
          callType: "question_candidate_embedding",
          sessionId,
        });
      } catch (error) {
        console.warn("[capture] could not embed the question to rank groups", {
          tenantId,
          detail: String((error as Error).message).slice(0, 120),
        });
      }
    }
    const candidates = nearestGroups(queryEmbedding, canonical);

    // ── The dashboard version, and which group ────────────────────────
    // One call. The model decides whether the question is one of the
    // candidates; validated at 0 wrong merges in 123 decisions against
    // ten groups (docs/question-match-2026-10-30.txt).
    const short = await shortenAndMatch(anthropic, question, teamLanguage, candidates);
    const existingGroup = short.groupId;
    if (short.usage) {
      // Awaited, like the judge above: this whole function already runs
      // after the response has gone out, so awaiting costs the visitor
      // nothing and guarantees the row is written before a serverless
      // invocation can be frozen. The same reasoning as the lead
      // extractor's recordUsage call.
      await recordUsage({
        tenantId,
        sessionId,
        callType: "question_shorten",
        provider: "anthropic",
        model: SHORTEN_MODEL,
        tokens: { inputTokens: short.usage.input, outputTokens: short.usage.output },
      });
    }
    if (short.rejected) {
      console.warn("[capture] short version rejected", {
        tenantId,
        reason: short.reason,
      });
    }

    // Embedded so that later asks can rank this one as a candidate. A
    // failure here is not a reason to drop the question; the group just
    // ranks last until a tenant has few enough groups to send them all.
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(short.text, tenantId, {
        callType: "question_embedding",
        sessionId,
      });
    } catch (error) {
      console.warn("[capture] could not embed the short version", {
        tenantId,
        detail: String((error as Error).message).slice(0, 120),
      });
    }

    // ── The row ───────────────────────────────────────────────────────
    // The id is generated here so a new group can be written in one
    // statement, pointing at itself. Inserting with a placeholder and
    // repairing it afterwards would leave a window in which a crash
    // strands a row belonging to no group, which nothing would ever
    // show and nothing would ever clean up.
    const id = randomUUID();
    const { error: insertError } = await supabase.from("unanswered_questions").insert({
      id,
      tenant_id: tenantId,
      session_id: sessionId,
      question_raw: question,
      question_short: short.text,
      script,
      embedding,
      judge_note: verdict.note,
      judge_model: ANSWER_GAP_MODEL,
      group_id: existingGroup ?? id,
    });

    if (insertError) {
      console.error("[capture] could not record the question", insertError);
      return "failed";
    }

    return "captured";
  }
}
