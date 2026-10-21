-- ====================================================================
-- Migration 011: the online study (app/study)
-- Two groups go through the same lesson: one with the AI classmates
-- (Maya, Finn, Leo), one without. One row per person.
-- Safe to rerun. Written and read by our server only (service key):
-- RLS is on with no policies, so the public key can't read or write it.
--
--   study_group:   'classmates' or 'no_classmates', picked when they press
--                  Start (study_assign below keeps the groups even)
--   pre_quiz, post_quiz, survey: every answer, as JSON (the results
--                  download, /studyResults, spreads them into columns)
--   lesson_session: the lesson's session ids in events / learner_state
--                  (space-separated: a refresh starts a new one),
--                  to join what they did in the lesson
--   is_test:       our own runs (?test=1): left out of the results
-- ====================================================================

create table if not exists public.study_participants (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  is_test              boolean not null default false,
  step                 text not null default 'consent',
  study_group          text check (study_group in ('classmates', 'no_classmates')),
  consent_at           timestamptz,
  -- demographics
  age_range            text,
  student              text,
  field                text,
  ai_use               text,
  catfish_knowledge    text,
  bay_area             text,
  english_first        text,
  done_before          text,
  seen_before_browser  boolean,
  -- the computer and the checks
  device               text,
  screen               text,
  sound_ok             boolean,
  mic_ok               boolean,
  camera_ok            boolean,
  -- the lesson
  lesson_session       text,
  lesson_started_at    timestamptz,
  lesson_finished_at   timestamptz,
  -- answers and scores (multiple choice scored by the server)
  pre_quiz             jsonb,
  post_quiz            jsonb,
  survey               jsonb,
  pre_score            int,
  post_score           int,
  post_same_score      int,
  finished_at          timestamptz
);

create index if not exists study_participants_group on public.study_participants (study_group) where not is_test;

alter table public.study_participants enable row level security;

-- Pick a group for a person (once: asking again gives the same one).
-- The group with fewer people so far (not counting test runs); a tie: either, at random.
-- Locked, so two people pressing Start at the same moment can't both tip the same way.
create or replace function public.study_assign(p_id uuid) returns text language plpgsql as $$
declare
  current_group text;
  test boolean;
  with_mates int;
  without_mates int;
  picked text;
begin
  perform pg_advisory_xact_lock(hashtext('study_assign'));
  select study_group, is_test into current_group, test from public.study_participants where id = p_id;
  if not found then return null; end if;
  if current_group is not null then return current_group; end if;
  select count(*) filter (where study_group = 'classmates'), count(*) filter (where study_group = 'no_classmates')
    into with_mates, without_mates from public.study_participants where not is_test;
  if with_mates < without_mates then picked := 'classmates';
  elsif without_mates < with_mates then picked := 'no_classmates';
  elsif random() < 0.5 then picked := 'classmates';
  else picked := 'no_classmates';
  end if;
  update public.study_participants set study_group = picked, updated_at = now() where id = p_id;
  return picked;
end $$;

-- Our server only (the public key couldn't change anything with it anyway: RLS)
revoke execute on function public.study_assign(uuid) from public, anon, authenticated;
