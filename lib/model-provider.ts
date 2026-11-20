// Which provider every model call uses: OpenAI, for every tenant.
//
// Switched on 2026-11-20 after the migration's final check passed on a
// second, non-clinic test tenant through the deployed route
// (docs/final-check-realty-2026-11-20.md): every call on OpenAI, the
// classifier's p95 1,325 ms on Vercel, every bar met. The models are
// OPENAI_STACK in lib/test-tenant.ts, each measured against the
// Anthropic call it replaces (README, "Cost per conversation").
//
// MODEL_PROVIDER=anthropic is the rollback: set it in Vercel and the
// previous models (Sonnet, Haiku) serve every tenant again, with no code
// change. It exists until the Anthropic SDK and key are removed (part 2
// of the switch, after a few days of clean production traffic). Under
// it, a test tenant can still ask for the OpenAI stack.

import { testOpenAIStack } from "./test-tenant";

/** Whether OpenAI serves every tenant. False only under the rollback. */
export function openAIActive(provider: string | undefined = process.env.MODEL_PROVIDER): boolean {
  return provider !== "anthropic";
}

/**
 * Whether THIS request runs on the OpenAI stack: always, unless the
 * rollback is set, and then only for a test tenant that asks for it.
 */
export function openAIStackFor(
  requested: unknown,
  settings: { is_test?: boolean } | null | undefined,
  provider: string | undefined = process.env.MODEL_PROVIDER
): boolean {
  return openAIActive(provider) || testOpenAIStack(requested, settings);
}
