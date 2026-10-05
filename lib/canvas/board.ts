import type { Slide } from './types';
import { sanitizeDeck } from './sanitize';
import { autoFix, type LibImage } from './generate';

/**
 * The model's board (see /api/tutor/board) → a clean slide: up to 5 silent
 * elements, pictures only from the library list, everything checked by the
 * deck cleaner (on the slide, safe pictures, chart bars). null if unusable.
 */
export function toBoard(raw: any, images: LibImage[]): Slide | null {
  if (!raw?.board || !Array.isArray(raw.board.elements) || !raw.board.elements.length) return null;
  const lib = new Map(images.map((i) => [i.id, i]));
  // A board is drawn, not done: no hands-on boxes on it
  const elements = raw.board.elements.filter((e: any) => ['text', 'image', 'chart', 'diagram'].includes(e?.type)).slice(0, 5).flatMap((e: any, j: number) => {
    const base = { ...e, id: `board-${j + 1}`, silent: true, say: undefined, plain: undefined };
    if (e?.type === 'image') {
      const img = lib.get(String(e.image));
      return img ? [{ ...base, src: img.url, alt: img.description }] : [];
    }
    return [base];
  });
  try {
    // The deck cleaner checks every field (positions on the slide, safe pictures, chart bars)
    const deck = sanitizeDeck({ slides: [{ id: 'board', background: { color: raw.board.background }, elements }] }, 'board', 'ai');
    const slide = deck.slides[0];
    autoFix(slide);
    return slide.elements.length >= 2 ? slide : null;
  } catch {
    return null;
  }
}
