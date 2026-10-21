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
export function lessonPictures(deck: Deck, withBank = true): Set<string> {
  const used = new Set<string>();
  const add = (els: SlideElement[]) => { for (const e of els) if ((e.type === 'image' || e.type === 'activity') && e.src) used.add(e.src); };
  for (const s of deck.slides) { add(s.elements); add(s.helper?.elements ?? []); }
  // (the picture check leaves the bank's answer slides out: the lesson's own slides come first. Was: an answer slide
  // written earlier had taken the new pictures, so the slide that names them got none)
  if (withBank) for (const q of deck.bank?.questions ?? []) add(q.slide.elements);
  return used;
}

const SYSTEM = `${STYLE}
You add PICTURES to one lesson slide. Below are pictures from the lesson's library that it doesn't use yet.
- Add a picture for each thing the slide names that a picture would show: an animal, a food, a place, a thing (the slide lists
  fish, crabs, mussels and frogs: a picture of each that's in the list). Up to 5; a list of things makes a row of small pictures.
- If the slide has NO picture yet, add at least one that fits its main idea (a river, the fish, a catch), if any does.
- Only pictures that are just a visual: never one whose description mentions words, titles, labels, text or a slide in it.
- Never two pictures of the same thing (two people holding a catfish), and never one of something the slide's pictures already show.
- Prefer pictures not used yet. One marked "already used in the lesson" only when no other picture shows that thing.
- If none fits, reply {"add": []}.

Then lay the slide out again so everything fits: return EVERY element of the slide by its "id" with new x, y, w, h, plus each new picture
as {"type": "image", "image": "img2", "x": .., "y": .., "w": .., "h": ..}.
- Charts, diagrams and hands-on boxes keep EXACTLY their place and size (never squeezed): pictures go in free space or below them.
- Text boxes may move or get narrower but must stay big enough for their words.
- NOTHING overlaps: no box touches another. Nothing goes off the slide.

${formatGuide()}

Reply as JSON: {"add": [{"image": "img2", "why": "the slide talks about shad"}], "elements": [{"id": "...", "x": 0, "y": 0, "w": 0, "h": 0}, {"type": "image", "image": "img2", "x": 0, "y": 0, "w": 0, "h": 0}]}`;

const describe = (slide: Slide) => JSON.stringify(slide.elements.map((e) => ({
  id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
  ...(e.type === 'text' ? { style: e.style, text: e.text } : e.type === 'image' ? { picture: e.alt ?? '' } : {}),
})));

/** The slide's own boxes in their new places, and the new pictures (or null: unusable) */
const MAX_ADDED = 5;
/** Charts, diagrams and hands-on boxes: kept exactly where they are (a picture never squeezes them) */
const locked = (e: SlideElement) => e.type === 'chart' || e.type === 'diagram' || e.type === 'activity';
/** Two descriptions of much the same picture ("A man holding a large blue catfish" / "A person holding a big blue catfish") */
export function samePicture(a: string, b: string): boolean {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['with', 'that', 'this', 'from', 'large', 'small', 'photo', 'picture', 'image'].includes(w)));
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  const both = [...x].filter((w) => y.has(w)).length;
  return both / Math.min(x.size, y.size) >= 0.75;
}

function build(raw: any, slide: Slide, images: LibImage[]): { elements: SlideElement[]; added: LibImage[] } | null {
  const lib = new Map(images.map((i) => [i.id, i]));
  const shown = slide.elements.flatMap((e) => (e.type === 'image' && e.alt ? [e.alt] : []));
  const placed = new Map<string, any>();
  const added: { img: LibImage; at: any }[] = [];
  for (const e of Array.isArray(raw?.elements) ? raw.elements : []) {
    if (e?.type === 'image' && e.image && !slide.elements.some((x) => x.id === e.id)) {
      const img = lib.get(String(e.image));
      // (not one already added, and not much the same picture as one added or already on the slide)
      if (img && !added.some((a) => a.img.id === img.id || samePicture(a.img.description, img.description)) && !shown.some((d) => samePicture(d, img.description))) added.push({ img, at: e });
    } else if (typeof e?.id === 'string') placed.set(e.id, e);
  }
  if (!added.length) return null;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : fallback);
  const box = (at: any, el?: SlideElement) => {
    const w = Math.min(100, Math.max(4, num(at?.w, el?.w ?? 30)));
    const h = Math.min(100, Math.max(4, num(at?.h, el?.h ?? 30)));
    return { w, h, x: Math.min(100 - w, Math.max(0, num(at?.x, el?.x ?? 0))), y: Math.min(100 - h, Math.max(0, num(at?.y, el?.y ?? 0))) };
  };
  const elements: SlideElement[] = slide.elements.map((el) => (placed.has(el.id) && !locked(el) ? { ...el, ...box(placed.get(el.id), el) } : { ...el }));
  added.slice(0, MAX_ADDED).forEach(({ img, at }, n) => {
    elements.push({ id: `${slide.id}-pic${n + 1}-${Date.now().toString(36).slice(-4)}`, type: 'image', src: img.url, alt: img.description, fit: 'contain', silent: true, ...box(at) } as SlideElement);
  });
  return { elements, added: added.slice(0, MAX_ADDED).map((a) => a.img) };
}

