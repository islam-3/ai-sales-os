// Resilience inside OpenAI: retry, then a second OpenAI model, then give up.
//
// The decided end state is OpenAI only, with no Claude anywhere, fallback
// included. So when a model call fails, the order is:
//
//   1. the same model again, ONCE, and only for a failure worth retrying
//      (rate limited, overloaded, timed out, unreachable);
//   2. the next OpenAI model in the list;
//   3. nothing: the last error is thrown, and the caller's existing
//      failure path runs. For the chat reply that is the safe fallback
//      sentence in the visitor's language (handleChat's catch).
//
// A failure NOT worth retrying (bad request, auth, no credit) skips
// straight to the next model: a second identical request would fail the
// same way. The SDK's own silent retries are turned off by the caller
// (maxRetries: 0), so this is the whole policy and its worst case is
// bounded: at most two attempts on the first model and one on each
// after it.
//
// Pure apart from the call it is given, and the clock: tested with fakes
// in scripts/test-openai-fallback.ts.

import { classifyModelError, type ModelFailureKind } from "./model-errors";

export type FallbackAttempt = { model: string; ok: boolean; kind?: ModelFailureKind; status?: number; ms: number };

export class AllModelsFailed extends Error {
  constructor(public attempts: FallbackAttempt[], public last: unknown) {
    super(`every OpenAI model failed: ${attempts.map((a) => `${a.model} ${a.kind ?? "ok"}`).join(", ")}`);
    this.name = "AllModelsFailed";
  }
}

export async function withOpenAIFallback<T>(
  models: readonly string[],
  call: (model: string) => Promise<T>,
  options: { retryDelayMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}
): Promise<{ value: T; model: string; attempts: FallbackAttempt[] }> {
  if (models.length === 0) throw new Error("withOpenAIFallback: no models");
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const retryDelayMs = options.retryDelayMs ?? 400;
  const attempts: FallbackAttempt[] = [];
  let last: unknown;

  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    // Only the first model is retried: by the time a second one is in
    // play the visitor has already waited for two failures.
    const tries = m === 0 ? 2 : 1;
    for (let t = 0; t < tries; t++) {
      const started = now();
      try {
        const value = await call(model);
        attempts.push({ model, ok: true, ms: now() - started });
        return { value, model, attempts };
      } catch (error) {
        last = error;
        const failure = classifyModelError(error);
        attempts.push({ model, ok: false, kind: failure.kind, status: failure.status, ms: now() - started });
        if (!failure.retryable) break;
        if (t + 1 < tries) await sleep(retryDelayMs);
      }
    }
  }
  throw new AllModelsFailed(attempts, last);
}
