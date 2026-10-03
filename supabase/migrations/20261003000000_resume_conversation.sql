-- Resuming a conversation after a refresh.
--
-- A visitor who reloaded the page lost everything and started over. Two
-- real losses: most will not retype it, so the lead is gone; and the ones
-- who do create a SECOND lead_profile row, so the team calls the same
-- person twice.
--
-- Nothing here is needed to make resuming safe. Both of the properties
-- that matter already hold, and they hold because of constraints that
-- already exist:
--
--   * record_conversation_start inserts into chat_sessions with
--     `on conflict (tenant_id, session_id) do nothing` and increments
--     only when a row was actually inserted, so a resumed session is
--     never counted twice against the plan;
--   * lead_profile is written through one upsert keyed on
--     (tenant_id, session_id), so a resumed session updates the existing
--     lead rather than creating a second one.
--
-- So this migration is only an index and a cleanup.

-- ── 1. The query resume makes, and the chat route already made ───────
--
-- Every turn reads this conversation's history by (tenant_id,
-- session_id) ordered by time, and resume now reads it again on page
-- load. There was no index for it: 3,700 rows and growing, scanned on
-- every message of every conversation.
--
-- created_at is in the index rather than only the filter, so the sort is
-- satisfied by the index instead of by a sort node on top of it.
create index if not exists conversations_tenant_session_time_idx
  on public.conversations (tenant_id, session_id, created_at);

-- ── 2. A column nothing reads any more ───────────────────────────────
--
-- pending_offer held "the assistant has just offered to show photo X",
-- so a visitor saying "yes please" could be matched to it. Image sending
-- was removed from the chat, so nothing writes it and nothing reads it.
--
-- Dropped rather than left: a dead column is how the next person wastes
-- an afternoon working out whether it still matters. What it held was
-- ephemeral state for a turn that has long since passed, not a record of
-- anything that happened.
alter table public.chat_sessions
  drop column if exists pending_offer;

-- ── NOT dropped, deliberately: conversations.media_url ───────────────
--
-- It is equally dead in code — nothing writes it and nothing reads it
-- since image sending went. But unlike pending_offer it is a RECORD: it
-- says which image was actually sent to a real visitor in a real
-- conversation, and those rows are still there. Deleting it would
-- destroy history to tidy a schema.
--
-- If you want it gone, these are the two statements, and they are not
-- reversible:
--
--   drop index if exists public.conversations_session_media_idx;
--   alter table public.conversations drop column if exists media_url;
