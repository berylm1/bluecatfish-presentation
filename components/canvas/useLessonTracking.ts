'use client';

import { useCallback, useEffect, useRef } from 'react';
import { signals, type EventType, type StatePatch } from '@/lib/signals';
import { topicIndexes } from '@/lib/canvas/queue';
import type { Deck } from '@/lib/canvas/types';

/*
 * Learner tracking for the canvas page, into the same Supabase events and
 * learner_state tables /presentationv2 uses (so the instructor view sees both).
 * "section" = the topic, "step" = the slide within that topic; each event's
 * value also names the lesson, the slide and (when there is one) the element.
 */
export function useLessonTracking(deck: Deck, started: boolean, slideIndex: number, finished: boolean) {
  const topics = topicIndexes(deck.slides);
  const topic = topics[slideIndex] ?? 0;
  const stepInTopic = slideIndex - topics.indexOf(topic);
  const where = useRef({ topic, step: stepInTopic, slideId: deck.slides[slideIndex]?.id });
  where.current = { topic, step: stepInTopic, slideId: deck.slides[slideIndex]?.id };
  const lastTopic = useRef<number | null>(null);

  // A new session per start, and pending events flushed if the tab closes
  useEffect(() => {
    if (!started) return;
    signals.newSession();
    lastTopic.current = null;
    return signals.installUnloadFlush();
  }, [started]);

  // Slide changes: dwell for the one left, step_start for the new one
  useEffect(() => {
    if (!started || finished) return;
    signals.stepExit();
    if (lastTopic.current !== topic) {
      signals.track('section_start', { section: topic, value: { lesson: deck.lessonId, topic: deck.slides[slideIndex]?.topic } });
      signals.record(topic, { visits: 1 });
      lastTopic.current = topic;
    }
    signals.stepEnter(topic, stepInTopic, { lesson: deck.lessonId, slide: deck.slides[slideIndex]?.id });
  }, [started, finished, topic, stepInTopic, slideIndex, deck]);

  useEffect(() => {
    if (!finished) return;
    signals.stepExit();
    signals.track('lesson_complete', { value: { lesson: deck.lessonId, slides: deck.slides.length } });
  }, [finished, deck]);

  /** An event at the current place, plus optional counter changes for this topic. */
  const track = useCallback((type: EventType, value: Record<string, unknown> = {}, patch?: StatePatch) => {
    const w = where.current;
    signals.track(type, { section: w.topic, step: w.step, value: { lesson: deck.lessonId, slide: w.slideId, ...value } });
    if (patch) return signals.record(w.topic, patch);
    return null;
  }, [deck.lessonId]);

  /** How this topic is going for the learner (for the tutor and the confusion path). */
  const state = useCallback(() => signals.getState(where.current.topic), []);

  return { track, state };
}
