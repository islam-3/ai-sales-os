-- A real title on each knowledge_base entry.
--
-- Until now an entry was one free-text blob and the dashboard derived a
-- heading from its first line. That works, but it guesses: prose with no
-- heading produces an awkward truncation, and the business never gets to
-- say what the entry is actually about. A written title is also better
-- input for the assistant — "Warranty & guarantees" labels a fact far
-- more usefully than an unlabelled paragraph.
--
-- NOT NULL DEFAULT '' rather than nullable, deliberately:
--   • ADD COLUMN with a DEFAULT fills existing rows at ALTER time (no
--     table rewrite on PG 11+), so no row is ever null;
--   • nullable would leave two states — NULL and '' — that mean the same
--     thing, and every read site would have to handle both forever;
--   • NOT NULL with no default simply fails on a non-empty table.
--
-- '' means "not titled yet". The app falls back to a title derived from
-- the content in that case, so a row written outside the dashboard form
-- can never render blank. Existing rows are populated by
-- scripts/backfill-knowledge-titles.ts, which uses the same derivation.
alter table public.knowledge_base
  add column if not exists title text not null default '';

-- ── match_knowledge_base: return the title too ────────────────────────
--
-- Postgres won't let CREATE OR REPLACE change a table-returning
-- function's output columns, so this drops and recreates it. Everything
-- else about the function is unchanged.
--
-- RAG retrieval is currently switched off in the chat route
-- (RAG_RETRIEVAL_ENABLED), but the two paths that feed the model must
-- stay consistent: when retrieval is switched back on it should surface
-- the same labelled facts the full knowledge dump already does.
drop function if exists match_knowledge_base(vector(1536), uuid, int);

create function match_knowledge_base(
  query_embedding vector(1536),
  match_tenant_id uuid,
  match_count int default 3
)
returns table (
  id uuid,
  title text,
  content text,
  category text,
  media jsonb,
  similarity float
)
language sql
stable
as $$
  select
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('url', m.media_url, 'type', m.media_type)
          order by m.created_at
        )
        from knowledge_base_media m
        where m.knowledge_base_id = kb.id
      ),
      '[]'::jsonb
    ) as media,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.tenant_id = match_tenant_id
    and kb.embedding is not null
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;
