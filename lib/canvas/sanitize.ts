import type { Deck, ImageElement, Slide, SlideElement, TextElement, TextStyle } from './types';

// Cleans a deck that came from the editor (or an AI) before it's stored:
// known fields only, numbers kept on the slide, strings capped, and only
// web or site-relative image addresses. Throws on anything unusable.

const STYLES: TextStyle[] = ['title', 'body', 'caption', 'bigNumber'];
const MAX_SLIDES = 200;
const MAX_ELEMENTS = 60;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined;
const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : fallback;
const bool = (v: unknown): true | undefined => (v === true ? true : undefined);
const color = (v: unknown): string | undefined =>
  typeof v === 'string' && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(v.trim()) ? v.trim() : undefined;
export const safeUrl = (v: unknown): string | undefined =>
  typeof v === 'string' && (/^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/[^/\s"'<>][^\s"'<>]*$/.test(v)) ? v.slice(0, 2000) : undefined;
const tag = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v) ? v : undefined);
const id = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : fallback;

function element(raw: any, fallbackId: string): SlideElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = num(raw.w, 1, 100, 30);
  const h = num(raw.h, 1, 100, 15);
  const base = {
    id: id(raw.id, fallbackId),
    x: num(raw.x, 0, 100 - w, 0),
    y: num(raw.y, 0, 100 - h, 0),
    w,
    h,
    z: typeof raw.z === 'number' ? num(raw.z, -10, 100, 1) : undefined,
    silent: bool(raw.silent),
    queue: typeof raw.queue === 'number' ? num(raw.queue, 1, 999, 1) : undefined,
    say: str(raw.say, 4000),
    sayByAI: bool(raw.sayByAI),
    plain: str(raw.plain, 2000),
    plainByAI: bool(raw.plainByAI),
    audioUrl: safeUrl(raw.audioUrl),
    plainAudioUrl: safeUrl(raw.plainAudioUrl),
    sayFrom: tag(raw.sayFrom),
    plainFrom: tag(raw.plainFrom),
    audioFor: tag(raw.audioFor),
    plainAudioFor: tag(raw.plainAudioFor),
  };
  if (raw.type === 'text') {
    const el: TextElement = {
      ...base,
      type: 'text',
      text: typeof raw.text === 'string' ? raw.text.slice(0, 2000) : '',
      style: STYLES.includes(raw.style) ? raw.style : 'body',
      color: color(raw.color),
      bold: bool(raw.bold),
      align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : undefined,
    };
    return el;
  }
  if (raw.type === 'image') {
    const src = safeUrl(raw.src);
    if (!src) return null;
    const el: ImageElement = {
      ...base,
      type: 'image',
      src,
      alt: str(raw.alt, 2000),
      fit: raw.fit === 'cover' ? 'cover' : 'contain',
    };
    return el;
  }
  return null;
}

function slide(raw: any, i: number): Slide {
  const elements = (Array.isArray(raw?.elements) ? raw.elements : [])
    .slice(0, MAX_ELEMENTS)
    .map((e: unknown, j: number) => element(e, `e${i}-${j}`))
    .filter(Boolean) as SlideElement[];
  // Element ids must be unique on a slide (highlight and editor selection use them)
  const seen = new Set<string>();
  for (const [j, e] of elements.entries()) {
    if (seen.has(e.id)) e.id = `${e.id}-${j}`;
    seen.add(e.id);
  }
  const bg = raw?.background ?? {};
  const background = { color: color(bg.color), image: safeUrl(bg.image) };
  // The helper version: same element rules, its own unique ids
  let helper: Slide['helper'];
  if (raw?.helper && typeof raw.helper === 'object') {
    const hel = (Array.isArray(raw.helper.elements) ? raw.helper.elements : [])
      .slice(0, MAX_ELEMENTS)
      .map((e: unknown, j: number) => element(e, `h${i}-${j}`))
      .filter(Boolean) as SlideElement[];
    const hseen = new Set<string>();
    for (const [j, e] of hel.entries()) {
      if (hseen.has(e.id)) e.id = `${e.id}-h${j}`;
      hseen.add(e.id);
    }
    helper = { elements: hel, byAI: bool(raw.helper.byAI), from: tag(raw.helper.from), off: bool(raw.helper.off) };
  }
  return {
    id: id(raw?.id, `s${i}`),
    topic: str(raw?.topic, 200),
    topicByAI: bool(raw?.topicByAI),
    topicFrom: tag(raw?.topicFrom),
    background: background.color || background.image ? background : undefined,
    elements,
    helper,
  };
}

export function sanitizeDeck(raw: any, lessonId: string, source: Deck['source']): Deck {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.slides)) throw new Error('Not a deck: missing slides');
  if (raw.slides.length > MAX_SLIDES) throw new Error(`Too many slides (max ${MAX_SLIDES})`);
  const slides = raw.slides.map(slide);
  const seen = new Set<string>();
  for (const [i, s] of slides.entries()) {
    if (seen.has(s.id)) s.id = `${s.id}-${i}`;
    seen.add(s.id);
  }
  return {
    lessonId,
    title: str(raw.title, 200) ?? lessonId,
    slides,
    recap: str(raw.recap, 4000),
    recapByAI: bool(raw.recapByAI),
    editRev: typeof raw.editRev === 'string' && /^[a-z0-9]{1,24}$/.test(raw.editRev) ? raw.editRev : undefined,
    basedOn: typeof raw.basedOn === 'string' && /^(bluecatfish_|canvas_ai:)[\w:.-]{1,120}$/.test(raw.basedOn) ? raw.basedOn : undefined,
    source,
  };
}

/** Undefined fields out, so stored JSON stays small and diffs stay readable. */
export function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
