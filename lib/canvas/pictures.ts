import type { Deck, PictureIdea, Slide, SlideElement } from './types';
import { chat, STYLE } from './ai';
import { autoFix, formatGuide, imagesFor, problems, type LibImage } from './generate';
import { slideBasis } from './aiFields';
import { spokenText } from './queue';

/*
 * The picture check: library pictures the lesson doesn't use yet, added where a slide talks about
 * something a picture would show (it mentions shad and eggs: a picture of shad). Only pictures that
 * are just a visual, no words in them. The AI picks 1 or 2 and lays the slide out again with them
 * (every box of the slide kept), then the layout checks: one fix, then the automatic fixes.
 *   - an AI slideshow: added when it's made (generate.ts, after the story order)
 *   - the editor: suggested when the lesson is saved (prepare.ts), Add / Show / Skip in the Check tab
 */

/** A picture whose description says it has words in it (a title, labels, a slide or poster) isn't used */
export function hasWords(description: string): boolean {
  return /\b(text|texts|words?|written|writing|titled?|titles|heading|headline|caption(?:ed)?|labels?|labell?ed|reads|reading|says|slide|poster|infographic|banner|logo|letters?|lettering|sign|credit|figure \d|bullet points?|chart|graph|table)\b/i.test(description);
}

/** Picture addresses the lesson already uses: its slides, helpers and answer slides */
export function lessonPictures(deck: Deck): Set<string> {
  const used = new Set<string>();
  const add = (els: SlideElement[]) => { for (const e of els) if ((e.type === 'image' || e.type === 'activity') && e.src) used.add(e.src); };
  for (const s of deck.slides) { add(s.elements); add(s.helper?.elements ?? []); }
  for (const q of deck.bank?.questions ?? []) add(q.slide.elements);
  return used;
}

const SYSTEM = `${STYLE}
You add PICTURES to one lesson slide. Below are pictures from the lesson's library that it doesn't use yet.
Add 1 or 2 of them ONLY where the slide talks about something a picture would show: an animal, a food, a place, a thing it names
(the slide mentions shad and fish eggs: a picture of shad). Only pictures that are just a visual: never one whose description mentions
words, titles, labels, text or a slide in it. Never a second picture of something the slide's pictures already show (the slide has a
blue catfish: no other blue catfish picture). If none fits what this slide says, reply {"add": []}.

Then lay the slide out again so everything fits with the new pictures: return EVERY element of the slide by its "id" with new x, y, w, h
(keep them all; text boxes may get narrower or smaller but must stay big enough for their words), plus each new picture as
{"type": "image", "image": "img2", "x": .., "y": .., "w": .., "h": ..}. NOTHING overlaps: no box touches another (a new picture never sits on
text, on another picture, a chart or a diagram); shrink or move the slide's pictures to make room. Nothing goes off the slide.

${formatGuide()}

Reply as JSON: {"add": [{"image": "img2", "why": "the slide talks about shad"}], "elements": [{"id": "...", "x": 0, "y": 0, "w": 0, "h": 0}, {"type": "image", "image": "img2", "x": 0, "y": 0, "w": 0, "h": 0}]}`;

const describe = (slide: Slide) => JSON.stringify(slide.elements.map((e) => ({
  id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
  ...(e.type === 'text' ? { style: e.style, text: e.text } : e.type === 'image' ? { picture: e.alt ?? '' } : {}),
})));

/** The slide's own boxes in their new places, and the new pictures (or null: unusable) */
function build(raw: any, slide: Slide, images: LibImage[]): { elements: SlideElement[]; added: LibImage[] } | null {
  const lib = new Map(images.map((i) => [i.id, i]));
  const placed = new Map<string, any>();
  const added: { img: LibImage; at: any }[] = [];
  for (const e of Array.isArray(raw?.elements) ? raw.elements : []) {
    if (e?.type === 'image' && e.image && !slide.elements.some((x) => x.id === e.id)) {
      const img = lib.get(String(e.image));
      if (img && !added.some((a) => a.img.id === img.id)) added.push({ img, at: e });
    } else if (typeof e?.id === 'string') placed.set(e.id, e);
  }
  if (!added.length) return null;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : fallback);
  const box = (at: any, el?: SlideElement) => {
    const w = Math.min(100, Math.max(4, num(at?.w, el?.w ?? 30)));
    const h = Math.min(100, Math.max(4, num(at?.h, el?.h ?? 30)));
    return { w, h, x: Math.min(100 - w, Math.max(0, num(at?.x, el?.x ?? 0))), y: Math.min(100 - h, Math.max(0, num(at?.y, el?.y ?? 0))) };
  };
  const elements: SlideElement[] = slide.elements.map((el) => (placed.has(el.id) ? { ...el, ...box(placed.get(el.id), el) } : { ...el }));
  added.slice(0, 2).forEach(({ img, at }, n) => {
    elements.push({ id: `${slide.id}-pic${n + 1}-${Date.now().toString(36).slice(-4)}`, type: 'image', src: img.url, alt: img.description, fit: 'contain', silent: true, ...box(at) } as SlideElement);
  });
  return { elements, added: added.slice(0, 2).map((a) => a.img) };
}

