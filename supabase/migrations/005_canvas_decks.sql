-- ====================================================================
-- Blue Catfish — canvas slide decks (docs/customization-plan.md)
-- Backup copy of every hand-made deck. Decks are read from Redis; this
-- table restores them if Redis ever loses one. Service role only.
-- Run in the Supabase SQL editor. Safe to rerun.
-- ====================================================================

create table if not exists public.canvas_lessons (
  id          text primary key,             -- 'blue-catfish'
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.canvas_decks (
  lesson_id   text not null references public.canvas_lessons (id) on delete cascade,
  kind        text not null check (kind in ('draft', 'live')),
  deck        jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (lesson_id, kind)
);

-- Every publish is kept, so an older live deck can be brought back
create table if not exists public.canvas_deck_history (
  id           bigint generated always as identity primary key,
  lesson_id    text not null references public.canvas_lessons (id) on delete cascade,
  deck         jsonb not null,
  published_by text,
  published_at timestamptz not null default now()
);
create index if not exists canvas_deck_history_lesson_idx on public.canvas_deck_history (lesson_id, published_at desc);

-- No policies: only the server (service role) reads or writes these
alter table public.canvas_lessons enable row level security;
alter table public.canvas_decks enable row level security;
alter table public.canvas_deck_history enable row level security;
