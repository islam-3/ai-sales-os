// The chat reply, written by an OpenAI model instead of Sonnet.
//
// EXPERIMENT ONLY. Reached through testReplyModel in lib/test-tenant.ts,
// which returns null on every tenant that is not a test tenant. Nothing
// else in the product calls an OpenAI chat model.
//
// ── What maps to what ───────────────────────────────────────────────
// The Anthropic request is a list of system blocks plus messages. The
// OpenAI Responses API takes `instructions` plus `input`:
//
//   system blocks       -> instructions, concatenated with NO separator,
//                          because the blocks already carry their own
//                          leading "\n\n" (see route.ts). The model reads
//                          byte-for-byte the system text Sonnet reads.
//   messages            -> input, same roles, same text
//   cache_control       -> nothing. OpenAI caches the longest stable
//                          prefix automatically above 1,024 tokens; the
//                          stable part already comes first, and the
//                          per-turn state block last, as it does for
//                          Sonnet. prompt_cache_key keeps one tenant's
//                          requests together.
//   effort: "low"       -> reasoning effort "none". The Sonnet call has
//                          no thinking at all, and this is the like-for-
//                          like setting; reasoning tokens would also be
//                          billed as output.
//   max_tokens 1024     -> max_output_tokens 1024
//   stop_reason refusal -> a refusal content part, mapped to the same
//                          422 the route returns for a Sonnet refusal
//   store               -> false: a visitor's conversation is not kept
//                          at OpenAI beyond serving the request.

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { TokenCounts } from "./ai-pricing";

export type OpenAIReplyRequest = {
  instructions: string;
  input: { role: "user" | "assistant"; content: string }[];
};

/** The Anthropic reply request, as the Responses API takes it. Pure. */
export function toOpenAIReplyRequest(
  systemBlocks: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[]
): OpenAIReplyRequest {
  return {
    instructions: systemBlocks.map((b) => b.text).join(""),
    input: messages.map((m) => {
      if (typeof m.content !== "string") {
        // Every message the route builds is plain text. A content-block
        // message here would mean something changed upstream, and
        // silently dropping part of it would be worse than failing.
        throw new Error("reply-openai: only plain-text messages are mapped");
      }
      if (m.role !== "user" && m.role !== "assistant") {
        // The route never builds a mid-conversation system message; one
        // arriving here has no counterpart in this mapping.
        throw new Error(`reply-openai: unmapped role "${m.role}"`);
      }
      return { role: m.role, content: m.content };
    }),
  };
}

/**
 * OpenAI usage as our token columns.
 *
 * input_tokens INCLUDES cache reads and cache writes (OpenAI prompt
 * caching guide), so plain input is what is left after both. Reasoning
 * tokens are already inside output_tokens and billed as output.
 */
export function openAIUsageToTokens(usage: {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null;
}): TokenCounts {
  const read = usage.input_tokens_details?.cached_tokens ?? 0;
  const write = usage.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    inputTokens: Math.max(0, usage.input_tokens - read - write),
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: read,
    cacheWriteInputTokens: write,
  };
}

export type OpenAIReply = { text: string; refused: boolean; tokens: TokenCounts | null };

/** One reply. The client is passed in so this file loads no SDK client. */
export async function openAIReply(
  client: OpenAI,
  model: string,
  request: OpenAIReplyRequest,
  cacheKey: string
): Promise<OpenAIReply> {
  const response = await client.responses.create({
    model,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: 1024,
    reasoning: { effort: "none" },
    prompt_cache_key: cacheKey,
    store: false,
  });

  let refused = false;
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content) if (part.type === "refusal") refused = true;
    }
  }
  return {
    text: response.output_text ?? "",
    refused,
    tokens: response.usage ? openAIUsageToTokens(response.usage) : null,
  };
}
