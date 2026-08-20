// ─────────────────────────────────────────────────────────────────────
// ⚠️  VERIFY THESE PRICES BEFORE TRUSTING ANY COST FIGURE
//
// Model pricing changes, and these values were written from a snapshot
// that may already be stale. Every cost number the platform reports is
// only as accurate as this file.
//
// Check against the official pages and correct anything that differs:
//   Anthropic  https://www.anthropic.com/pricing
//   OpenAI     https://openai.com/api/pricing
//
// This is the ONE place prices live. Nothing else in the codebase should
// hardcode a rate.
// ─────────────────────────────────────────────────────────────────────

/** Prices are US dollars per 1,000,000 tokens. */
export type ModelPricing = {
  input: number;
  output: number;
  /**
   * Anthropic bills cached input at reduced//increased rates rather than
   * the standard input rate. Omit for models without prompt caching.
   */
  cacheRead?: number;
  cacheWrite?: number;
};

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic — $3.00 in / $15.00 out per 1M.
  // Cache read is conventionally 0.1x input and cache write 1.25x input;
  // both are derived here rather than independently sourced, so confirm.
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },

  // Anthropic Haiku 4.5 — used for lead extraction, a constrained
  // JSON task. Roughly a third the input price and a third the output
  // price of Sonnet. VERIFY, same as the rates above.
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },

  // OpenAI embeddings — output tokens don't apply.
  "text-embedding-3-small": {
    input: 0.02,
    output: 0,
  },
};

export type TokenCounts = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
};

/**
 * Cost in USD for one call. Returns 0 for an unknown model rather than
 * throwing — a missing price entry should never break a live
 * conversation, and an unpriced call is visible as a zero-cost row with
 * a real token count, which is an obvious signal something needs adding
 * to PRICING above.
 */
export function calculateCostUsd(model: string, tokens: TokenCounts): number {
  const pricing = PRICING[model];
  if (!pricing) {
    console.warn(`No pricing configured for model "${model}" — recording cost as 0.`);
    return 0;
  }

  const perToken = (rate: number) => rate / 1_000_000;

  return (
    (tokens.inputTokens ?? 0) * perToken(pricing.input) +
    (tokens.outputTokens ?? 0) * perToken(pricing.output) +
    (tokens.cacheReadInputTokens ?? 0) * perToken(pricing.cacheRead ?? pricing.input) +
    (tokens.cacheWriteInputTokens ?? 0) * perToken(pricing.cacheWrite ?? pricing.input)
  );
}
