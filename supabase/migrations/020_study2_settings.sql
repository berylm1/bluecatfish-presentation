-- Migration 020: study 2 (static vs adaptive) gets its own settings and pilot reports
--   study_settings: one row per study (id 1: the classmates study, id 2: static vs adaptive), each with
--                   its own frozen lesson version and its own "Ready for the study?" ticks
--   study_reports:  which study a saved pilot report snapshot is of (1 for the ones saved before)
-- Safe to rerun.
alter table public.study_settings drop constraint if exists study_settings_id_check;
alter table public.study_settings add constraint study_settings_id_check check (id in (1, 2));
insert into public.study_settings (id) values (2) on conflict (id) do nothing;
alter table public.study_reports add column if not exists study int not null default 1;
