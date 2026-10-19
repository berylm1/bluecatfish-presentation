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

/**
 * Numbered parts from groups of elements (each part remembers its group: which answer it came from,
 * for a slide that answers several questions). Each text, picture and visual once.
 */
export function makeParts(groups: SlideElement[][]): (Part & { group: number })[] {
  const out: (Part & { group: number })[] = [];
  const seen = new Set<string>();
  const n = { text: 0, picture: 0, visual: 0 };
  groups.forEach((els, group) => els.forEach((el) => {
    if (el.type === 'activity') return;
    if (el.type === 'image' && (el.z ?? 1) <= 0) return;   // (a background picture: not a part)
    const kind = el.type === 'text' ? 'text' : el.type === 'image' ? 'picture' : 'visual';
    const about = (el.type === 'image' ? el.alt ?? '' : shownWords(el)).replace(/\s+/g, ' ').trim();
    if (!about || about.length > 400) return;
    const key = el.type === 'image' ? `p|${el.src}` : `${kind}|${about.toLowerCase()}`;
    if (seen.has(key) || out.length >= MAX_PARTS) return;
    seen.add(key);
    n[kind]++;
    out.push({ id: `${kind === 'text' ? 'T' : kind === 'picture' ? 'P' : 'V'}${n[kind]}`, kind, about: about.slice(0, 300), el, group });
  }));
  return out;
}

/** Every part in the lesson: its slides, then its answer slides */
export function lessonParts(deck: Deck): Part[] {
  return makeParts([
    deck.slides.flatMap((s) => s.elements),
    (deck.bank?.off ? [] : deck.bank?.questions ?? []).flatMap((q) => q.slide.elements),
  ]).map(({ group: _g, ...p }) => p);
}
