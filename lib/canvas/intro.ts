import type { Slide, TextElement } from './types';
import { topicIndexes } from './queue';

// Topic introductions: before the first slide of a topic, the professor says a
// short opener ("Next, let's look at how they got here…") while a small title
// card shows the topic. Stored on that slide (Slide.intro); written by the AI
// when the deck is made or saved, editable in the editor, never overwritten
// once a person has typed one.

/** Is slide i the first slide of its topic? */
export function startsTopic(slides: Slide[], i: number): boolean {
  if (i < 0 || i >= slides.length) return false;
  const topics = topicIndexes(slides);
  return i === 0 || topics[i] !== topics[i - 1];
}

/** What an intro is written from: the topic's name. */
export const introBasis = (slide: Slide) => slide.topic?.trim() ?? '';

export const introText = (slide: Slide) => slide.intro?.say?.trim() ?? '';

// What still needs writing or recording: needsIntro / needsIntroAudio in aiFields.ts

/** The id the player uses for an intro clip (not an element on the slide). */
export const introId = (slide: Slide) => `${slide.id}~intro`;
export const isIntroId = (id: string | null | undefined) => !!id?.endsWith('~intro');

/**
 * The intro as a clip the player can play like an element's (its own id,
 * nothing on the slide to highlight), or null when this slide has none.
 */
export function introClip(slides: Slide[], i: number): TextElement | null {
  const s = slides[i];
  const say = s ? introText(s) : '';
  if (!say || s.intro?.off || !startsTopic(slides, i)) return null;
  return {
    id: introId(s), type: 'text', text: '', style: 'body', x: 0, y: 0, w: 0, h: 0,
    say, audioUrl: s.intro?.audioUrl, audioFor: s.intro?.audioFor,
  };
}
