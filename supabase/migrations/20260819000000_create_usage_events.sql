-- Per-call AI cost tracking.
--
-- One row per billable model call, not per message: a single visitor
-- message triggers up to three paid calls (RAG embedding, chat reply,
-- lead extraction), so this can't be folded into `conversations`, which
-- stores one row per message role. Keeping it separate also gives a
-- per-call-type breakdown, which is what identifies where to optimise.
--
-- Append-only. Nothing updates these rows.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Null for calls not tied to a conversation — currently the embedding
  -- generated when an owner saves a knowledge_base entry.
  session_id uuid,
  -- chat_reply | lead_extraction | rag_embedding | knowledge_embedding
  call_type text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Anthropic bills cached input separately and at different rates, so
  -- these are tracked apart from input_tokens rather than merged into it.
  cache_read_input_tokens integer not null default 0,
  cache_write_input_tokens integer not null default 0,
  -- numeric, not float: individual calls cost fractions of a cent and
  -- floating-point drift would accumulate badly over many rows.
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_tenant_created_idx
  on public.usage_events (tenant_id, created_at desc);
create index if not exists usage_events_session_idx
  on public.usage_events (session_id);

alter table public.usage_events enable row level security;

-- Tenant owners can read their own usage, matching the policy pattern on
-- every other table. Writes come from the server (service_role), which
-- bypasses RLS, so there is deliberately no insert policy here.
-- Cross-tenant platform totals are read with service_role too.
create policy "usage_events_select_own_tenant"
  on public.usage_events for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = usage_events.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

-- ── Reporting views ─────────────────────────────────────────────────
-- Cost rolled up per conversation. `is_lead` marks the conversations
-- that actually produced a lead_profile row, which is what makes
-- "cost per lead" answerable.
create or replace view public.usage_by_conversation as
select
  u.session_id,
  u.tenant_id,
  sum(u.cost_usd)                                     as cost_usd,
  sum(u.input_tokens + u.cache_read_input_tokens
      + u.cache_write_input_tokens)                   as input_tokens,
  sum(u.output_tokens)                                as output_tokens,
  count(*)                                            as call_count,
  min(u.created_at)                                   as started_at,
  max(u.created_at)                                   as last_call_at,
  exists (
    select 1 from public.lead_profile l
    where l.session_id = u.session_id
      and l.tenant_id = u.tenant_id
  )                                                   as is_lead
from public.usage_events u
where u.session_id is not null
group by u.session_id, u.tenant_id;

-- Daily spend per tenant, for trend and range queries.
create or replace view public.usage_by_tenant_daily as
select
  u.tenant_id,
  date_trunc('day', u.created_at)::date               as day,
  sum(u.cost_usd)                                     as cost_usd,
  count(*)                                            as call_count,
  count(distinct u.session_id)                        as conversation_count
from public.usage_events u
group by u.tenant_id, date_trunc('day', u.created_at)::date;
