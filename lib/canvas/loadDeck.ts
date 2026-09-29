'use client';

import { SAMPLE_DECK } from './sampleDeck';
import { loadLegacyDeck } from './fromLegacy';
import { DEFAULT_LESSON, HAS_AI_LESSON } from './lessons';
import type { Deck } from './types';

// Which deck a lesson plays, in the browser: shared by /presentation and /lessonReview.
//   preview 'draft' / 'ai' → that deck (editors only)
//   otherwise → the published deck; with none, the AI deck; with neither,
//   the old AI lesson converted (Blue Catfish only). 'sample' → the built-in sample.

export type Loaded = { deck: Deck; preview: boolean };

export async function loadDeck(lesson: string, preview: 'draft' | 'ai' | null): Promise<Loaded> {
  if (lesson === 'sample') return { deck: SAMPLE_DECK, preview: false };
  if (preview) {
    const res = await fetch(`/api/editor/deck?lesson=${encodeURIComponent(lesson)}&kind=${preview}`);
    if (res.status === 401) throw new Error('Previews are for editors: unlock the slide editor first.');
    const { deck } = await res.json();
    if (!deck?.slides?.length) throw new Error(preview === 'ai' ? 'This lesson has no AI deck yet.' : 'This draft has no saved slides yet.');
    return { deck, preview: true };
  }
  const res = await fetch(`/api/deck?lesson=${encodeURIComponent(lesson)}`);
  const { deck, error } = await res.json();
  if (error) throw new Error(error);
  if (deck?.slides?.length) return { deck, preview: false };
  if (HAS_AI_LESSON.has(lesson)) return { deck: await loadLegacyDeck(lesson, DEFAULT_LESSON.title), preview: false };
  throw new Error('This lesson hasn’t been published yet.');
}

