create extension if not exists vector;

create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content text not null,
  category text,
  embedding vector(1536),
  created_at timestamptz default now()
);

alter table public.knowledge_base enable row level security;
