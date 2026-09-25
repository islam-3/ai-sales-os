// What the assistant last offered to show, remembered by the server.
//
// The old design asked the transcript. It read back the assistant's own
// sentences, tried to recognise which of them were offers, and then
// matched the visitor's reply against knowledge-base titles to work out
// WHICH thing was being accepted. Every step of that is a text rule, and
// measured across six failure classes it scored 17% recall — English
// only, and even there only when a visitor happened to quote a title.
//
// None of it was necessary. The server DECIDED to offer something; it
// knew the entry id at that moment. Writing that down turns "which of our
// entries does this Arabic sentence refer to?" into "read the id we
// stored", which has no vocabulary problem in any language.
//
// ── Why it expires after exactly one turn ────────────────────────────
// An offer three turns stale, accepted by an unrelated "yes", is the
// original bug wearing a new hat: the visitor says yes to a question
// about their name and receives a photo of somebody's teeth. One turn is
// the whole life of an offer — taken up on the next message or gone.

export type PendingOffer = {
  /** The knowledge entry that was offered. */
  entryId: string;
  /** Its title, kept only so logs and instructions can be read by a human. */
  title: string;
  /** The visitor turn number on which the offer was made. */
  offeredOnTurn: number;
};

/**
 * Whether an offer is still live on this turn.
 *
 * Live means "made on the turn immediately before this one". Anything
 * older has been overtaken by the conversation.
 */
export function offerIsLive(offer: PendingOffer | null, currentTurn: number): boolean {
  if (!offer) return false;
  return currentTurn === offer.offeredOnTurn + 1;
}

/**
 * The offer to act on this turn, or null.
 *
 * Takes the message too, so the single question left — does this agree? —
 * is answered in one place rather than by each caller.
 */
export function acceptedOffer(
  offer: PendingOffer | null,
  currentTurn: number,
  visitorMessage: string,
  isYes: (text: string) => boolean
): PendingOffer | null {
  if (!offerIsLive(offer, currentTurn)) return null;
  return isYes(visitorMessage) ? offer : null;
}

/** Shape stored on the session row; small on purpose. */
export type StoredOffer = { entryId: string; title: string; offeredOnTurn: number } | null;

/** Parses whatever is in storage, forgiving a half-written row. */
export function parsePendingOffer(raw: unknown): PendingOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const entryId = typeof o.entryId === "string" ? o.entryId.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const turn = typeof o.offeredOnTurn === "number" ? o.offeredOnTurn : NaN;
  if (!entryId || !Number.isFinite(turn)) return null;
  return { entryId, title, offeredOnTurn: turn };
}
