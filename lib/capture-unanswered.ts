// Capturing a question the business has no answer for.
//
// Runs AFTER the reply has gone out, through keepAlive, so a visitor
// never waits on any of it. Four steps, in this order, each one gated by
// the last so the expensive ones only run when they can matter:
//
//   1. does the message even contain a question?   — a regex, free
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
import { CONTAINS_QUESTION } from "./punctuation";
import {
  judgeAnswerGap,
  ANSWER_GAP_MODEL,
  MAX_JUDGE_CALLS_PER_CONVERSATION,
  type KnowledgeForJudge,
} from "./answer-gap";
import { shortenQuestion } from "./question-short";
import { generateEmbedding } from "./embeddings";
import { groupForAsk } from "./unanswered-questions";
import { parseEmbedding } from "./vectors";

export type CaptureOutcome =
  | "no_question"
  | "capped"
  | "answered"
  | "judge_unreachable"
  | "captured"
  | "failed";

/**
 * Whether this turn is worth judging at all.
 *
 * The cap counts asks already CAPTURED for this session, not judge calls
 * made, because that is what the table records and a count is cheaper
 * and more honest than a counter we would have to keep in step. It is a
 * slight over-allowance — a conversation of five answered questions
 * makes five judge calls — and that is the right way to be wrong: the
 * cap exists to bound the pathological case, and a visitor asking five
 * questions the business CAN answer is the product working.
 */
export function shouldJudge(message: string): boolean {
  return CONTAINS_QUESTION.test(message);
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
    if (!shouldJudge(question)) return "no_question";

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
    if (verdict.failed) {
      console.warn("[capture] judge unreachable", { tenantId, note: verdict.note });
      return "judge_unreachable";
    }
    if (verdict.answered) return "answered";

    // ── The dashboard version ─────────────────────────────────────────
    const short = await shortenQuestion(anthropic, question, teamLanguage);
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
      embedding = await generateEmbedding(short.text, tenantId);
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
