import type { Slide, SlideElement } from './types';

// Elements whose vertical ranges mostly overlap are one row, read left to
// right, even if one starts higher (a big image next to small text).
function overlap(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

/** Top-left to bottom-right: group into rows, then left to right within a row. */
export function inReadingOrder<T extends SlideElement>(els: T[]): T[] {
  const rows: { span: [number, number]; items: T[] }[] = [];
  for (const el of [...els].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const range: [number, number] = [el.y, el.y + el.h];
    const row = rows.find((r) => overlap(r.span, range) >= 0.5 * Math.min(el.h, r.span[1] - r.span[0]));
    if (row) {
      row.items.push(el);
      row.span = [Math.min(row.span[0], range[0]), Math.max(row.span[1], range[1])];
    } else {
      rows.push({ span: range, items: [el] });
    }
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

/** What an element says: its spoken words, or (until those are written) its shown text. */
export function spokenText(el: SlideElement): string {
  if (el.say?.trim()) return el.say.trim();
  if (el.type === 'text') return el.text.trim();
  return '';
}

export function speaks(el: SlideElement): boolean {
  return !el.silent && spokenText(el).length > 0;
}

/**
 * The order a slide's elements are spoken in: numbered ones first (by number,
 * ties in reading order), then the unnumbered ones in reading order
 * (top-left to bottom-right, left to right within a row).
 */
export function speakingOrder(slide: Slide): SlideElement[] {
  const speaking = slide.elements.filter(speaks);
  const reading = inReadingOrder(speaking);
  const rank = (e: SlideElement) => reading.indexOf(e);
  const numbered = reading
    .filter((e) => typeof e.queue === 'number')
    .sort((a, b) => a.queue! - b.queue! || rank(a) - rank(b));
  const rest = reading.filter((e) => typeof e.queue !== 'number');
  return [...numbered, ...rest];
}

/** Topic groups: consecutive slides with the same topic. Returns each slide's topic index. */
export function topicIndexes(slides: Slide[]): number[] {
  const out: number[] = [];
  let idx = -1;
  let prev: string | undefined;
  slides.forEach((s, i) => {
    const t = s.topic?.trim().toLowerCase() || undefined;
    if (i === 0 || t !== prev) idx++;
    out.push(idx);
    prev = t;
  });
  return out;
}
