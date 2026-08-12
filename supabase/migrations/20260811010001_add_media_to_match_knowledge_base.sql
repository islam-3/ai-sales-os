-- Extend match_knowledge_base to also surface media_url/media_type, so a
-- RAG-matched entry still carries its attached photo/video through to the
-- chat route. Postgres won't let CREATE OR REPLACE change a table-returning
-- function's output columns, so this drops and recreates it.
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
  media_url text,
  media_type text,
  similarity float
)
language sql
stable
as $$
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.category,
    knowledge_base.media_url,
    knowledge_base.media_type,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where knowledge_base.tenant_id = match_tenant_id
    and knowledge_base.embedding is not null
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
$$;
