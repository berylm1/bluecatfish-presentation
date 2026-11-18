-- Migration 022: which AI models each participant's lesson used (the professor's live answers, the classmates),
-- e.g. "professor gpt-6-luna, classmates gpt-6-luna". Recorded once, when they start the lesson
-- (app/api/study/route.ts), so results can be split if a model changes mid-study. Safe to rerun.
do $$
declare t text;
begin
  foreach t in array array['adaptive_participants', 'classmates_participants'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists ai_model text', t);
      -- Everyone before this was recorded: the professor's live answers were gpt-4o-mini until the switch to Luna
      -- (merged to main 2026-11-18 07:08 UTC, PR #70); the classmates were Luna from 2026-10-22 05:33 UTC (562b00f)
      execute format($q$update public.%I set ai_model = 'professor gpt-4o-mini, classmates gpt-6-luna'
        where ai_model is null and lesson_started_at >= '2026-10-22 05:33:08+00' and lesson_started_at < '2026-11-18 07:08:24+00'$q$, t);
      -- What each group actually ran on: the static lesson has no live AI; without classmates, the professor only
      execute format($q$update public.%I set ai_model = 'none (static lesson)' where study_group = 'static' and ai_model like 'professor%%'$q$, t);
      execute format($q$update public.%I set ai_model = split_part(ai_model, ',', 1) where study_group = 'no_classmates' and ai_model like '%%, classmates%%'$q$, t);
    end if;
  end loop;
end $$;
