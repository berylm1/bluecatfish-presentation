-- Migration 022: which AI models each participant's lesson used (the professor's live answers, the classmates),
-- e.g. "professor gpt-6-luna, classmates gpt-6-luna". Recorded once, when they start the lesson
-- (app/api/study/route.ts), so results can be split if a model changes mid-study (the pilot's professor was
-- gpt-4o-mini). Rows from before this file: null. Safe to rerun.
do $$
begin
  if to_regclass('public.adaptive_participants') is not null then
    alter table public.adaptive_participants add column if not exists ai_model text;
  end if;
  if to_regclass('public.classmates_participants') is not null then
    alter table public.classmates_participants add column if not exists ai_model text;
  end if;
end $$;
