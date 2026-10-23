-- Migration 012: the confusion meter's events (lib/confusion.ts)
--   confusion_level: the learner's level changed (e.g. fine -> a bit lost)
--   confusion_topic: a topic ended: its score, the overall score, and which
--                    signals moved it
-- Only adds the two names to the list of event types the events log takes
-- (the same list as lib/eventTypes.ts). Run in the Supabase SQL editor any
-- time: nothing else changes. Safe to rerun.
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in
  ('section_start', 'step_start', 'step_complete',
   'confusion_click', 'repeat_request', 'simplify_request', 'advance_request',
   'quiz_submitted', 'quiz_wrong', 'quiz_passed',
   'tutor_question', 'tutor_decision', 'barge_in', 'hand_raise',
   'presence_away', 'presence_back',
   'dwell', 'lesson_complete', 'self_check', 'deck_command',
   'emotion_state',
   'confusion_level', 'confusion_topic'));
