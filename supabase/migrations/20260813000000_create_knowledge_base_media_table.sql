-- Replace the single media_url/media_type columns on knowledge_base with a
-- proper one-to-many table, so an entry can have multiple attached files.
create table if not exists public.knowledge_base_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_base(id) on delete cascade,
  media_url text not null,
  media_type text not null,
  created_at timestamptz default now()
);

alter table public.knowledge_base_media enable row level security;

-- Carry over any existing single-media rows before the old columns disappear.
insert into public.knowledge_base_media (tenant_id, knowledge_base_id, media_url, media_type, created_at)
select tenant_id, id, media_url, media_type, created_at
from public.knowledge_base
where media_url is not null;

alter table public.knowledge_base
  drop column if exists media_url,
  drop column if exists media_type;
