// Capturing a question the business has no answer for.
//
// Runs AFTER the reply has gone out, through keepAlive, so a visitor
// never waits on any of it. Four steps, in this order, each one gated by
// the last so the expensive ones only run when they can matter:
//
//   1. is the visitor asking for anything at all?  — one key on the
//                                                    classifier that
//                                                    already ran this turn
//   2. has this conversation used up its cap?      — a count, free
//   3. does the knowledge base answer it?          — the judge, Sonnet
//   4. rewrite it for the dashboard and group it   — Sonnet + embedding
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
  MAX_JUDGE_CALLS_PER_CONVERSATION,
  type KnowledgeForJudge,
} from "./answer-gap";
import { shortenQuestion, SHORTEN_MODEL } from "./question-short";
import { generateEmbedding } from "./embeddings";
import { recordUsage } from "./usage";
import { groupForAsk } from "./unanswered-questions";
import { parseEmbedding } from "./vectors";

export type CaptureOutcome =
  | "capped"
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
    const { count, error: countError } = await supabase
      .from("unanswered_questions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId);

    // A failed count is treated as at the cap, not under it. Each judge
    // call is a whole knowledge base of input; the failure that costs
    // money is the one that decides to spend it.
    if (countError) {
      console.error("[capture] could not count this session's asks", countError);
      return "failed";
    }
    if ((count ?? 0) >= MAX_JUDGE_CALLS_PER_CONVERSATION) return "capped";

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

    // ── The dashboard version ─────────────────────────────────────────
    const short = await shortenQuestion(anthropic, question, teamLanguage);
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

    // Embedded for grouping. A failure here is not a reason to drop the
    // question: it becomes its own group, which is exactly what an
    // ungroupable ask should be.
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

    // ── Which group ───────────────────────────────────────────────────
    // Only each group's canonical row is compared against — see
    // groupForAsk for why anchoring beats matching any member.
    //
    // Dismissed groups are included: a new ask has to join the group it
    // belongs to whether or not the owner dismissed it, because joining
    // it is exactly what eventually brings it back.
    const { data: canonicalRows, error: groupError } = await supabase
      .from("unanswered_questions")
      .select("group_id, embedding")
      .eq("tenant_id", tenantId)
      .eq("is_canonical", true);

    if (groupError) {
      // Not fatal. Worst case this ask starts its own group and shows
      // up as a near-duplicate of one already listed, which an owner
      // can read past. Losing the question would be worse.
      console.warn("[capture] could not read existing groups", groupError.message);
    }

    const existingGroup = groupForAsk(
      embedding,
      (canonicalRows ?? []).map((r) => ({
        groupId: r.group_id as string,
        embedding: parseEmbedding(r.embedding),
      }))
    );

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
  } catch (error) {
    console.error("[capture] unexpected failure", error);
    return "failed";
  }
}
