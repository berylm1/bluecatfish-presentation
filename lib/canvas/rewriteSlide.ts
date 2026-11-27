import type { Slide, SlideElement } from './types';
import { STYLE, chat, knowledge } from './ai';
import { autoFix, formatGuide, imagesFor, markAi, problems, toSlide, type LibImage } from './generate';
import { sanitizeDeck } from './sanitize';
import { shownWords } from './queue';

/*
 * "Rewrite this slide": the editor says what to change ("make it simpler", "add an example", "turn the bullets into
 * a diagram") and the AI writes the slide again, in the lesson's own slide format. What wasn't asked for stays.
 * The editor swaps it in as one undo step; saving then records its voice and drafts its helper, like any edit.
 */

// What the model doesn't need to see (and must not copy back): ids, recorded audio, what the save-time AI filled in
const NOISE = new Set(['id', 'z', 'audioUrl', 'plainAudioUrl', 'audioFor', 'plainAudioFor', 'sayByAI', 'sayFrom', 'plainByAI', 'plainFrom',
  'pointers', 'pointersByAI', 'pointersFrom', 'src', 'credit', 'creditUrl', 'caption', 'captionByAI', 'captionFrom', 'captionOff', 'answerCheck', 'keyByPerson']);

function asRaw(slide: Slide, images: LibImage[]): unknown {
  const idOf = new Map(images.map((i) => [i.url, i.id]));
  return {
    background: slide.background?.color,
    elements: slide.elements.map((e) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) if (!NOISE.has(k) && v !== undefined) out[k] = v;
      if (e.type === 'image' || (e.type === 'activity' && e.src)) { out.image = idOf.get(e.src ?? ''); if (e.type === 'image') delete out.alt; }
      return out;
    }),
  };
}

const SYSTEM = `${STYLE}
You rewrite ONE slide of a lesson for {{ages}} year olds, as its teacher asks. Do what is asked, and keep everything it does not
touch (the facts, the pictures, the layout) unless the request needs it to change. The slide still teaches the same thing.
Facts stay true: use the slide's own facts and the knowledge base excerpts, never invent numbers.

${formatGuide({ visuals: true, activities: true })}

Reply as JSON: {"slide":{"background":"#hex","elements":[...]},"note":"one short sentence: what you changed"}`;

export async function rewriteSlide(slide: Slide, instruction: string, lessonTitle: string): Promise<{ slide: Slide; note: string }> {
  const words = slide.elements.map((e) => [shownWords(e), e.say].filter(Boolean).join(': ')).filter(Boolean).join('\n');
  const [facts, found] = await Promise.all([
    knowledge(`${slide.topic ?? ''} ${words}`.slice(0, 1000), 5),
    imagesFor(`${slide.topic ?? ''} ${words}`.slice(0, 500), 6).catch(() => [] as LibImage[]),
  ]);
  // The pictures already on the slide come first, under ids of their own (so "keep the picture" can be done)
  const mine: LibImage[] = [];
  for (const e of slide.elements as SlideElement[]) {
    const src = e.type === 'image' ? e.src : e.type === 'activity' ? e.src : undefined;
    if (!src || mine.some((m) => m.url === src)) continue;
    mine.push({ id: `cur${mine.length + 1}`, url: src, description: ('alt' in e && e.alt) || 'the picture on the slide now', credit: e.type === 'image' ? e.credit : undefined, creditUrl: e.type === 'image' ? e.creditUrl : undefined });
  }
  const images = [...mine, ...found.filter((f) => !mine.some((m) => m.url === f.url))];
  const user = `Lesson: ${lessonTitle}\nTopic: ${slide.topic ?? '(not set)'}\n\nTHE TEACHER ASKS: ${instruction}\n\n` +
    `THE SLIDE NOW:\n${JSON.stringify(asRaw(slide, images))}\n\n` +
    `AVAILABLE IMAGES:\n${images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none: text and drawn visuals only)'}\n\n` +
    `Knowledge base excerpts:\n${facts || '(none found)'}`;
  let fixes = '';
  let best: { slide: Slide; note: string; bad: number } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = JSON.parse(await chat(SYSTEM, fixes ? `${user}\n\nYOUR LAST VERSION HAD PROBLEMS. Fix them and return the whole slide again:\n${fixes}` : user, true, 6000));
    const raw = out?.slide;
    if (!Array.isArray(raw?.elements) || !raw.elements.length) { fixes = 'it had no elements: follow the format exactly'; continue; }
    const made = sanitizeDeck({ slides: [toSlide(raw, slide.topic ?? '', images, slide.id)] }, 'rewrite', 'ai').slides[0];
    if (!made?.elements.length) { fixes = 'none of its elements were usable: follow the format exactly'; continue; }
    const bad = problems(raw, made, images);
    if (!best || bad.length < best.bad) best = { slide: made, note: String(out?.note ?? '').slice(0, 200), bad: bad.length };
    if (!bad.length) break;
    fixes = bad.join('\n');
  }
  if (!best) throw new Error('The AI could not rewrite this slide');
  const done = best.slide;
  autoFix(done);
  markAi(done);
  // (its place in the lesson stays: the id, the topic and what the teacher set on the slide itself)
  return { slide: { ...slide, background: done.background ?? slide.background, elements: done.elements, helper: slide.helper?.byAI || !slide.helper ? undefined : slide.helper }, note: best.note };
}
