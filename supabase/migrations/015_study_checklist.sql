-- Migration 015: the study checklist's own ticks (/studyResults: "Ready for the study?")
-- The things only a person can check ("the quiz matches the final lesson", "the pilot is done"):
-- who ticked each and when, kept with the study's settings so everyone editing sees them. Safe to rerun.
alter table public.study_settings add column if not exists manual jsonb not null default '{}'::jsonb;
insert into public.study_settings (id) values (1) on conflict (id) do nothing;
