-- Ready-to-run AI cost queries for the Supabase SQL Editor.
--
-- These are the same numbers the /admin/usage page shows, in a form you
-- can slice freely. All figures depend on the rates in lib/ai-pricing.ts
-- at the moment each row was written — changing prices later does NOT
-- retroactively update historic rows, which is intentional: it keeps a
-- record of what things actually cost at the time.

-- ── 1. Average cost per conversation ────────────────────────────────
select
  count(*)                       as conversations,
  round(avg(cost_usd), 6)        as avg_cost_usd,
  round(sum(cost_usd), 4)        as total_cost_usd,
  round(avg(input_tokens))       as avg_input_tokens,
  round(avg(output_tokens))      as avg_output_tokens
from public.usage_by_conversation;

-- ── 2. Average cost per LEAD ────────────────────────────────────────
-- Only conversations that produced a lead_profile row. This is the
-- number that matters for pricing: it's the true acquisition cost, and
-- it's always higher than cost-per-conversation because most visitors
-- never convert.
select
  count(*)                       as leads,
  round(avg(cost_usd), 6)        as avg_cost_per_lead_usd,
  round(sum(cost_usd), 4)        as total_cost_usd
from public.usage_by_conversation
where is_lead;

-- Both together, for the conversion picture:
select
  is_lead,
  count(*)                       as conversations,
  round(avg(cost_usd), 6)        as avg_cost_usd,
  round(sum(cost_usd), 4)        as total_cost_usd
from public.usage_by_conversation
group by is_lead
order by is_lead desc;

-- ── 3. Total cost per tenant over a date range ──────────────────────
-- Adjust the two dates as needed.
select
  t.business_name,
  count(*)                                  as calls,
  count(distinct u.session_id)              as conversations,
  round(sum(u.cost_usd), 4)                 as total_cost_usd
from public.usage_events u
join public.tenants t on t.id = u.tenant_id
where u.created_at >= date '2026-08-01'
  and u.created_at <  date '2026-09-01'
group by t.business_name
order by total_cost_usd desc;

-- ── 4. Where the cost goes, by call type ────────────────────────────
-- The breakdown that tells you what to optimise first.
select
  call_type,
  model,
  count(*)                                  as calls,
  round(sum(cost_usd), 4)                   as total_cost_usd,
  round(avg(input_tokens))                  as avg_input_tokens,
  round(avg(output_tokens))                 as avg_output_tokens,
  round(100 * sum(cost_usd)
        / nullif(sum(sum(cost_usd)) over (), 0), 1) as pct_of_total
from public.usage_events
group by call_type, model
order by total_cost_usd desc;

-- ── 5. Daily trend ──────────────────────────────────────────────────
select
  day,
  round(sum(cost_usd), 4)                   as cost_usd,
  sum(conversation_count)                   as conversations,
  sum(call_count)                           as calls
from public.usage_by_tenant_daily
group by day
order by day desc
limit 30;

-- ── 6. Most expensive individual conversations ──────────────────────
-- Useful for spotting runaway sessions before they become the norm.
select
  c.session_id,
  t.business_name,
  round(c.cost_usd, 6)                      as cost_usd,
  c.call_count,
  c.input_tokens,
  c.output_tokens,
  c.is_lead,
  c.started_at
from public.usage_by_conversation c
join public.tenants t on t.id = c.tenant_id
order by c.cost_usd desc
limit 20;
