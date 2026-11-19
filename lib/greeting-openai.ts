// The greeting suggestion and translation on OpenAI.
//
// MEASUREMENT ONLY for now: the dashboard actions in
// app/dashboard/business/actions.ts still call Sonnet. Same prompts
// (lib/greeting-prompts.ts), same user message, same clean-up of the
// answer, so what is measured is what the owner would see.

import type OpenAI from "openai";
import type { TokenCounts } from "./ai-pricing";
import {
  buildGreetingSuggestionPrompt,
  buildGreetingTranslationPrompt,
  type GreetingDraftInput,
  type GreetingTranslationInput,
} from "./greeting-prompts";
import { openAIUsageToTokens } from "./reply-openai";

/** Strips the quotes a model sometimes wraps prose in, as suggestGreeting does. */
export function cleanSuggestion(text: string): string {
  return text.trim().replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();
}

/** The translation's JSON, read as translateGreeting reads it. Null when unusable. */
export function parseTranslation(raw: string, fallbackChips: string[]): { text: string; chips: string[] } | null {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: { text?: unknown; chips?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text) return null;
  const chips = Array.isArray(parsed.chips)
    ? parsed.chips.filter((c): c is string => typeof c === "string" && !!c.trim()).map((c) => c.trim())
    : fallbackChips;
  return { text, chips };
}

export async function suggestGreetingOpenAI(
  client: OpenAI,
  model: string,
  input: GreetingDraftInput
): Promise<{ text: string; tokens: TokenCounts | null }> {
  const res = await client.responses.create({
    model,
    instructions: buildGreetingSuggestionPrompt(input),
    input: [{ role: "user", content: "Write it." }],
    max_output_tokens: 500,
    reasoning: { effort: "none" },
    store: false,
  });
  return { text: cleanSuggestion(res.output_text ?? ""), tokens: res.usage ? openAIUsageToTokens(res.usage) : null };
}

export async function translateGreetingOpenAI(
  client: OpenAI,
  model: string,
  input: GreetingTranslationInput
): Promise<{ translated: { text: string; chips: string[] } | null; raw: string; tokens: TokenCounts | null }> {
  const res = await client.responses.create({
    model,
    instructions: buildGreetingTranslationPrompt(input),
    input: [{ role: "user", content: JSON.stringify({ text: input.text, chips: input.chips }) }],
    max_output_tokens: 900,
    reasoning: { effort: "none" },
    store: false,
  });
  const raw = res.output_text ?? "";
  return { translated: parseTranslation(raw, input.chips), raw, tokens: res.usage ? openAIUsageToTokens(res.usage) : null };
}
