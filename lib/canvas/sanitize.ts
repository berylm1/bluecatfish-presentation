import type { ActivityElement, ChartElement, CheckedClaim, Deck, DeckChecks, DiagramElement, ImageElement, Slide, SlideElement, TextElement, TextStyle } from './types';

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
      answerCheck: raw.answerCheck && typeof raw.answerCheck === 'object' && tag(raw.answerCheck.from) ? {
        from: raw.answerCheck.from, ok: raw.answerCheck.ok === true,
        notes: (Array.isArray(raw.answerCheck.notes) ? raw.answerCheck.notes : []).slice(0, 10).map((x: unknown) => str(x, 300)).filter(Boolean) as string[],
        fixed: (Array.isArray(raw.answerCheck.fixed) ? raw.answerCheck.fixed : []).slice(0, 10).map((x: unknown) => str(x, 300)).filter(Boolean) as string[],
        byPerson: bool(raw.answerCheck.byPerson),
        fixesSeen: bool(raw.answerCheck.fixesSeen),
        suggested: (() => {
          const sg = raw.answerCheck.suggested;
          if (!sg || typeof sg !== 'object') return undefined;
          // the suggested key is cleaned exactly like the box's own
          const clean = element({ ...raw, answerCheck: undefined, items: sg.items, slider: sg.slider }, fallbackId) as ActivityElement | null;
          const list = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 10).map((x: unknown) => str(x, 300)).filter(Boolean) as string[];
          return clean ? { items: clean.items, slider: clean.slider, notes: list(sg.notes), says: list(sg.says) } : undefined;
        })(),
      } : undefined,
      keyByPerson: bool(raw.keyByPerson),
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
      caption: str(raw.caption, 120),
      captionByAI: bool(raw.captionByAI),
      captionFrom: tag(raw.captionFrom),
      captionOff: bool(raw.captionOff),
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
    intro: raw?.intro && typeof raw.intro === 'object' && (str(raw.intro.say, 1000) || raw.intro.off === true) ? {
      say: str(raw.intro.say, 1000), sayByAI: bool(raw.intro.sayByAI), sayFrom: tag(raw.intro.sayFrom),
      audioUrl: safeUrl(raw.intro.audioUrl), audioFor: tag(raw.intro.audioFor), off: bool(raw.intro.off),
    } : undefined,
  };
}

/** The editor's remembered checks (DeckChecks): known fields only, capped. */
function checks(raw: any): DeckChecks | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const tags = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((t): t is string => tag(t) !== undefined))].slice(-max) : undefined);
  let facts: DeckChecks['facts'];
  if (raw.facts && typeof raw.facts === 'object') {
    facts = {};
    for (const [slideId, f] of Object.entries(raw.facts).slice(0, MAX_SLIDES) as [string, any][]) {
      if (!/^[\w-]{1,64}$/.test(slideId) || !f || typeof f !== 'object' || !tag(f.from)) continue;
      const claims: CheckedClaim[] = (Array.isArray(f.claims) ? f.claims : []).slice(0, 20).flatMap((c: any) => {
        const claim = str(c?.claim, 200);
        if (!claim) return [];
        const verdict = c.verdict === 'supported' || c.verdict === 'contradicted' ? c.verdict : 'unsupported';
        const rw = c.rewrite && typeof c.rewrite === 'object' && typeof c.rewrite.beforeSay === 'string' ? {
          say: str(c.rewrite.say, 4000), text: str(c.rewrite.text, 2000), beforeSay: c.rewrite.beforeSay.slice(0, 4000), beforeText: str(c.rewrite.beforeText, 2000),
        } : undefined;
        return [{
          claim, verdict, elId: str(c.elId, 64),
          sources: (Array.isArray(c.sources) ? c.sources : []).slice(0, 5).map((x: any) => ({ source: str(x?.source, 200) ?? 'knowledge base', quote: str(x?.quote, 200) ?? '' })),
          fix: str(c.fix, 300), rewrite: rw && (rw.say || rw.text) ? rw : undefined,
        }];
      });
      facts[slideId] = { from: f.from, at: str(f.at, 40) ?? '', excerpts: num(f.excerpts, 0, 100, 0), claims };
    }
  }
  const repeats = raw.repeats && typeof raw.repeats === 'object' && tag(raw.repeats.from)
    ? { from: raw.repeats.from, at: str(raw.repeats.at, 40) ?? '', found: num(raw.repeats.found, 0, 1000, 0) } : undefined;
  // the story-order suggestions: moves of slide ids (checked again against the deck when made)
  const o = raw.order;
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[\w~-]{1,64}$/.test(x)).slice(0, max) : []);
  const order = o && typeof o === 'object' && tag(o.from) ? {
    from: o.from as string,
    at: str(o.at, 40) ?? '',
    why: str(o.why, 300),
    moves: (Array.isArray(o.moves) ? o.moves : []).slice(0, 30).flatMap((m: any) => {
      const list = ids(m?.ids, 60);
      const after = m?.after === null ? null : ids([m?.after], 1)[0];
      if (!list.length || after === undefined) return [];
      return [{ ids: list, after, label: str(m?.label, 200) ?? 'Move slides', topic: bool(m?.topic), reword: ids(m?.reword, 60) }];
    }),
  } : undefined;
  // the picture check: per slide, what it looked at and the layout with the pictures (elements cleaned like a slide's)
  let pictures: DeckChecks['pictures'];
  if (raw.pictures && typeof raw.pictures === 'object') {
    pictures = {};
    for (const [slideId, c] of Object.entries(raw.pictures).slice(0, MAX_SLIDES) as [string, any][]) {
      if (!/^[\w-]{1,64}$/.test(slideId) || !c || typeof c !== 'object' || !tag(c.from)) continue;
      const i = c.idea;
      const els = i && Array.isArray(i.elements) ? i.elements.slice(0, MAX_ELEMENTS).map((e: any, n: number) => element(e, `${slideId}-p${n}`)).filter(Boolean) as SlideElement[] : [];
      const pics = i && Array.isArray(i.pictures) ? i.pictures.slice(0, 5).flatMap((x: any) => { const src = safeUrl(x?.src); return src ? [{ src, alt: str(x?.alt, 300) ?? '', why: str(x?.why, 200) ?? '' }] : []; }) : [];
      pictures[slideId] = { from: c.from, at: str(c.at, 40) ?? '', idea: els.length && pics.length ? { pictures: pics, elements: els } : null };
    }
  }
  const out: DeckChecks = { facts, factsOk: tags(raw.factsOk, 500), repeats, repeatSkips: tags(raw.repeatSkips, 500), order, orderSkips: tags(raw.orderSkips, 200), pictures, pictureSkips: tags(raw.pictureSkips, 300) };
  return out.facts || out.factsOk?.length || out.repeats || out.repeatSkips?.length || out.order || out.orderSkips?.length || out.pictures || out.pictureSkips?.length ? out : undefined;
}

