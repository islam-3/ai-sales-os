import { supabaseServer } from "./supabase-server";
import { calculateCostUsd, type TokenCounts } from "./ai-pricing";

export type UsageCallType =
  | "chat_reply"
  | "lead_extraction"
  | "rag_embedding"
  | "knowledge_embedding";

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
