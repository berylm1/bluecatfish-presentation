import { parseDeckCommand, findByPosition, tokens, type DeckCommand, type SearchableSection } from '@/lib/deckCommands';
import type { Deck } from './types';
import { topicIndexes } from './queue';

// On the canvas page a slide has several clips, so a bare "next" (or "next
// next") skips just the current clip. "next slide", "next page", "skip ahead"
// and the rest still go to the next slide, via the shared deck-command parser.
export type CanvasCommand = DeckCommand | { kind: 'nextClip' };

const BARE_NEXT = /^(?:(?:um+|uh+|ok(?:ay)?|so|and|now)\s+)*(?:next\s*)+(?:please|one)?$/;

export function parseCanvasCommand(raw: string): CanvasCommand | null {
  const text = raw.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (BARE_NEXT.test(text)) return { kind: 'nextClip' };
  return parseDeckCommand(raw);
}

/** Slide index for "go to <part>", or null if it isn't in this deck. */
export function findSlide(deck: Deck, query: string, currentSlide: number): number | null {
  const topics = topicIndexes(deck.slides);
  const firstOfTopic = (t: number) => topics.indexOf(t);

  // "topic 2", "the last topic", "slide 3", "the beginning"
  const topicCount = (topics[topics.length - 1] ?? -1) + 1;
  const pos = findByPosition(query, Array.from({ length: topicCount }, () => ({ title: '', steps: [] } as SearchableSection)));
  if (pos) {
    const topic = pos.section === -1 ? topics[currentSlide] : pos.section;
    const slide = firstOfTopic(topic) + pos.step;
    return topics[slide] === topic ? slide : firstOfTopic(topic);
  }

  // Keyword search: what's shown on the slide counts double, what's spoken once,
  // and each mention counts, so the slide that is ABOUT crabs beats one that
  // mentions crabs in passing.
  const q = [...new Set(tokens(query))];
  if (!q.length) return null;
  let best = { slide: -1, score: 0, covered: 0 };
  deck.slides.forEach((slide, i) => {
    const shown = tokens([slide.topic ?? '', ...slide.elements.map((e) => (e.type === 'text' ? e.text : e.alt ?? ''))].join(' '));
    const spoken = tokens(slide.elements.map((e) => e.say ?? '').join(' '));
    let score = 0;
    let covered = 0;
    for (const t of q) {
      const hits = 2 * shown.filter((w) => w === t).length + spoken.filter((w) => w === t).length;
      if (hits) covered++;
      score += hits;
    }
    if (covered > best.covered || (covered === best.covered && score > best.score)) best = { slide: i, score, covered };
  });
  return best.covered / q.length >= 0.5 ? best.slide : null;
}

/**
 * "go to <part>" when the keywords weren't sure: the server compares meanings
 * (/api/deck/search, the same search /presentationv2 falls back to).
 */
export async function searchByMeaning(deck: Deck, query: string): Promise<number | null> {
  const topics = topicIndexes(deck.slides);
  const docs = deck.slides.map((s, i) => ({
    section: topics[i],
    step: i - topics.indexOf(topics[i]),
    title: s.topic ?? '',
    text: s.elements.map((e) => [e.type === 'text' ? e.text : e.alt ?? '', e.say ?? ''].join(' ')).join(' '),
  }));
  try {
    const res = await fetch('/api/deck/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, docs }),
      signal: AbortSignal.timeout(9000),
    });
    const data = await res.json();
    if (!data.found) return null;
    const i = docs.findIndex((d) => d.section === data.section && d.step === Math.max(0, data.step));
    return i === -1 ? null : i;
  } catch {
    return null;
  }
}
