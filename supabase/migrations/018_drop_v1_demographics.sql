-- Migration 018: the v1 questions about the person, a column each, removed
-- (v2, migration 017, keeps them all in demographics). Only test runs had answered them.
-- Their questions are listed in lib/study/content.ts. Safe to rerun.
alter table public.study_participants
  drop column if exists age_range,
  drop column if exists student,
  drop column if exists field,
  drop column if exists ai_use,
  drop column if exists catfish_knowledge,
  drop column if exists bay_area,
  drop column if exists english_first,
  drop column if exists done_before;
