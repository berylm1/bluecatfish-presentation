-- Migration 014: the lesson the study plays, frozen to one saved version
-- (app/studyResults: "Lesson for the study"). Editing or publishing the lesson then
-- doesn't change what people taking part see. One row; our server only (RLS on, no policies).
-- Each person's row records the version they saw (study_participants.lesson_version).
-- Safe to rerun.
create table if not exists public.study_settings (
  id              int primary key default 1 check (id = 1),
  lesson_id       text,
  version_slug    text,            -- a saved version (lib/canvas/saved.ts); null = the live lesson
  version_name    text,
  set_at          timestamptz not null default now(),
  set_by          text
);
alter table public.study_settings enable row level security;

alter table public.study_participants add column if not exists lesson_version text;