/**
 * Pictures for one slide, from candidates no other slide is getting (the caller hands out the
 * candidates, so two slides never get the same picture). null: nothing fits, or it couldn't be laid out.
 */
export async function pictureIdea(deck: Deck, slide: Slide, candidates: LibImage[]): Promise<PictureIdea | null> {
  return (await pictureCheck(deck, slide, candidates)).idea;
}

/** The picture check of one slide: the idea, or none and why (shown in the editor's Check tab) */
export async function pictureCheck(deck: Deck, slide: Slide, candidates: LibImage[]): Promise<{ idea: PictureIdea | null; note: string }> {
  const none = (note: string) => ({ idea: null, note });
  const looked = candidates.map((c) => c.description).filter(Boolean).slice(0, 8).join('; ');
  if (!candidates.length) return none('No picture in the library that the lesson doesn’t use yet matched what this slide says');
  const images = candidates.map((c, n) => ({ ...c, id: `img${n + 1}` }));
  const list = images.map((i) => `${i.id}: ${i.description}${i.used ? ' (already used in the lesson)' : ''}`).join('\n');
  const user = `Lesson: ${deck.title}\nTopic: ${slide.topic ?? ''}\nWhat the professor says on it: ${slide.elements.map(spokenText).filter(Boolean).join(' ').slice(0, 1500)}\n\n` +
    `SLIDE (background ${slide.background?.color ?? '#ffffff'}): ${describe(slide)}\n\nAVAILABLE PICTURES:\n${list}`;
  let raw = JSON.parse(await chat(SYSTEM, user, true, 3000));
  if (!Array.isArray(raw?.add) || !raw.add.length) return none(`The AI found none of the matching pictures fit (it looked at: ${looked})`);
  let made = build(raw, slide, images);
  if (!made) return none(`The pictures the AI picked were look-alikes of ones already on the slide (it looked at: ${looked})`);
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
  if (covers(out.elements).length) return none('The pictures didn’t fit without covering something on the slide');   // (no suggestion rather than a broken slide)
  const why = new Map((raw.add as any[]).map((a) => [String(a?.image), String(a?.why ?? '').slice(0, 200)]));
  return { note: '', idea: {
    pictures: made.added.map((i) => ({ src: i.url, alt: i.description, why: why.get(i.id) || `It shows what the slide talks about` })),
    elements: out.elements,
  } };
}

/** What to search the library for on a slide: each thing it names (its bullets, split at "and" and commas), its title, and the slide as a whole */
export function searchPhrases(slide: Slide): string[] {
  const out: string[] = [];
  for (const e of slide.elements) {
    if (e.type !== 'text') continue;
    for (const line of e.text.split('\n')) {
      for (const bit of line.replace(/^[•\-*\s]+/, '').split(/,|\band\b|&|\//i)) {
        const t = bit.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (t.length >= 3 && t.split(' ').length <= 6) out.push(t);
      }
    }
  }
  out.push(`${slide.topic ?? ''}: ${slideBasis(slide)}`.slice(0, 600));
  return [...new Set(out.map((t) => t.toLowerCase()))].slice(0, 10);
}

/**
 * Candidate pictures for several slides at once: for each thing a slide names (and the slide as a whole), the closest library
 * pictures with no words in them. Pictures the lesson doesn't use yet come first, and each goes to the one slide it matches
 * best. A picture already used elsewhere is offered (marked used) only when nothing unused turned up for that thing: then
 * the slide may show it again. Up to 8 per slide; never one already on the slide.
 */
export async function pictureCandidates(deck: Deck, slides: Slide[], taken: Set<string> = lessonPictures(deck)): Promise<Map<string, LibImage[]>> {
  const searches = slides.flatMap((s) => searchPhrases(s).map((q) => ({ slide: s, q })));
  const found = await Promise.all(searches.map((x) => imagesFor(x.q, 4)));
  const onSlide = (s: Slide, url: string) => s.elements.some((e) => (e.type === 'image' || e.type === 'activity') && e.src === url);
  // every (slide, picture) match with how close it is (the search's score, else by its place in the results); for each thing
  // searched, an already-used picture only if no unused one showed up for it
  const matches = searches.flatMap((x, i) => {
    const ok = found[i].filter((img) => typeof img.url === 'string' && !hasWords(img.description ?? '') && !onSlide(x.slide, img.url));
    const fresh = ok.filter((img) => !taken.has(img.url));
    return (fresh.length ? fresh : ok).map((img, rank) => ({ slide: x.slide.id, img: { ...img, used: taken.has(img.url) }, score: (img.score ?? 1 - rank * 0.1) - (taken.has(img.url) ? 0.5 : 0) }));
  }).sort((a, b) => b.score - a.score);
  const out = new Map<string, LibImage[]>(slides.map((s) => [s.id, []]));
  const given = new Set<string>();
  for (const m of matches) {
    const mine = out.get(m.slide)!;
    if (mine.length >= 8 || mine.some((x) => x.url === m.img.url)) continue;
    if (!m.img.used) {
      if (given.has(m.img.url)) continue;   // (an unused picture: one slide only)
      given.add(m.img.url);
    }
    mine.push(m.img);
  }
  for (const url of given) taken.add(url);
  return out;
}
