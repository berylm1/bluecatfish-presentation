import type { Slide } from './types';
import { shownWords, spokenText } from './queue';
import { chat } from './ai';

// "Split this topic" (editor): a topic that runs long is split in two at the
// best place, with a name for each part. The AI suggests; a person confirms.

export interface TopicSplit {
  /** Index (in the whole lesson) of the first slide of the second part */
  splitAt: number;
  first: string;
  second: string;
  why: string;
}

export async function suggestSplit(slides: Slide[], start: number, lessonTitle: string): Promise<TopicSplit> {
  const topic = slides[start]?.topic?.trim() ?? '';
  // the same topic = the same name, as topicIndexes compares them (trimmed, any case)
  const same = (s: Slide) => (s.topic?.trim().toLowerCase() ?? '') === topic.toLowerCase();
  let end = start;
  while (end + 1 < slides.length && same(slides[end + 1])) end++;
  if (end - start < 1) throw new Error('This topic has only one slide: trim its words instead');
  const lines = slides.slice(start, end + 1).map((s, k) =>
    `${start + k + 1}. ${s.elements.map((e) => [shownWords(e), spokenText(e)].filter(Boolean).join(' / ')).filter(Boolean).join(' | ').slice(0, 900)}`);
  const out = JSON.parse(await chat(
    'You help organise a lesson for 10-14 year olds. One of its topics runs too long, so it will become two topics, each a sensible unit on its own. ' +
      'Choose where the second part starts (between two slides where the subject shifts most), and give each part a name of 2 to 5 words ' +
      '(the first can keep the old name if it still fits). Reply as JSON: {"splitAt": <the number of the first slide of the second part>, "first": "...", "second": "...", "why": "one short sentence"}',
    `Lesson: ${lessonTitle}\nTopic: ${topic}\nIts slides (number. what it shows / says):\n${lines.join('\n')}`,
    true,
    800,
  ));
  const at = Number(out.splitAt) - 1;
  // between the topic's first and last slide (a bad answer: the middle)
  const splitAt = Number.isInteger(at) && at > start && at <= end ? at : start + Math.ceil((end - start + 1) / 2);
  const name = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : fallback);
  return { splitAt, first: name(out.first, topic || 'Part 1'), second: name(out.second, `${topic || 'Part'} (2)`), why: name(out.why, '').slice(0, 300) };
}
