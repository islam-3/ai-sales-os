// How long a conversation can be picked back up.
//
// Shared by the browser, which decides whether to even ask, and by
// app/api/chat/resume/route.ts, which is the authority. The client copy
// exists to avoid a pointless request, never to be trusted: localStorage
// is the visitor's to edit.

/**
 * 24 hours, measured from the FIRST message of the conversation.
 *
 * Long enough to cover a refresh, a closed tab, a phone that went to
 * sleep mid-sentence, and coming back after work. Short enough that
 * coming back two days later is treated as what it is — a new
 * conversation, about a situation that may have changed.
 *
 * From the first message rather than the last, so a conversation cannot
 * extend its own window by continuing. That matters because metering is
 * idempotent per session id: a session kept alive indefinitely would be
 * one conversation the tenant is ever billed for.
 */
export const RESUME_WINDOW_MS = Number(process.env.RESUME_WINDOW_MS ?? 24 * 60 * 60 * 1000);

/**
 * Where the browser keeps it, per tenant.
 *
 * The slug is in the KEY, not just the value. One browser can talk to
 * two different businesses, and a single shared key would hand one
 * clinic's transcript to the other's chat page — which the resume
 * endpoint would then refuse, leaving the visitor with a conversation
 * that silently failed to come back.
 */
export function sessionStorageKey(slug: string): string {
  return `nx.chat.session.${slug}`;
}

export type StoredSession = {
  id: string;
  /** Epoch ms of the first message, so the client can expire it itself. */
  startedAt: number;
};

/**
 * Reads the stored session, or null if there is nothing usable.
 *
 * Every failure mode returns null rather than throwing: localStorage
 * throws outright in a private window and in an embedded frame with
 * third-party storage blocked, and the chat page must open normally in
 * both. Losing resume is a degraded visit; a chat that will not load is
 * a lost lead.
 */
export function readStoredSession(slug: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey(slug));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.id !== "string" || typeof parsed?.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > RESUME_WINDOW_MS) return null;

    return { id: parsed.id, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

/** Stores it, and says nothing if it cannot. See readStoredSession. */
export function writeStoredSession(slug: string, session: StoredSession): void {
  try {
    window.localStorage.setItem(sessionStorageKey(slug), JSON.stringify(session));
  } catch {
    // Ignored on purpose.
  }
}

export function clearStoredSession(slug: string): void {
  try {
    window.localStorage.removeItem(sessionStorageKey(slug));
  } catch {
    // Ignored on purpose.
  }
}

// ── What this deliberately does NOT do ───────────────────────────────
//
// It does not deduplicate leads beyond the window. A visitor returning
// on day three gets a new session id, a new conversation — correctly
// counted and correctly billed — and a SECOND lead_profile row. The team
// still calls them twice.
//
// That is a different problem and it wants a different mechanism: a
// long-lived visitor id, stored separately, that resumes nothing and
// only lets a new lead be linked to the previous one. Widening this
// window instead would solve it badly, because metering is idempotent
// per session id and a 30-day session is 30 days of conversation for the
// price of one.
