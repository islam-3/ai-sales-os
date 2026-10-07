// Why a model call failed, in terms someone can act on.
//
// The greeting translation used to report every failure as "The
// translation service did not respond. Try again." The service had
// responded in 280ms, with a 400 saying the account was out of credit.
// Retrying could never work, and the owner spent an afternoon looking at
// a broken card with no next step.
//
// That is the failure this module exists to prevent: one catch-all
// swallowing a billing refusal, an expired key, a rate limit and a
// genuine timeout into a single sentence that is wrong about three of
// them.
//
// Two consumers, deliberately sharing one classifier:
//   * the dashboard, which shows `ownerMessage` to the business;
//   * app/api/chat/route.ts, which logs `kind` and serves a safe
//     fallback instead of a 500.

export type ModelFailureKind =
  | "no_credit"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "bad_request"
  | "unreachable"
  | "unknown";

export type ModelFailure = {
  kind: ModelFailureKind;
  /** HTTP status, when the API actually answered. */
  status?: number;
  /** For the log. Never shown to a visitor. */
  detail: string;
  /**
   * Whether trying the same thing again could plausibly work.
   *
   * The whole point. "Try again" is only ever appended when this is
   * true, because telling someone to retry a billing refusal is worse
   * than saying nothing.
   */
  retryable: boolean;
  /** What the BUSINESS OWNER reads in the dashboard. */
  ownerMessage: string;
};

function messageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as { message?: unknown };
  return typeof e.message === "string" ? e.message : String(error);
}

function statusOf(error: unknown): number | undefined {
  const e = error as { status?: unknown; statusCode?: unknown };
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.statusCode === "number") return e.statusCode;
  return undefined;
}

/**
 * Classifies whatever the SDK threw.
 *
 * Matched on status first and wording second. The Anthropic SDK puts the
 * API's JSON body into the message, so the credit refusal is only
 * distinguishable from any other 400 by its text — which is fragile, and
 * is why the fallback for an unrecognised 400 is still a safe, honest
 * message rather than a guess.
 */
export function classifyModelError(error: unknown): ModelFailure {
  const detail = messageOf(error).slice(0, 300);
  const status = statusOf(error);
  const lower = detail.toLowerCase();
  const name = (error as { name?: string })?.name ?? "";

  if (lower.includes("credit balance") || lower.includes("insufficient_quota") || lower.includes("billing")) {
    return {
      kind: "no_credit",
      status,
      detail,
      retryable: false,
      ownerMessage:
        "The AI account has run out of credit, so this could not be generated. " +
        "Nothing was changed. This needs topping up — trying again will not help until it is.",
    };
  }

  if (status === 401 || status === 403 || lower.includes("invalid x-api-key") || lower.includes("authentication")) {
    return {
      kind: "auth",
      status,
      detail,
      retryable: false,
      ownerMessage:
        "The AI service rejected our credentials, so this could not be generated. " +
        "Nothing was changed. Trying again will not help — this one is on us, please get in touch.",
    };
  }

  if (status === 429 || lower.includes("rate limit")) {
    return {
      kind: "rate_limited",
      status,
      detail,
      retryable: true,
      ownerMessage:
        "The AI service is rate limiting us right now. Nothing was changed. Wait a minute and try again.",
    };
  }

  if (status === 529 || status === 503 || lower.includes("overloaded")) {
    return {
      kind: "overloaded",
      status,
      detail,
      retryable: true,
      ownerMessage: "The AI service is overloaded right now. Nothing was changed. Try again in a moment.",
    };
  }

  if (name === "AbortError" || lower.includes("aborted") || lower.includes("timeout") || lower.includes("timed out")) {
    return {
      kind: "timeout",
      status,
      detail,
      retryable: true,
      ownerMessage: "That took too long and was stopped. Nothing was changed. Try again.",
    };
  }

  // No status at all means the request never got an answer — DNS, a
  // dropped socket, no network. Distinct from a timeout, and retryable
  // for the same reason.
  if (status === undefined && (lower.includes("fetch failed") || lower.includes("econn") || lower.includes("network"))) {
    return {
      kind: "unreachable",
      status,
      detail,
      retryable: true,
      ownerMessage: "We could not reach the AI service. Nothing was changed. Try again in a moment.",
    };
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return {
      kind: "bad_request",
      status,
      detail,
      retryable: false,
      ownerMessage:
        `The AI service refused the request (${status}). Nothing was changed. ` +
        "Trying again will not help — this one is on us, please get in touch.",
    };
  }

  return {
    kind: "unknown",
    status,
    detail,
    retryable: true,
    ownerMessage: "Something went wrong generating this. Nothing was changed. Try again.",
  };
}

/**
 * The owner-facing sentence, with "Try again" only where it is true.
 *
 * Kept as its own function so a caller cannot accidentally print a
 * retry instruction next to a billing refusal — which is the exact
 * sentence this module was written to delete.
 */
export function ownerFacingError(error: unknown): string {
  return classifyModelError(error).ownerMessage;
}
