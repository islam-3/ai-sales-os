-- Somewhere for the server to remember what it just offered to show.
--
-- The chat used to work this out by reading the transcript back: which
-- of the assistant's own sentences were offers, and which knowledge
-- entry an "Arabic yes" was agreeing to. Measured across six failure
-- classes, that scored 17% recall - English only, and even there only
-- when a visitor happened to quote an entry title close to verbatim.
--
-- The server already knew the entry id when it decided to offer it. This
-- column is where that id goes, which turns a language problem into a
-- lookup. Nothing reads words to find it again.
--
-- Shape: {"entryId": "...", "title": "...", "offeredOnTurn": 4} or NULL.
-- The title is carried only so logs and instructions can be read by a
-- person; nothing matches on it.
--
-- An offer is honoured for exactly ONE turn, and that rule lives in the
-- application (lib/pending-offer.ts), not here - the turn number is
-- stored so staleness is decided rather than assumed from a timestamp.
--
-- Safe on a live database: additive, nullable, no default, no rewrite of
-- existing rows. Chat works exactly as it does today until the code that
-- reads it ships, and reverting is dropping the column.

alter table public.chat_sessions
  add column if not exists pending_offer jsonb;

comment on column public.chat_sessions.pending_offer is
  'What the assistant last offered to show: {entryId, title, offeredOnTurn}. '
  'Written when an offer is made, read on the next visitor turn to decide '
  'what a "yes" refers to, and honoured for exactly one turn. NULL when '
  'nothing is outstanding.';
