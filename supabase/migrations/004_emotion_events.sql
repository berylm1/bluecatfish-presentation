-- Migration 004: allow the emotion_state event type (emotion watcher, Phase C)
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in
  ('section_start', 'step_start', 'step_complete',
   'confusion_click', 'repeat_request', 'simplify_request', 'advance_request',
   'quiz_submitted', 'quiz_wrong', 'quiz_passed',
   'tutor_question', 'tutor_decision', 'barge_in', 'hand_raise',
   'presence_away', 'presence_back',
   'dwell', 'lesson_complete', 'self_check', 'deck_command',
   'emotion_state'));
