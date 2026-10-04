import type { Deck, Slide, SlideElement, SlideHelper, TextElement } from './types';
import { STYLE, chat, knowledge } from './ai';
import { autoFix, formatGuide, imagesFor, problems, type LibImage } from './generate';
import { fingerprint, sayBasis, slideBasis } from './aiFields';

/*
 * The AI's draft of a slide's helper: the "explain it another way" version
 * the slide morphs into when a learner is lost. Elements that carry over keep
 * the slide element's id, so they morph from it (the title stays a title, the
 * picture dissolves into a new one); new elements fade in. A draft is only
 * stored into an empty or AI-drafted helper (see applyPatches).
 */

const MAX_ELEMENTS = 5;

function describe(slide: Slide): string {
  return JSON.stringify(slide.elements.map((e) => ({
    id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
    ...(e.type === 'text' ? { style: e.style, text: e.text } : { description: e.alt ?? '' }),
    ...(e.silent ? { silent: true } : {}),
    ...(e.say ? { says: e.say.slice(0, 300) } : {}),
  })));
}

const SYSTEM = `${STYLE}
You design the HELPER version of one lesson slide. It is shown when a learner says they are lost: the slide smoothly MORPHS into it, then back.
Teach the SAME idea another way, for a 10-14 year old who didn't get it: an everyday comparison (an analogy they know), a simpler
picture, or a short step-by-step breakdown. Fewer words than the slide. Never new facts: only what the slide and the knowledge base say.

MORPH LINKS (important): an element that carries over from the slide keeps the slide element's "id" and its "type" (text stays text,
image stays image): it glides to its new place and its content turns into the new content. Usually keep the title's id (rewrite the title
in kid words, e.g. "Think of it like a vacuum cleaner") and the main picture's id. New elements get ids "h1", "h2", ...
Pictures: "image": "keep" keeps the slide's picture (only on an image that reuses a slide image's id), or an id from AVAILABLE IMAGES
to show that picture instead (it dissolves into it). Never invent image ids.

At most ${MAX_ELEMENTS} elements: typically a title (silent), one picture, and one or two short text boxes. The speaking elements carry
the explanation in "say" (30-60 words each, spoken, the analogy or the steps; never read the shown text out). No "plain" fields.

${formatGuide()}

Reply as JSON: {"elements": [ ... ]}`;

/** Model output → helper elements: ids linked or fresh, pictures resolved, words marked as AI-written. */
export function toHelper(raw: any, slide: Slide, images: LibImage[]): SlideElement[] {
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  const lib = new Map(images.map((i) => [i.id, i]));
  const used = new Set<string>();
  const out: SlideElement[] = [];
  for (const [j, e] of (Array.isArray(raw?.elements) ? raw.elements : []).slice(0, MAX_ELEMENTS).entries()) {
    if (!e || (e.type !== 'text' && e.type !== 'image')) continue;
    const from = byId.get(String(e.id));
    const linked = from && from.type === e.type && !used.has(from.id);
    const id = linked ? from!.id : `${slide.id}-h${j + 1}`;
    used.add(id);
    const box = {
      x: Number(e.x) || 0, y: Number(e.y) || 0, w: Number(e.w) || 30, h: Number(e.h) || 15,
      silent: e.silent === true ? true : undefined,
      say: typeof e.say === 'string' && e.say.trim() && e.silent !== true ? e.say.trim().slice(0, 1500) : undefined,
    };
    if (e.type === 'image') {
      const keep = e.image === 'keep' && linked && from!.type === 'image' ? from : null;
      const pick = keep ? null : lib.get(String(e.image));
      if (!keep && !pick) continue;   // invented or missing picture: leave it out
      out.push({
        id, type: 'image', ...box,
        src: keep && keep.type === 'image' ? keep.src : pick!.url,
        alt: keep && keep.type === 'image' ? keep.alt : pick!.description,
        fit: e.fit === 'cover' ? 'cover' : 'contain',
      });
    } else if (typeof e.text === 'string' && e.text.trim()) {
      out.push({
        id, type: 'text', ...box, text: e.text.trim().slice(0, 400),
        style: ['title', 'body', 'caption', 'bigNumber'].includes(e.style) ? e.style : 'body',
        color: typeof e.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : undefined,
        bold: e.bold === true ? true : undefined,
        align: ['left', 'center', 'right'].includes(e.align) ? e.align : undefined,
      } as TextElement);
    }
  }
  // Keep every box on the slide
  for (const el of out) {
    el.w = Math.min(100, Math.max(1, el.w)); el.h = Math.min(100, Math.max(1, el.h));
    el.x = Math.min(100 - el.w, Math.max(0, el.x)); el.y = Math.min(100 - el.h, Math.max(0, el.y));
    if (el.say) Object.assign(el, { sayByAI: true, sayFrom: fingerprint(sayBasis(el)) });
  }
  return out;
}

/** Drafts the helper for one slide (one retry if the layout has problems). */
export async function draftHelper(slide: Slide, deck: Deck): Promise<SlideHelper> {
  const basis = slideBasis(slide);
  const [facts, images] = await Promise.all([
    knowledge(`${slide.topic ?? ''} ${basis}`, 5),
    imagesFor(`${slide.topic ?? ''} ${basis}`.slice(0, 500), 10),
  ]);
  const user =
    `Lesson: ${deck.title}\nTopic: ${slide.topic ?? '(not set)'}\nSLIDE (background ${slide.background?.color ?? '#ffffff'}): ${describe(slide)}\n\n` +
    `AVAILABLE IMAGES:\n${images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none: keep the slide\'s pictures or use none)'}\n\n` +
    `Knowledge base excerpts:\n${facts || '(none found)'}`;

  let raw = JSON.parse(await chat(SYSTEM, user, true, 3000));
  let elements = toHelper(raw, slide, images);
  const view = (els: SlideElement[]): Slide => ({ id: `${slide.id}~helper`, elements: els });
  const issues = problems({ elements: (raw?.elements ?? []).filter((e: any) => e?.image !== 'keep') }, view(elements), images);
  if (issues.length || !elements.length) {
    raw = JSON.parse(await chat(SYSTEM, `${user}\n\nYour previous helper had these problems, fix them:\n- ${issues.join('\n- ') || 'it had no usable elements'}\nPrevious answer: ${JSON.stringify(raw).slice(0, 4000)}`, true, 3000));
    elements = toHelper(raw, slide, images);
  }
  const fixed = view(elements);
  autoFix(fixed);
  return { elements: fixed.elements, byAI: true, from: fingerprint(basis) };
}
