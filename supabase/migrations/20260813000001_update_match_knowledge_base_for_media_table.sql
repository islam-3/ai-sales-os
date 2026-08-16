-- match_knowledge_base now aggregates media from knowledge_base_media
-- instead of returning the (now-removed) scalar media_url/media_type
-- columns on knowledge_base. Postgres won't let CREATE OR REPLACE change a
-- table-returning function's output columns, so this drops and recreates it.
drop function if exists match_knowledge_base(vector(1536), uuid, int);

create function match_knowledge_base(
  query_embedding vector(1536),
  match_tenant_id uuid,
  match_count int default 3
)
returns table (
  id uuid,
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
