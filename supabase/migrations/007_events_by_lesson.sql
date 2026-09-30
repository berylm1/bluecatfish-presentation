-- Migration 007: fast per-lesson lookups for the slide editor's learner heatmap
-- (/api/editor/slide-stats reads events by value->>'lesson', newest first).
-- Run in the Supabase SQL editor. Safe to rerun.
create index if not exists events_lesson_created_idx
  on public.events ((value->>'lesson'), created_at desc);