/** The quiz pool: known fields only, capped; a question needs 2 to 4 different choices and a right one. */
export function quiz(raw: any): Deck['quiz'] {
  if (!raw || typeof raw !== 'object' || !tag(raw.from)) return undefined;
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 12).flatMap((q: any) => {
    const text = str(q?.q, 200);
    const choices = (Array.isArray(q?.choices) ? q.choices : []).slice(0, 4).map((c: unknown) => str(c, 100) ?? '');
    const answer = typeof q?.answer === 'number' ? Math.round(q.answer) : -1;
    const distinct = new Set(choices.map((c: string) => c.trim().toLowerCase())).size === choices.length;
    if (!text || choices.length < 2 || choices.some((c: string) => !c) || !distinct || answer < 0 || answer >= choices.length) return [];
    return [{ q: text, choices, answer, why: str(q?.why, 240) }];
  });
  return { questions, from: raw.from, off: bool(raw.off) };
}

/** The question bank: known fields only, capped; each question needs words, a known asker and an answer slide. */
export function bank(raw: any): Deck['bank'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const ASKERS = ['maya', 'finn', 'leo'];
  const seen = new Set<string>();
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 80).flatMap((q: any, i: number) => {
    const text = str(q?.q, 200);
    const topic = str(q?.topic, 80);
    if (!text || !topic || !q?.slide || typeof q.slide !== 'object') return [];
    let qid = id(q?.id, `bq${i}`);
    if (seen.has(qid)) qid = `${qid}-${i}`;
    seen.add(qid);
    const answer = slide({ ...q.slide, id: id(q.slide.id, `${qid}-s`) }, i);
    return [{ id: qid, topic, q: text, asker: ASKERS.includes(q?.asker) ? q.asker : 'maya', slide: answer, byAI: bool(q?.byAI) }];
  });
  const from: Record<string, string> = {};
  if (raw.from && typeof raw.from === 'object') {
    for (const [k, v] of Object.entries(raw.from).slice(0, 40)) { const t = str(k, 80); if (t && tag(v)) from[t] = v as string; }
  }
  return { questions, from, off: bool(raw.off) };
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
    quiz: quiz(raw.quiz),
    bank: bank(raw.bank),
    checks: checks(raw.checks),
    editRev: typeof raw.editRev === 'string' && /^[a-z0-9]{1,24}$/.test(raw.editRev) ? raw.editRev : undefined,
    basedOn: typeof raw.basedOn === 'string' && /^(bluecatfish_|canvas_ai:)[\w:.-]{1,120}$/.test(raw.basedOn) ? raw.basedOn : undefined,
    source,
  };
}

/** Undefined fields out, so stored JSON stays small and diffs stay readable. */
export function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
