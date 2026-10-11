-- Guided data entry: tying a knowledge entry to the question it answers.
--
-- Businesses paste their website's marketing copy into the knowledge
-- base and do not realise the operational answers customers actually ask
-- about are missing. The fix is to ask specific questions instead of
-- showing an empty box, and an answer is an ordinary knowledge_base row
-- so it reaches the assistant through the path that already exists.
--
-- Two columns, both set explicitly when the owner acts. Neither is ever
-- derived by reading the text of an entry.

alter table public.knowledge_base
  -- Which question this answers. Null for every entry that predates the
  -- feature and every entry written freehand, which stay exactly as they
  -- are.
  add column if not exists question_key text,
  -- How the answer came to exist:
  --
  --   answered    the owner wrote it
  --   not_offered the owner chose a "we don't offer this" sentence that
  --               is defined verbatim in code — the model never composes
  --               a statement about what a business cannot do
  --   existing    an entry that already existed, which the owner
  --               confirmed already covers the question
  --
  -- "Prefer not to say" is deliberately NOT here. It has no content by
  -- definition, and a row recording that an owner declined to comment
  -- would reach a customer. It lives in tenants.settings instead.
  add column if not exists answer_kind text;

alter table public.knowledge_base
  drop constraint if exists knowledge_base_answer_kind_check;

alter table public.knowledge_base
  add constraint knowledge_base_answer_kind_check
  check (answer_kind is null or answer_kind in ('answered', 'not_offered', 'existing'));

-- An answer is scoped to a category, and "all categories" is category
-- null. The same question can therefore be answered more than once: a
-- clinic's warranty for implants is not its warranty for hair grafts,
-- and serving one as the other is a guarantee the business never gave.
--
-- So no unique constraint on (tenant_id, question_key). The index is for
-- the dashboard, which asks "what has this tenant answered" on every
-- load of the knowledge base page.
create index if not exists knowledge_base_tenant_question_idx
  on public.knowledge_base (tenant_id, question_key)
  where question_key is not null;
