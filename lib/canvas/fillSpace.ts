import type { Slide, SlideElement } from './types';

/*
 * Empty slides: a small picture in a big empty slide ("Fresh Is Best": a title, then a picture at the
 * bottom a quarter of the width). Pictures, charts and diagrams grow into the empty space around them,
 * in code, no AI: each side moves out step by step until it would touch another box or the slide's
 * margin. Pictures keep their shape inside the box (fit), so they just show bigger.
 *   - AI-made layouts get it in autoFix (generate.ts): new slides, helpers, answer slides, picture ideas
 *   - the editor: a check on the slide ("Lots of empty space") with a button to do it
 */

const MARGIN = 3;          // % kept clear at the slide's edges
const EMPTY_BELOW = 0.35;  // the slide's boxes cover less than this share of it: "lots of empty space"
const STEP = 1;
const GAP = 2;             // % kept between a grown box and the others

const visible = (e: SlideElement) => !(e.type === 'image' && (e.z ?? 1) <= 0);
const isMedia = (e: SlideElement) => (e.type === 'image' && (e.z ?? 1) > 0) || e.type === 'chart' || e.type === 'diagram';
const touch = (a: SlideElement, b: SlideElement) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;

/** How much of the slide its boxes cover (0-1; background pictures don't count) */
export function coverage(slide: Slide): number {
  return Math.min(1, slide.elements.filter(visible).reduce((n, e) => n + e.w * e.h, 0) / 10000);
}

/** The slide with its pictures, charts and diagrams grown into the empty space (a new slide; the same one if there's nothing to do) */
export function growMedia(slide: Slide): Slide {
  if (coverage(slide) >= EMPTY_BELOW || !slide.elements.some(isMedia)) return slide;
  const els = slide.elements.map((e) => ({ ...e }));
  // biggest first: it's the one that matters most
  const order = els.filter(isMedia).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const m of order) {
    const others = els.filter((o) => o !== m && visible(o));
    // (a box already touching another one: left where it is)
    if (others.some((o) => touch(m, o))) continue;
    let grew = true;
    for (let n = 0; grew && n < 400; n++) {
      grew = false;
      for (const side of ['left', 'right', 'up', 'down'] as const) {
        const t = { ...m };
        if (side === 'left') { t.x -= STEP; t.w += STEP; }
        if (side === 'right') t.w += STEP;
        if (side === 'up') { t.y -= STEP; t.h += STEP; }
        if (side === 'down') t.h += STEP;
        if (t.x < MARGIN || t.y < MARGIN || t.x + t.w > 100 - MARGIN || t.y + t.h > 100 - MARGIN) continue;
        if (others.some((o) => touch(t, { ...o, x: o.x - GAP, y: o.y - GAP, w: o.w + 2 * GAP, h: o.h + 2 * GAP }))) continue;   // (a little room between boxes)
        Object.assign(m, { x: t.x, y: t.y, w: t.w, h: t.h });
        grew = true;
      }
    }
    for (const k of ['x', 'y', 'w', 'h'] as const) m[k] = Math.round(m[k] * 10) / 10;
  }
  return { ...slide, elements: els };
}

/** Would growing the pictures make a real difference here (lots of empty space, and they'd get a lot bigger)? */
export function hasEmptySpace(slide: Slide): boolean {
  if (coverage(slide) >= EMPTY_BELOW) return false;
  const grown = growMedia(slide);
  const area = (s: Slide) => s.elements.filter(isMedia).reduce((n, e) => n + e.w * e.h, 0);
  return area(grown) > area(slide) * 1.5;
}
