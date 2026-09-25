-- Promote visitor_language from qualification_data JSONB to a real column.
--
-- It is a ROUTING key, not a qualification detail: these businesses staff
-- a salesperson per language, and the leads page filters on it. Inside
-- JSONB it cannot be indexed, every filter is a full scan of the jsonb,
-- and nothing stops a typo becoming a language nothing matches.
--
-- Stored as an ISO 639-1 code, so "Arabic", "العربية" and "ar" are one
-- value rather than three. The application already writes codes (see
-- lib/languages.ts) and reads either form, so this migration is about
-- where the value lives and what shape it settles into.
--
-- Safe to run on a live database:
--   * additive only, nothing is dropped;
--   * the JSONB copy is LEFT IN PLACE, so a rollback is dropping the
--     column and nothing else, and code that still reads the old path
--     keeps working through the changeover;
--   * the backfill maps only values it recognises, leaving anything else
--     NULL rather than guessing. A lead with no language is visibly
--     unrouted; one routed to the wrong rep sits unanswered.
--
-- Run it in the Supabase SQL editor. It is idempotent.

-- ── 1. the column ─────────────────────────────────────────────────────
alter table public.lead_profile
  add column if not exists visitor_language text;

comment on column public.lead_profile.visitor_language is
  'ISO 639-1 code for the language the VISITOR wrote in, judged from their '
  'own messages only - never the assistant''s replies, never the tenant''s '
  'settings. Used to route the lead to a salesperson who speaks it. NULL '
  'when they wrote too little to tell.';

-- Two letters, lowercase, or nothing. Cheap, and it is the constraint
-- that stops a display name ever being written back into this column.
alter table public.lead_profile
  drop constraint if exists lead_profile_visitor_language_code;

alter table public.lead_profile
  add constraint lead_profile_visitor_language_code
  check (visitor_language is null or visitor_language ~ '^[a-z]{2}$');

-- ── 2. backfill from the JSONB copy ───────────────────────────────────
-- Only the values actually present in this database, checked before
-- writing this rather than guessed at: Arabic, Chinese, English, Russian,
-- Spanish and Turkish across 63 of 77 leads. Anything else stays NULL.
update public.lead_profile
set visitor_language = case lower(trim(qualification_data->>'visitor_language'))
    when 'arabic'   then 'ar'
    when 'العربية'  then 'ar'
    when 'ar'       then 'ar'
    when 'chinese'  then 'zh'
    when 'mandarin' then 'zh'
    when '中文'      then 'zh'
    when 'zh'       then 'zh'
    when 'english'  then 'en'
    when 'en'       then 'en'
    when 'russian'  then 'ru'
    when 'русский'  then 'ru'
    when 'ru'       then 'ru'
    when 'spanish'  then 'es'
    when 'español'  then 'es'
    when 'es'       then 'es'
    when 'turkish'  then 'tr'
    when 'türkçe'   then 'tr'
    when 'tr'       then 'tr'
    when 'french'   then 'fr'
    when 'français' then 'fr'
    when 'fr'       then 'fr'
    when 'german'   then 'de'
    when 'deutsch'  then 'de'
    when 'de'       then 'de'
    else null
  end
where visitor_language is null
  and qualification_data->>'visitor_language' is not null;

-- ── 3. index, for the leads filter ────────────────────────────────────
-- Partial: most rows are NULL early on, and an index that skips them is
-- smaller and answers "show me the Arabic leads" just as well.
create index if not exists lead_profile_visitor_language_idx
  on public.lead_profile (tenant_id, visitor_language)
  where visitor_language is not null;

-- ── 4. what did NOT map ───────────────────────────────────────────────
-- Run this afterwards. Every row it returns is a language the backfill
-- did not recognise, left NULL on purpose. Expect zero on this database.
--
--   select qualification_data->>'visitor_language' as stored, count(*)
--   from public.lead_profile
--   where visitor_language is null
--     and qualification_data->>'visitor_language' is not null
--   group by 1 order by 2 desc;
