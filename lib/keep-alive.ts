// Work that must finish after the response has been sent.
//
// A serverless instance can be frozen or reclaimed the moment its
// response returns. A promise started but not awaited is then killed
// mid-flight, and nothing anywhere reports it: the visitor got their
// reply, the function returned 200, and the work simply never happened.
//
// That is not hypothetical. Lead extraction was fired this way and the
// LAST turn of every conversation lost its result — the turn that
// carries the name and the phone number, because nothing arrives after
// it to keep the instance alive. Reproduced four times out of four
// against production on 2026-09-22; earlier turns survived only because
// the visitor's next message happened to wake the instance in time.
//
// waitUntil() hands the promise to the host, which holds the instance
// open until it settles. Off Vercel there is no host to hand it to and
// the call is a no-op — harmless in local dev, where the process lives
// on regardless, but it means a missing runtime context downgrades to
// silence. So this checks for the context itself and says so when it is
// gone, rather than letting the same failure return unannounced.

import { waitUntil } from "@vercel/functions";

/** How the platform exposes the per-request context to the runtime. */
const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

type ContextHolder = { get?: () => { waitUntil?: unknown } | undefined };

function hostCanHold(): boolean {
  const holder = (globalThis as unknown as Record<symbol, ContextHolder | undefined>)[
    REQUEST_CONTEXT
  ];
  return typeof holder?.get?.()?.waitUntil === "function";
}

// Once per instance. This is a standing condition, not an event, and a
// line per request would bury the logs it is trying to draw attention to.
let warned = false;

/**
 * Runs background work to completion, past the response.
 *
 * The promise must handle its own errors. Anything that rejects here is
 * caught and logged rather than allowed to surface as an unhandled
 * rejection, which on some runtimes takes the whole instance down and
 * would turn a missing lead into a failed conversation.
 */
export function keepAlive(promise: Promise<unknown>, label: string): void {
  const safe = promise.catch((error) => {
    console.error(`[keep-alive] ${label} failed:`, error);
  });

  if (hostCanHold()) {
    waitUntil(safe);
    return;
  }

  // No host hold. In local dev that is expected and fine. On Vercel it
  // means background work is being dropped again, which is worth a loud
  // line in the logs, because the symptom otherwise is a lead that is
  // merely missing.
  if (process.env.VERCEL && !warned) {
    warned = true;
    console.error(
      `[keep-alive] no request context on Vercel — background work ("${label}") ` +
        `is not being held open and may be killed when the response returns. ` +
        `This is the lost-lead failure; check that @vercel/functions matches the runtime.`
    );
  }
}
