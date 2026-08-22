-- Subscription plans, trial state, and conversation metering.
--
-- Plan DEFINITIONS (names, conversation limits, prices) deliberately do
-- not live here — they're a config constant in lib/plans.ts. They're
-- identical for every tenant, change only alongside pricing copy and the
-- upgrade CTA, and would otherwise cost a join on every enforcement
-- check. This migration stores only what varies per tenant: which plan
-- they're on, where they are in their billing period, and how much
-- they've used.
--
-- Nothing here blocks a visitor. Limits are advisory: the app warns the
-- business owner and offers an upgrade, and conversations keep working.

-- ── tenants: plan, trial window, billing period, Paddle handles ─────────

-- Free text rather than an enum or a CHECK: adding a plan later should be
-- a code-only change in lib/plans.ts, not a migration. An unrecognised
-- value is handled defensively in code (no warnings shown, loud console
-- warning) — a config typo must never nag a paying customer.
alter table public.tenants
  add column if not exists plan_id text not null default 'trial';

-- subscription_status already exists (added with the original tenants
-- table, defaulting to 'trial'). It's reused rather than replaced, but
-- normalised onto the four lifecycle states the app actually handles.
-- These ARE a fixed set — they mirror the subscription lifecycle a
-- payment provider reports — so unlike plan_id they get a CHECK.
update public.tenants
  set subscription_status = 'trialing'
  where subscription_status is null or subscription_status = 'trial';

alter table public.tenants alter column subscription_status set default 'trialing';
alter table public.tenants alter column subscription_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_subscription_status_check'
  ) then
    alter table public.tenants
      add constraint tenants_subscription_status_check
      check (subscription_status in ('trialing', 'active', 'past_due', 'canceled'));
  end if;
end $$;

-- Trial window and billing period.
--
-- Added WITHOUT defaults on purpose. `add column ... default now()` also
-- back-fills every existing row with now(), which would hand tenants
-- that signed up weeks ago a brand-new trial starting today and make the
-- created_at-anchored backfill below a no-op. Columns are added bare,
-- backfilled from created_at, and only then given defaults for future
-- inserts.
alter table public.tenants
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists current_period_conversations integer not null default 0;

-- Paddle identifiers. Nullable and entirely unused until the payment
-- integration lands — they exist now so wiring Paddle up later is an
-- application change rather than another migration during launch.
alter table public.tenants
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_price_id text;

-- Backfill existing tenants onto a trial window anchored to when they
-- were created, so no row is left with a null period that the app would
-- have to special-case on every read.
update public.tenants
set
  trial_started_at     = coalesce(trial_started_at, created_at, now()),
  trial_ends_at        = coalesce(trial_ends_at, coalesce(created_at, now()) + interval '7 days'),
  current_period_start = coalesce(current_period_start, created_at, now()),
  current_period_end   = coalesce(current_period_end, coalesce(created_at, now()) + interval '7 days')
where trial_started_at is null
   or trial_ends_at is null
   or current_period_start is null
   or current_period_end is null;

-- Defaults installed only now, so they apply to future inserts without
-- having rewritten the rows backfilled above. This is what lets
-- app/signup/actions.ts stay unaware of trial rules: it inserts the
-- business fields and the tenant lands on a correct trial automatically.
--
-- The 7 days here duplicates TRIAL_DURATION_DAYS in lib/plans.ts.
-- Changing the trial length means changing both.
alter table public.tenants
  alter column trial_started_at set default now(),
  alter column trial_ends_at set default (now() + interval '7 days'),
  alter column current_period_start set default now(),
  alter column current_period_end set default (now() + interval '7 days');

-- Looking up a tenant by its Paddle subscription is how a webhook will
-- find the row to update. Partial, since almost every row is null today.
create index if not exists tenants_paddle_subscription_id_idx
  on public.tenants (paddle_subscription_id)
  where paddle_subscription_id is not null;

