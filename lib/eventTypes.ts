// The kinds of learner events the events log takes: must match the SQL list
// (supabase/migrations 003, 004 and 012: the confusion meter's two). Shared by the browser (lib/signals.ts) and
// the server route that writes them (app/api/signals/events).
export const EVENT_TYPES = [
  'section_start', 'step_start', 'step_complete',
  'confusion_click', 'repeat_request', 'simplify_request', 'advance_request',
  'quiz_submitted', 'quiz_wrong', 'quiz_passed',
  'tutor_question', 'tutor_decision', 'barge_in', 'hand_raise',
  'presence_away', 'presence_back',
  'dwell', 'lesson_complete', 'self_check',
  'emotion_state',
  'deck_command',
  'confusion_level', 'confusion_topic',   // the confusion meter (lib/confusion.ts; migration 012)
] as const;

/** Added by migration 012: until it's run, the database turns these away (app/api/signals/events drops them then) */
export const NEWER_EVENT_TYPES: readonly string[] = ['confusion_level', 'confusion_topic'];

export type EventType = (typeof EVENT_TYPES)[number];
