create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  slug text unique not null,
  industry text,
  settings jsonb default '{}',
  subscription_status text default 'trial',
  created_at timestamptz default now()
);

alter table public.tenants enable row level security;
