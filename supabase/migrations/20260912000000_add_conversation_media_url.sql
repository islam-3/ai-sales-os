-- Records which image or video was actually sent with an assistant reply.
--
-- Two reasons. The immediate one is deduplication: the assistant was
-- sending the same photo on consecutive turns, and there was no way to
-- know what had already gone out — the [[MEDIA:...]] tag is stripped from
-- the reply before it is stored, so the transcript kept no trace of it.
--
-- The second is that this is real conversation history. Knowing which
-- images a visitor was actually shown belongs on the record next to what
-- was said, and it lets the lead view surface it later.
--
-- Nullable rather than NOT NULL DEFAULT '': most rows genuinely have no
-- attachment, and there is no such thing as an empty URL, so NULL is the
-- only representation of "nothing was sent". Nothing ever writes '',
-- which keeps it to one state rather than the two that a default would
-- have created.
alter table public.conversations
  add column if not exists media_url text;

-- Supports both uses: the per-session dedupe lookup on every turn, and a
-- future "what was this visitor shown" view. Partial, because only a
-- small minority of rows carry media and the index should not pay for the
-- ones that don't.
create index if not exists conversations_session_media_idx
  on public.conversations (session_id)
  where media_url is not null;
