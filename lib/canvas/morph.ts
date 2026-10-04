import type { ImageElement, Slide, SlideElement, TextElement } from './types';

/*
 * Slide morphing: the current slide turns into another one (a helper slide
 * when the learner is lost, the plain-words version when they ask for
 * simpler) instead of a popup or a jump. Elements that exist on both slides
 * glide and resize to their new place and their content cross-fades; the
 * rest fade out or in. This file decides which element becomes which, and
 * builds the slides to morph into; SlideCanvas draws the animation.
 */

export type MorphPlan = {
  pairs: [SlideElement, SlideElement][];   // [on the old slide, on the new slide]
  leaving: SlideElement[];                 // only on the old slide: fade out
  entering: SlideElement[];                // only on the new slide: fade in
};

const center = (e: SlideElement) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
const distance = (a: SlideElement, b: SlideElement) => {
  const p = center(a), q = center(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** How badly `a` would have to change to become `b`; Infinity = never pair them. */
function cost(a: SlideElement, b: SlideElement): number {
  if (a.type !== b.type) return Infinity;   // a picture never turns into a text box
  let c = distance(a, b);
  if (a.type === 'text' && b.type === 'text') {
    const ta = (a as TextElement).style, tb = (b as TextElement).style;
    if ((ta === 'title') !== (tb === 'title')) c += 200;   // titles become titles first
    else if (ta !== tb) c += 20;
  }
  return c;
}

/**
 * Which element on `from` becomes which on `to`. The same id always pairs
 * (the plain-words version keeps every id); otherwise the cheapest pairs are
 * taken first: titles with titles, pictures with the nearest picture, text
 * with the nearest text of the same kind.
 */
export function planMorph(from: Slide, to: Slide): MorphPlan {
  const pairs: [SlideElement, SlideElement][] = [];
  const freeA = new Set(from.elements);
  const freeB = new Set(to.elements);

  for (const b of to.elements) {
    const a = from.elements.find((x) => x.id === b.id && freeA.has(x) && x.type === b.type);
    if (a) { pairs.push([a, b]); freeA.delete(a); freeB.delete(b); }
  }

  const options: { a: SlideElement; b: SlideElement; c: number }[] = [];
  for (const a of freeA) for (const b of freeB) {
    const c = cost(a, b);
    if (c < Infinity) options.push({ a, b, c });
  }
  options.sort((p, q) => p.c - q.c);
  for (const { a, b } of options) {
    if (!freeA.has(a) || !freeB.has(b)) continue;
    pairs.push([a, b]);
    freeA.delete(a);
    freeB.delete(b);
  }
  return { pairs, leaving: [...freeA], entering: [...freeB] };
}

/** An authored helper ("explain it another way"): its title, picture and explanation. */
export type HelperContent = { title: string; body: string; image_url?: string | null };

/**
 * The helper as a slide in the canvas format, laid out so it morphs well
 * from a normal slide: the title stays a title at the top, the picture takes
 * the left, the explanation the right (full width when there's no picture).
 * It keeps the current slide's background, so the slide itself doesn't change.
 */
export function helperSlide(base: Slide, h: HelperContent): Slide {
  const title: TextElement = {
    id: 'helper-title', type: 'text', text: h.title, style: 'title', align: 'center', bold: true,
    x: 4, y: 4, w: 92, h: 15, silent: true, color: '#0b4a6f',
  };
  const elements: SlideElement[] = [title];
  if (h.image_url) {
    const img: ImageElement = {
      id: 'helper-image', type: 'image', src: h.image_url, alt: h.title, fit: 'contain',
      x: 4, y: 22, w: 54, h: 72, silent: true,
    };
    elements.push(img);
  }
  elements.push({
    id: 'helper-body', type: 'text', text: h.body, style: 'body',
    x: h.image_url ? 61 : 8, y: 24, w: h.image_url ? 35 : 84, h: 68, silent: true,
  } as TextElement);
  return { id: `${base.id}~helper`, background: base.background, elements };
}

/**
 * "Simpler please" and "lost" with no helper slide: the element being
 * explained grows to fill the slide and everything else fades away. A text
 * box shows its plain-words version (a spoken paragraph: it needs the room);
 * a picture just gets big. null when there's nothing to focus on.
 */
export function focusSlide(base: Slide, elementId: string | null | undefined): Slide | null {
  const el = base.elements.find((e) => e.id === elementId) ?? base.elements.find((e) => !e.silent);
  if (!el) return null;
  const big = { x: 7, y: 8, w: 86, h: 84 };
  const focused: SlideElement = el.type === 'text'
    ? el.plain?.trim()
      // a sentence or two reads big, like a headline; a longer paragraph at normal size
      ? { ...el, ...big, text: el.plain.trim(), style: el.plain.trim().length <= 160 ? 'title' : 'body', align: 'center' }
      : { ...el, ...big, align: 'center' }
    : { ...el, ...big, fit: 'contain' };
  return { id: `${base.id}~focus`, background: base.background, elements: [focused] };
}

/** Whether two slides are versions of the same slide (base, helper, focus): then a change between them morphs. */
export function sameBase(a: string, b: string): boolean {
  return a.split('~')[0] === b.split('~')[0];
}
