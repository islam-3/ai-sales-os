-- Drops answer_kind, which the twelve-question card needed and nothing
-- does now.
--
-- That card asked the business ten or twelve questions of our own
-- devising. Used as an owner, it failed for reasons no test would have
-- caught: two parallel lists on one page about the same thing, several
-- decisions per answer, and a counter reading "0 of 12" while the
-- warranty, the brands, the duration and the packages all sat in the
-- list below — so the owner was being asked to redo work they had
-- already done.
--
-- What replaces it does not ask the business anything. It records what
-- real customers asked and the assistant could not answer, and offers
-- those back through the add-entry form that already exists.
--
-- answer_kind distinguished answered / not_offered / existing. There are
-- no negative sentences and no prefer-not-to-say any more, so the only
-- surviving state is "this entry answers that question", which
-- question_key already says on its own.
--
-- Safe: zero rows use it. Checked on both tenants before writing this —
-- the card was used but nothing was ever saved through it.
alter table public.knowledge_base
  drop constraint if exists knowledge_base_answer_kind_check;

alter table public.knowledge_base
  drop column if exists answer_kind;

-- question_key STAYS, with its index. It is how a starter suggestion
-- knows it has been answered, which is the one thing it is still needed
-- for.