/**
 * Pictures for one slide, from candidates no other slide is getting (the caller hands out the
 * candidates, so two slides never get the same picture). null: nothing fits, or it couldn't be laid out.
 */
export async function pictureIdea(deck: Deck, slide: Slide, candidates: LibImage[]): Promise<PictureIdea | null> {
  if (!candidates.length) return null;
  const images = candidates.map((c, n) => ({ ...c, id: `img${n + 1}` }));
  const list = images.map((i) => `${i.id}: ${i.description}`).join('\n');
  const user = `Lesson: ${deck.title}\nTopic: ${slide.topic ?? ''}\nWhat the professor says on it: ${slide.elements.map(spokenText).filter(Boolean).join(' ').slice(0, 1500)}\n\n` +
    `SLIDE (background ${slide.background?.color ?? '#ffffff'}): ${describe(slide)}\n\nAVAILABLE PICTURES:\n${list}`;
  let raw = JSON.parse(await chat(SYSTEM, user, true, 3000));
  if (!Array.isArray(raw?.add) || !raw.add.length) return null;
  let made = build(raw, slide, images);
  if (!made) return null;
  const view = (els: SlideElement[]): Slide => ({ ...slide, elements: els });
  const toRaw = (r: any) => ({ elements: (r?.elements ?? []).map((e: any) => (e?.type === 'image' && e.image ? e : { ...e, type: 'text-placed' })) });
  // (the layout checks, and boxes on top of each other: any two that touch now and didn't on the slide as it was, a new picture
  // on anything. Was: only a new picture over text, so one landed on the slide's own picture)
  const visible = (e: SlideElement) => !(e.type === 'image' && (e.z ?? 1) <= 0);
  const touch = (a: SlideElement, b: SlideElement) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
  const before = new Set<string>();
  slide.elements.forEach((a, i) => slide.elements.slice(i + 1).forEach((b) => { if (touch(a, b)) before.add(`${a.id}|${b.id}`).add(`${b.id}|${a.id}`); }));
  const name = (e: SlideElement) => (e.type === 'text' ? `the text "${e.text.slice(0, 30)}"` : slide.elements.some((x) => x.id === e.id) ? `the slide's ${e.type === 'image' ? 'picture' : e.type}` : 'the new picture');
  const covers = (els: SlideElement[]) => {
    const vis = els.filter(visible);
    return vis.flatMap((a, i) => vis.slice(i + 1).filter((b) => touch(a, b) && !before.has(`${a.id}|${b.id}`)).map((b) => `${name(a)} and ${name(b)} overlap`));
  };
  const issues = [...problems(toRaw(raw), view(made.elements), images).filter((x) => !/AVAILABLE IMAGES/.test(x)), ...covers(made.elements)];
  if (issues.length) {
    try {
      const again = JSON.parse(await chat(SYSTEM, `${user}\n\nYour layout had problems, fix them:\n- ${issues.join('\n- ')}\nPrevious answer: ${JSON.stringify(raw).slice(0, 3000)}`, true, 3000));
      const remade = build(again, slide, images);
      if (remade) { raw = again; made = remade; }
    } catch { /* kept as it was */ }
  }
  const out = view(made.elements);
  autoFix(out);
  if (covers(out.elements).length) return null;   // still on top of each other after the fix: no suggestion rather than a broken slide
  const why = new Map((raw.add as any[]).map((a) => [String(a?.image), String(a?.why ?? '').slice(0, 200)]));
  return {
    pictures: made.added.map((i) => ({ src: i.url, alt: i.description, why: why.get(i.id) || `It shows what the slide talks about` })),
    elements: out.elements,
  };
}

/**
 * Candidate pictures for several slides at once: each slide's closest library pictures that the lesson
 * doesn't use and that have no words, every picture handed to one slide only (in slide order).
 */
export async function pictureCandidates(deck: Deck, slides: Slide[], taken: Set<string> = lessonPictures(deck)): Promise<Map<string, LibImage[]>> {
  const found = await Promise.all(slides.map((s) => imagesFor(`${s.topic ?? ''}: ${slideBasis(s)} ${s.elements.map(spokenText).join(' ')}`.slice(0, 1000), 8)));
  const out = new Map<string, LibImage[]>();
  slides.forEach((s, i) => {
    const mine = found[i].filter((img) => typeof img.url === 'string' && !taken.has(img.url) && !hasWords(img.description ?? '')).slice(0, 4);
    for (const img of mine) taken.add(img.url);
    out.set(s.id, mine);
  });
  return out;
}
