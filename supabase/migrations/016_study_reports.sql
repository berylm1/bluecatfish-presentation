-- Migration 016: pilot report snapshots (/studyResults/report: "Save snapshot")
-- The report as it was at a moment ("After 5 people"), to compare later. Our server only
-- (RLS on, no policies). Safe to rerun.
create table if not exists public.study_reports (
  id          bigint generated always as identity primary key,
  name        text not null,
  created_at  timestamptz not null default now(),
  created_by  text,
  report      jsonb not null
);
alter table public.study_reports enable row level security;
