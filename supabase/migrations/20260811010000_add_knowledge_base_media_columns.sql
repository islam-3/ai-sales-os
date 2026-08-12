-- Optional image/video attachment per knowledge_base entry. media_type is
-- a plain text tag ("image" | "video") rather than an enum, matching how
-- category is already modeled on this table.
alter table public.knowledge_base
  add column if not exists media_url text,
  add column if not exists media_type text;
