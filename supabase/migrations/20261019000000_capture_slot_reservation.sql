-- Making the per-conversation capture caps HARD bounds.
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
-- ── And a second bound that never existed at all ────────────────────
-- MAX_JUDGE_CALLS_PER_CONVERSATION was named for judge calls and
-- counted captured ROWS, so a question the business CAN answer cost a
-- judge call and counted toward nothing. The same session made EIGHT
-- judge calls across nine turns; a perfectly held row cap would still
-- have made seven. The ceiling the README published — "0-4" — was not
-- a ceiling.
--
-- So there are two caps now, both enforced here:
--
--   rows    4   what an owner's dashboard gets from one conversation
--   judge   8   what one conversation may ever spend
--
-- Four rows keeps recall where it was: a conversation whose first
-- questions are all answered can still capture four real gaps after
-- them. Eight judge calls puts a ceiling on the bill that the row cap
-- never did.
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
-- ── Nothing here is ever deleted ────────────────────────────────────
-- A released slot is MARKED released, not removed, because the two caps
-- need two different counts out of the same rows:
--
--   judge calls spent  = every slot this session has ever taken
--   rows outstanding   = captured rows + slots not yet released
--
-- Deleting on release would make the judge tally forget, and a session
-- could spend eight judge calls, release them all, and spend eight
-- more. Marking keeps the tally monotonic, which is the only way a
-- ceiling stays a ceiling.

create table if not exists public.unanswered_capture_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Text, matching unanswered_questions.session_id. Not a foreign key
  -- for the same reason it is not one there.
  session_id text not null,

  reserved_at timestamptz not null default now(),

  -- Null while the capture is still deciding. Set when it finishes, by
  -- any route including a failure — see the release in
  -- lib/capture-unanswered.ts — or by the stale sweep below.
  released_at timestamptz
);

-- Both counts below are "this session's slots", one of them filtered on
-- released_at.
create index if not exists unanswered_capture_slots_session_idx
  on public.unanswered_capture_slots (session_id, released_at);

alter table public.unanswered_capture_slots enable row level security;

-- Deliberately no policies. Only the chat route touches this table, and
-- it writes with the service-role client, which bypasses RLS. An owner
-- has no reason to read it and no reason to be able to write it: a
-- reservation they could release is a judge call they could re-spend.

/**
 * Takes one capture slot for a session, or refuses and says which cap.
 *
 * Returns (slot_id, refusal). slot_id is null when refused, and refusal
 * is null when granted. The caller MUST release the returned slot when
 * it is done, on every path — see lib/capture-unanswered.ts.
 *
 * p_stale_after releases reservations from a capture that died between
 * reserving and finishing — a serverless invocation frozen mid-judge,
 * say. Five minutes is far longer than any capture can legitimately
 * take (judge ~2.5s, rewrite ~1s, embedding under a second) and far
 * shorter than a conversation. A swept slot stops holding a ROW back
 * and still counts as a judge call spent, which is the honest reading:
 * the call was very likely made, and the money very likely gone.
 *
 * Note which way a leak fails either way: toward capturing LESS, never
 * more. That is the direction the count it replaces also chose — "a
 * failed count is treated as at the cap, not under it" — because the
 * failure that costs money is the one that decides to spend it.
 */
create or replace function public.reserve_capture_slot(
  p_tenant_id uuid,
  p_session_id text,
  p_max_rows integer,
  p_max_judge_calls integer,
  p_stale_after interval default interval '5 minutes'
) returns table (slot_id uuid, refusal text)
language plpgsql
as $$
declare
  v_judge_calls integer;
  v_rows_outstanding integer;
  v_id uuid;
begin
  -- Serialises every reservation for THIS session and nothing else.
  -- Transaction-scoped, so it is released on commit and on rollback
  -- alike, with no cleanup path that can be forgotten. Two sessions
  -- whose ids happen to hash alike queue behind each other for the
  -- length of two counts and an insert, which is not worth avoiding.
  perform pg_advisory_xact_lock(hashtext(p_session_id));

  update public.unanswered_capture_slots
     set released_at = now()
   where session_id = p_session_id
     and released_at is null
     and reserved_at < now() - p_stale_after;

  -- Every slot ever taken by this session, released or not.
  select count(*) into v_judge_calls
    from public.unanswered_capture_slots s
   where s.tenant_id = p_tenant_id
     and s.session_id = p_session_id;

  if v_judge_calls >= p_max_judge_calls then
    return query select null::uuid, 'judge_calls'::text;
    return;
  end if;

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
          and s.session_id = p_session_id
          and s.released_at is null)
    into v_rows_outstanding;

  if v_rows_outstanding >= p_max_rows then
    return query select null::uuid, 'rows'::text;
    return;
  end if;

  insert into public.unanswered_capture_slots (tenant_id, session_id)
  values (p_tenant_id, p_session_id)
  returning id into v_id;

  return query select v_id, null::text;
end;
$$;

-- The chat route calls this with the service-role key. Nothing signed in
-- as an owner has any business granting itself a judge call.
revoke execute on function public.reserve_capture_slot(uuid, text, integer, integer, interval) from public;
grant execute on function public.reserve_capture_slot(uuid, text, integer, integer, interval) to service_role;
