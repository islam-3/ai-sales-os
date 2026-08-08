-- pgvector cosine-similarity search over knowledge_base, scoped to a tenant.
-- PostgREST can't express an ORDER BY ... <=> ... vector distance query
-- through its normal filter syntax, so this is called via .rpc() instead.
create or replace function match_knowledge_base(
  query_embedding vector(1536),
  match_tenant_id uuid,
  match_count int default 3
)
returns table (
  id uuid,
  content text,
  category text,
  similarity float
)
language sql
stable
as $$
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.category,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where knowledge_base.tenant_id = match_tenant_id
    and knowledge_base.embedding is not null
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
$$;
