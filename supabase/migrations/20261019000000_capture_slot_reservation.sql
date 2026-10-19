-- Making the per-conversation capture cap a HARD bound.
--
-- ── The bug this fixes, observed in production ──────────────────────
-- The cap was a count taken in the application, before the judge call:
--
--     count rows for this session  ->  3, under the cap of 4  ->  judge
--
-- Capture runs detached, after the reply has gone out, and the work
-- between that count and the INSERT is a judge call (~2.5s), a rewrite
-- and an embedding. So the window between reading the count and writing
-- the row is several seconds long, and a visitor who sends their next
-- message inside it gets a second capture that counts the same stale 3.
--
-- Measured on 2026-10-17, scripts/live-capture-check.ts against
-- production: session 0310035b captured FIVE rows against a cap of 4.
-- The fifth row was inserted 2.8s after the fourth, and its own chain
-- is longer than that, so it had counted before the fourth existed.
--
-- The overrun is a judge call — a whole knowledge base of input — not
-- just an extra dashboard line. A cap that can be raced is a budget
-- that can be raced.
--
-- ── Why a reservation, and why in the database ──────────────────────
-- The decision "may this capture spend a judge call?" has to be made
-- once, by one party, with every other in-flight capture visible to it.
-- Two application processes cannot do that by counting: counting is a
-- read, and reads do not exclude each other.
--
-- So the slot is taken BEFORE the judge call rather than after it, the
-- taking is a write, and the write is serialised per session by an
-- advisory lock. Two captures in flight hold two slots; the fifth is
-- refused while the fourth is still thinking.
--
-- ── Why the reservations live in their own table ────────────────────
-- The obvious alternative is a `pending` row in unanswered_questions
-- itself. That table cannot hold one honestly: question_short is NOT
-- NULL (there is no short version before the rewrite), group_id is NOT
-- NULL and a self-pointing group_id makes the row canonical, which
-- makes an unjudged placeholder a grouping anchor for the next ask and
-- a target for dismissal. A reservation is not a question; it is
-- permission to ask one, and it gets its own table.
--
-- The real table stays the source of truth for what was captured. The
-- count below is rows PLUS live reservations, so a reservation is
-- purely transient: the application deletes it on every path, and once
-- a row exists the row itself holds the count. Nothing is double
-- counted and there is no state to reconcile.

create table if not exists public.unanswered_capture_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Text, matching unanswered_questions.session_id. Not a foreign key
  -- for the same reason it is not one there.
  session_id text not null,

  reserved_at timestamptz not null default now()
);

-- Every query here is "this session's live reservations".
create index if not exists unanswered_capture_slots_session_idx
  on public.unanswered_capture_slots (session_id, reserved_at);

alter table public.unanswered_capture_slots enable row level security;

-- Deliberately no policies. Only the chat route touches this table, and
-- it writes with the service-role client, which bypasses RLS. An owner
-- has no reason to read it and no reason to be able to write it: a
-- reservation they could insert is a judge call they could deny.

/**
 * Takes one capture slot for a session, or refuses.
 *
 * Returns the reservation id when the slot is granted, NULL when the
 * session is at its cap. The caller MUST delete the returned row when
 * it is done, on every path — see the release in
 * lib/capture-unanswered.ts.
 *
 * p_stale_after reclaims reservations from a capture that died between
 * reserving and releasing — a serverless invocation frozen mid-judge,
 * say. Five minutes is far longer than any capture can legitimately
 * take (judge ~2.5s, rewrite ~1s, embedding under a second) and far
 * shorter than a conversation, so a leak costs that session one slot
 * for five minutes and then heals.
 *
 * Note which way a leak fails: a stranded reservation makes a session
 * capture LESS, never more. That is the same direction the count it
 * replaces chose — "a failed count is treated as at the cap, not under
 * it" — because the failure that costs money is the one that decides
 * to spend it.
 */
create or replace function public.reserve_capture_slot(
  p_tenant_id uuid,
  p_session_id text,
  p_max integer,
  p_stale_after interval default interval '5 minutes'
) returns uuid
language plpgsql
as $$
declare
  v_taken integer;
  v_id uuid;
begin
  -- Serialises every reservation for THIS session and nothing else.
  -- Transaction-scoped, so it is released on commit and on rollback
  -- alike, with no cleanup path that can be forgotten. Two sessions
  -- whose ids happen to hash alike queue behind each other for the
  -- length of two counts and an insert, which is not worth avoiding.
  perform pg_advisory_xact_lock(hashtext(p_session_id));

  delete from public.unanswered_capture_slots
   where session_id = p_session_id
     and reserved_at < now() - p_stale_after;

  -- Rows already captured, plus slots held by captures still deciding.
  -- The first is what the cap has always counted; the second is what it
  -- was missing.
  select
      (select count(*)
         from public.unanswered_questions q
        where q.tenant_id = p_tenant_id
          and q.session_id = p_session_id)
    + (select count(*)
         from public.unanswered_capture_slots s
        where s.tenant_id = p_tenant_id
          and s.session_id = p_session_id)
    into v_taken;

  if v_taken >= p_max then
    return null;
  end if;

  insert into public.unanswered_capture_slots (tenant_id, session_id)
  values (p_tenant_id, p_session_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- The chat route calls this with the service-role key. Nothing signed in
-- as an owner has any business granting itself a judge call.
revoke execute on function public.reserve_capture_slot(uuid, text, integer, interval) from public;
grant execute on function public.reserve_capture_slot(uuid, text, integer, interval) to service_role;
