import type { Deck, SlideElement } from './types';
import { shownWords } from './queue';

/*
 * The lesson's ready-made parts, for a slide made on the spot (/api/tutor/compose): every text box,
 * picture, chart and diagram in the lesson and its answer slides, numbered (T1, P1, V1…). The AI only
 * picks parts by number and places them, so it's quick and every fact on the slide is one the lesson
 * already shows.
 */

export type Part = {
  id: string;
  kind: 'text' | 'picture' | 'visual';
  /** What it says or shows (for picking) */
  about: string;
  /** The element as it is in the lesson (its position is set again when it's placed) */
  el: SlideElement;
};

const MAX_PARTS = 160;

export function lessonParts(deck: Deck): Part[] {
  const out: Part[] = [];
  const seen = new Set<string>();
  const n = { text: 0, picture: 0, visual: 0 };
  const add = (el: SlideElement) => {
    if (el.type === 'activity') return;
    const kind = el.type === 'text' ? 'text' : el.type === 'image' ? 'picture' : 'visual';
    const about = (el.type === 'image' ? el.alt ?? '' : shownWords(el)).replace(/\s+/g, ' ').trim();
    if (!about || about.length > 400) return;
    const key = el.type === 'image' ? `p|${el.src}` : `${kind}|${about.toLowerCase()}`;
    if (seen.has(key) || out.length >= MAX_PARTS) return;
    if (el.type === 'image' && (el.z ?? 1) <= 0) return;   // (a background picture: not a part)
    seen.add(key);
    n[kind]++;
    out.push({ id: `${kind === 'text' ? 'T' : kind === 'picture' ? 'P' : 'V'}${n[kind]}`, kind, about: about.slice(0, 300), el });
  };
  for (const s of deck.slides) s.elements.forEach(add);
  for (const q of deck.bank?.off ? [] : deck.bank?.questions ?? []) q.slide.elements.forEach(add);
  return out;
}
