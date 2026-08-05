create table if not exists public.lead_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  name text,
  contact_info text,
  qualification_data jsonb default '{}',
  status text default 'new',
  created_at timestamptz default now()
);

alter table public.lead_profile enable row level security;
