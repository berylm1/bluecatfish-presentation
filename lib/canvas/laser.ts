import type { Pointer, SlideElement } from './types';

/*
 * The laser pointer: when the professor reaches a mark's phrase in an
 * element's spoken words, a red dot points at the mark for a few seconds.
 * Times come from where the phrase sits in the text (speech is close to
 * even-paced, as for finishing sentences).
 */

export const LASER_MS = 3000;

/** Where a picture is drawn inside its box, in % of the box ("contain" letterboxes, "cover" crops). */
export function contentRect(boxW: number, boxH: number, natW: number, natH: number, fit: 'contain' | 'cover' = 'contain') {
  if (!boxW || !boxH || !natW || !natH) return { x: 0, y: 0, w: 100, h: 100 };
  const scale = fit === 'cover' ? Math.max(boxW / natW, boxH / natH) : Math.min(boxW / natW, boxH / natH);
  const w = (natW * scale / boxW) * 100, h = (natH * scale / boxH) * 100;
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}

/** When (0-1 of the clip) the mark's phrase is said, or null if the words don't contain it. */
export function pointerShare(text: string, p: Pointer): number | null {
  const i = text.toLowerCase().indexOf(p.word.toLowerCase().trim());
  return i < 0 || !text.length ? null : i / text.length;
}

/** The mark to show at time t (seconds) of a clip lasting `duration`, or null. */
export function activePointer(el: SlideElement, text: string, t: number, duration: number): Pointer | null {
  if (!el.pointers?.length || !Number.isFinite(duration) || duration <= 0) return null;
  let best: Pointer | null = null;
  let bestStart = -1;
  for (const p of el.pointers) {
    const share = pointerShare(text, p);
    if (share === null) continue;
    const start = share * duration - 0.2;   // a moment early, as a person points while saying it
    if (t >= start && t < start + LASER_MS / 1000 && start > bestStart) { best = p; bestStart = start; }
  }
  return best;
}
