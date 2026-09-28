import type { TextElement, TextStyle } from './types';

// Rough "does this text fit its box?" without a browser, for checking AI
// layouts on the server. Matches SlideCanvas: font size is a % of slide height,
// the slide is 16:9 (width = 1.78 × height), average character ≈ 0.52 em,
// line height 1.25 (1.0 for big numbers), and a little box padding.

const SIZE: Record<TextStyle, number> = { title: 7.5, body: 4.6, caption: 3.2, bigNumber: 14 };
const LINE: Record<TextStyle, number> = { title: 1.25, body: 1.25, caption: 1.25, bigNumber: 1 };
const CHAR_EM = 0.52;
const ASPECT = 16 / 9;
const MIN_SCALE = 0.6;   // SlideCanvas shrinks text down to 60% before it overflows

/** Characters per line and % of slide height per line, for a box of width w (% of slide width). */
export function textMetrics(style: TextStyle, w: number, scale = 1) {
  const font = SIZE[style] * scale;                          // % of slide height
  const usableW = Math.max(1, w * ASPECT - 2 * 1);           // box width in slide-height %, minus side padding
  // × 0.9: words wrap whole, so lines end a little short
  return { charsPerLine: Math.max(1, Math.floor((usableW / (font * CHAR_EM)) * 0.9)), lineHeight: font * LINE[style] };
}

/** Height (% of slide) the text needs in this box at a given scale. */
export function neededHeight(el: Pick<TextElement, 'text' | 'style' | 'w'>, scale = 1): number {
  const { charsPerLine, lineHeight } = textMetrics(el.style, el.w, scale);
  const lines = el.text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / charsPerLine)), 0);
  return lines * lineHeight + 1.6;   // + top/bottom padding
}

/** 'ok', 'shrinks' (fits once shrunk), or 'overflows' (doesn't fit even at the smallest size). */
export function fitStatus(el: TextElement): 'ok' | 'shrinks' | 'overflows' {
  if (neededHeight(el) <= el.h) return 'ok';
  return neededHeight(el, MIN_SCALE) <= el.h ? 'shrinks' : 'overflows';
}
