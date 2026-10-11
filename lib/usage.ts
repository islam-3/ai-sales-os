import { supabaseServer } from "./supabase-server";
import { calculateCostUsd, type TokenCounts } from "./ai-pricing";

// Every model call in the product appears here, and every one of them
// calls recordUsage. That is not tidiness — README.md carries ONE number
// for cost per conversation, broken down by call, and a call missing
// from this list is a call missing from that number. Four were missing
// for months (the classifier, coverage, and both halves of answer-gap
// capture), which made the headline figure a floor reported as a total.
//
// Adding a model call to this product means adding a member here and a
// recordUsage call beside it, in the same change.
export type UsageCallType =
  | "chat_reply"
  | "lead_extraction"
  | "rag_embedding"
  | "knowledge_embedding"
  // Is this visitor hesitating or impatient? Haiku, every turn with text.
  | "visitor_signals"
  // Which practical details have they already given? Haiku, near a close.
  | "coverage_answered"
  // Does the business's material answer this? Sonnet, capped per conversation.
  | "answer_gap_judge"
  // The dashboard version of a captured question. Sonnet, only on a gap.
  | "question_shorten"
  // Embedding the short version, so captured questions can be grouped.
  // Separate from knowledge_embedding: that bucket is owner activity,
  // this one is conversation cost.
  | "question_embedding"
  // One-off, from the dashboard rather than a conversation.
  | "chat_intro_translation"
  // Drafting a welcome message from the business's own details, and
  // translating one. Both owner-initiated, both one call per press.
  | "greeting_suggestion"
  | "greeting_translation";

export type RecordUsageInput = {
  tenantId: string;
  /** Null for calls not tied to a conversation (knowledge-base embeddings). */
  sessionId?: string | null;
  callType: UsageCallType;
  provider: "anthropic" | "openai";
  model: string;
  tokens: TokenCounts;
};

/**
 * Records one billable model call.
 *
 * Never throws and never rejects. Cost tracking is observability, not
 * product behaviour — a failure to write a usage row must not break a
 * live conversation or fail an owner's knowledge-base save. Callers can
 * therefore fire this without awaiting and without a catch.
 *
 * Writes with supabaseServer because usage_events has no insert policy:
 * rows are only ever created server-side, never by a client.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const { tenantId, sessionId, callType, provider, model, tokens } = input;

    const { error } = await supabaseServer.from("usage_events").insert({
      tenant_id: tenantId,
      session_id: sessionId ?? null,
      call_type: callType,
      provider,
      model,
      input_tokens: tokens.inputTokens ?? 0,
      output_tokens: tokens.outputTokens ?? 0,
      cache_read_input_tokens: tokens.cacheReadInputTokens ?? 0,
      cache_write_input_tokens: tokens.cacheWriteInputTokens ?? 0,
      cost_usd: calculateCostUsd(model, tokens),
    });

    if (error) {
      console.error("Failed to record usage event:", error);
    }
  } catch (err) {
    console.error("Failed to record usage event:", err);
  }
}
