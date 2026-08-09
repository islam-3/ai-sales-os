-- Dedicated columns for the AI-generated sales briefing and lead score,
-- kept separate from the free-form qualification_data JSONB.
alter table public.lead_profile
  add column if not exists ai_summary text,
  add column if not exists qualification_score integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_profile_qualification_score_range'
  ) then
    alter table public.lead_profile
      add constraint lead_profile_qualification_score_range
        check (qualification_score is null or (qualification_score >= 0 and qualification_score <= 100));
  end if;
end $$;