-- ── chat_sessions: one row per counted conversation ────────────────────
--
-- A "conversation" is one visitor session, counted once when they first
-- speak — not once per message. The unique constraint on
-- (tenant_id, session_id) is what actually enforces that: it turns
-- "count this only once" into a database guarantee instead of a
-- check-then-write race between two concurrent first messages.
--
-- This table is also the audit trail behind current_period_conversations,
-- so a disputed count can be reconstructed rather than taken on trust.
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null default now(),
  -- Which billing period this session was counted against. Kept so a
  -- period's usage can be recomputed from rows even after the counter
  -- has rolled over.
  counted_in_period_start timestamptz,
  unique (tenant_id, session_id)
);

alter table public.chat_sessions enable row level security;

create index if not exists chat_sessions_tenant_started_idx
  on public.chat_sessions (tenant_id, started_at desc);

-- Owners can read their own sessions; nobody can write through the anon
-- client. Writes happen only in the /chat route via service_role, which
-- bypasses RLS — visitors are anonymous and must never be able to forge
-- or delete usage records.
drop policy if exists "chat_sessions_select_own_tenant" on public.chat_sessions;
create policy "chat_sessions_select_own_tenant"
  on public.chat_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = chat_sessions.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

-- ── record_conversation_start ──────────────────────────────────────────
--
-- Called once per visitor session by the /chat route. Everything happens
-- in one statement-level transaction so the "already counted?" check and
-- the increment can't interleave with a concurrent call.
--
-- Period rollover is lazy — done here rather than by a scheduled job —
-- so there's no cron to deploy or monitor, and a tenant nobody chats to
-- simply has nothing to roll.
--
-- Rollover applies ONLY to paid statuses. A trialing or canceled tenant
-- whose window has ended keeps counting upward instead of resetting to
-- zero, which is what keeps "your trial has ended" and "you're over your
-- limit" visible on the dashboard instead of silently clearing.
create or replace function public.record_conversation_start(
  p_tenant_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
as $$
declare
  v_inserted integer := 0;
  v_status text;
  v_period_end timestamptz;
  v_period_start timestamptz;
begin
  -- The tenant is resolved and locked BEFORE the insert. Doing it the
  -- other way round meant an unknown tenant raised a foreign-key
  -- violation from the insert, so the `if not found` guard below could
  -- never actually be reached.
  select subscription_status, current_period_start, current_period_end
    into v_status, v_period_start, v_period_end
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    return;
  end if;

  insert into public.chat_sessions (tenant_id, session_id)
  values (p_tenant_id, p_session_id)
  on conflict (tenant_id, session_id) do nothing;

  -- Zero rows means the conflict clause swallowed the insert, i.e. this
  -- session has already been counted. Nothing further to do.
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  -- Advance the period as many whole months as have elapsed, so a tenant
  -- idle for a quarter lands on a current window rather than one that is
  -- still in the past after a single step.
  if v_status in ('active', 'past_due')
     and v_period_end is not null
     and now() >= v_period_end then
    while v_period_end <= now() loop
      v_period_start := v_period_end;
      v_period_end := v_period_end + interval '1 month';
    end loop;

    update public.tenants
    set current_period_start = v_period_start,
        current_period_end = v_period_end,
        current_period_conversations = 0
    where id = p_tenant_id;
  end if;

  update public.tenants
  set current_period_conversations = current_period_conversations + 1
  where id = p_tenant_id
  returning current_period_start into v_period_start;

  update public.chat_sessions
  set counted_in_period_start = v_period_start
  where tenant_id = p_tenant_id
    and session_id = p_session_id;
end $$;

-- Only the service_role (the /chat route) may record usage, so that no
-- anonymous or signed-in caller can inflate — or, worse, quietly roll —
-- another tenant's counter.
--
-- Revoking from PUBLIC alone is NOT enough on Supabase: its default
-- privileges grant EXECUTE on functions in the public schema directly to
-- `anon` and `authenticated`, and a direct grant survives a PUBLIC
-- revoke. Verified the hard way — before these two roles were named
-- explicitly, an anon caller reached the function body and was stopped
-- only by RLS on chat_sessions, which is a weaker line of defence than
-- intended.
revoke all on function public.record_conversation_start(uuid, uuid) from public;
revoke all on function public.record_conversation_start(uuid, uuid) from anon;
revoke all on function public.record_conversation_start(uuid, uuid) from authenticated;
grant execute on function public.record_conversation_start(uuid, uuid) to service_role;
