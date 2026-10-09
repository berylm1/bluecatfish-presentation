import type { Slide } from './types';
import { speakingOrder, spokenText, topicIndexes, activityReady } from './queue';
import { introText, startsTopic } from './intro';

// How long a lesson takes, roughly: the professor's words at the text-to-speech
// pace, plus a rough allowance for each hands-on box. For the editor's slide
// list (minutes per topic, with a note when a topic runs long).

export const WORDS_PER_MINUTE = 150;   // text-to-speech pace, roughly (as /lessonReview)
export const HANDS_ON_SEC = 45;        // a learner's go at a hands-on box, roughly
export const TOPIC_LONG_SEC = 4 * 60;  // a topic longer than this gets a note: learners drift

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Seconds for slide i: its spoken words (and its topic's introduction), and its hands-on boxes. */
export function slideSeconds(slides: Slide[], i: number): { talk: number; handsOn: number } {
  const s = slides[i];
  if (!s) return { talk: 0, handsOn: 0 };
  const said = speakingOrder(s).reduce((n, e) => n + words(spokenText(e)), 0)
    + (startsTopic(slides, i) && !s.intro?.off ? words(introText(s)) : 0);
  const boxes = s.elements.filter((e) => e.type === 'activity' && activityReady(e)).length;
  return { talk: (said / WORDS_PER_MINUTE) * 60, handsOn: boxes * HANDS_ON_SEC };
}

export type TopicLength = { topic: number; start: number; slides: number; talk: number; handsOn: number; total: number; long: boolean };

/** Each topic's length (in order), and the whole lesson's. */
export function lessonLength(slides: Slide[]): { topics: TopicLength[]; total: number } {
  const idx = topicIndexes(slides);
  const topics: TopicLength[] = [];
  slides.forEach((_, i) => {
    const t = idx[i];
    const sec = slideSeconds(slides, i);
    if (!topics[t]) topics[t] = { topic: t, start: i, slides: 0, talk: 0, handsOn: 0, total: 0, long: false };
    const tl = topics[t];
    tl.slides++;
    tl.talk += sec.talk;
    tl.handsOn += sec.handsOn;
    tl.total = tl.talk + tl.handsOn;
    tl.long = tl.total > TOPIC_LONG_SEC;
  });
  return { topics, total: topics.reduce((n, t) => n + t.total, 0) };
}

/** "45 sec", "2.5 min" */
export const formatLength = (sec: number) => (sec <= 0 ? '0 sec' : sec < 60 ? `${Math.max(1, Math.round(sec))} sec` : `${(sec / 60).toFixed(1)} min`);
