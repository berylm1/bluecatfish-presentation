import type { ActivityElement, ChartElement, Deck, DiagramElement, ImageElement, Slide, SlideElement, TextElement, TextStyle } from './types';

// Cleans a deck that came from the editor (or an AI) before it's stored:
// known fields only, numbers kept on the slide, strings capped, and only
// web or site-relative image addresses. Throws on anything unusable.

const STYLES: TextStyle[] = ['title', 'body', 'caption', 'bigNumber'];
const MAX_SLIDES = 200;
const MAX_ELEMENTS = 60;
const DIAGRAMS = ['steps', 'cycle', 'timeline', 'compare', 'sizes'];
const ACTIVITIES = ['sort', 'order', 'cards', 'hotspots', 'slider'];

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
    pointers: Array.isArray(raw.pointers)
      ? raw.pointers.slice(0, 3).map((p: any) => ({ x: num(p?.x, 0, 100, 50), y: num(p?.y, 0, 100, 50), word: str(p?.word, 60) ?? '' })).filter((p: { word: string }) => p.word)
      : undefined,
    pointersByAI: bool(raw.pointersByAI),
    pointersFrom: tag(raw.pointersFrom),
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
  if (raw.type === 'chart') {
    const bars = (Array.isArray(raw.bars) ? raw.bars : []).slice(0, 6)
      .map((b: any) => ({ label: str(b?.label, 30) ?? '', value: num(b?.value, 0, 1e9, 0), color: color(b?.color) }))
      .filter((b: { label: string }) => b.label);
    if (!bars.length) return null;
    const kind = raw.kind === 'line' || raw.kind === 'pie' ? raw.kind : undefined;
    const el: ChartElement = { ...base, type: 'chart', kind, bars, unit: str(raw.unit, 12), alt: str(raw.alt, 2000) };
    return el;
  }
  if (raw.type === 'diagram') {
    const kind = DIAGRAMS.includes(raw.kind) ? raw.kind : 'steps';
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 8)
      .map((it: any) => ({
        label: str(it?.label, 40) ?? '', detail: str(it?.detail, 80),
        value: typeof it?.value === 'number' ? num(it.value, 0, 1e9, 0) : undefined, color: color(it?.color),
      }))
      .filter((it: { label: string }) => it.label);
    if (!items.length) return null;
    const cols = Array.isArray(raw.columns) ? raw.columns.map((c: unknown) => str(c, 30) ?? '') : null;
    const el: DiagramElement = {
      ...base, type: 'diagram', kind, items, unit: str(raw.unit, 12), alt: str(raw.alt, 2000),
      columns: cols && cols.length >= 2 && (cols[0] || cols[1]) ? [cols[0], cols[1]] : undefined,
    };
    return el;
  }
  if (raw.type === 'activity') {
    const kind = ACTIVITIES.includes(raw.kind) ? raw.kind : null;
    if (!kind) return null;
    const groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 4).map((g: unknown) => str(g, 30) ?? '').filter(Boolean);
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 8)
      .map((it: any) => ({
        text: str(it?.text, 60) ?? '', back: str(it?.back, 160),
        group: typeof it?.group === 'number' ? num(Math.round(it.group), 0, Math.max(0, groups.length - 1), 0) : undefined,
        x: typeof it?.x === 'number' ? num(it.x, 0, 100, 50) : undefined,
        y: typeof it?.y === 'number' ? num(it.y, 0, 100, 50) : undefined,
      }))
      .filter((it: { text: string }) => it.text);
    const sl = raw.slider;
    const slider = kind === 'slider' && sl && typeof sl === 'object' ? (() => {
      const min = num(sl.min, -1e6, 1e6, 0), max = Math.max(min + 1e-6, num(sl.max, -1e6, 1e6, 10));
      const stops = (Array.isArray(sl.stops) ? sl.stops : []).slice(0, 8)
        .map((st: any) => ({ at: num(st?.at, min, max, min), text: str(st?.text, 120) ?? '', scale: typeof st?.scale === 'number' ? num(st.scale, 0.1, 3, 1) : undefined }))
        .filter((st: { text: string }) => st.text)
        .sort((a: { at: number }, b: { at: number }) => a.at - b.at);
      return { label: str(sl.label, 40) ?? '', min, max, step: typeof sl.step === 'number' ? num(sl.step, 1e-6, 1e6, 1) : undefined, unit: str(sl.unit, 12), stops };
    })() : undefined;
    // Kept even half made (the editor saves work in progress); the lesson skips one that isn't ready (activityReady)
    const el: ActivityElement = {
      ...base, type: 'activity', kind, prompt: str(raw.prompt, 120), alt: str(raw.alt, 2000),
      groups: kind === 'sort' ? groups : undefined, items: kind === 'slider' ? undefined : items,
      src: safeUrl(raw.src), slider,
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
