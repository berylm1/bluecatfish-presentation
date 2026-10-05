import type { ActivityElement, Slide } from './types';
import { STYLE, chat, knowledge } from './ai';
import { formatGuide, imagesFor } from './generate';
import { sanitizeDeck } from './sanitize';
import { activityReady, shownWords } from './queue';
import { fingerprint, sayBasis } from './aiFields';

/*
 * The AI drafts a hands-on slide for the slide being edited: a short title
 * and one hands-on box that uses what that slide teaches (sort the animals,
 * put the steps in order, guess-and-flip, explore a picture, move a slider).
 * The editor inserts it after the slide; the person can change anything.
 */

const KINDS = ['sort', 'order', 'cards', 'hotspots', 'slider'] as const;
export type ActivityKind = (typeof KINDS)[number];
export const isActivityKind = (v: unknown): v is ActivityKind => KINDS.includes(v as ActivityKind);

const SYSTEM = `${STYLE}
You turn one lesson slide into a HANDS-ON slide for 10-14 year olds: the learner does something with exactly what that slide teaches,
so it sticks. Pick the kind that fits the facts best (unless one is asked for): things that belong to groups → sort; a process or
story in order → order; surprising numbers or facts to guess → cards; parts of one picture → hotspots; something that changes with
an amount (age, years, temperature, numbers) → slider. Only facts from the slide and the knowledge base; never invent numbers.

The slide: {"background":"#hex","elements":[ a title text box ("silent": true, style "title", under 6 words, y about 4, h about 14),
and ONE hands-on box below it (x about 6, y about 22, w about 88, h about 72) ]}.

${formatGuide({ activities: true })}

Reply as JSON: {"slide": {...}}`;

/** The hands-on slide for `slide` (kind: the one asked for, or the AI's pick). Throws if nothing usable came back. */
export async function draftActivity(slide: Slide, lessonTitle: string, kind?: ActivityKind): Promise<Slide> {
  const words = slide.elements.map((e) => [shownWords(e), e.say].filter(Boolean).join(' — ')).filter(Boolean).join('\n');
  const [facts, images] = await Promise.all([
    knowledge(`${slide.topic ?? ''} ${words}`.slice(0, 1000), 5),
    imagesFor(`${slide.topic ?? ''} ${words}`.slice(0, 500), 8),
  ]);
  const user = `Lesson: ${lessonTitle}\nTopic: ${slide.topic ?? '(not set)'}\n${kind ? `Use the kind: ${kind}\n` : ''}` +
    `THE SLIDE TEACHES:\n${words || '(nothing written yet)'}\n\nAVAILABLE IMAGES:\n${images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none)'}\n\n` +
    `Knowledge base excerpts:\n${facts || '(none found)'}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = JSON.parse(await chat(SYSTEM, attempt ? `${user}\n\nYour last answer had no usable hands-on box: follow the format exactly.` : user, true, 3000))?.slide;
    const lib = new Map(images.map((i) => [i.id, i]));
    const elements = (Array.isArray(raw?.elements) ? raw.elements : []).slice(0, 3).map((e: any) => {
      if (e?.type !== 'activity') return e;
      const img = e.image ? lib.get(String(e.image)) : undefined;
      return { ...e, src: img?.url, alt: e.alt ?? img?.description };
    });
    const clean = sanitizeDeck({ slides: [{ id: 'hands-on', topic: slide.topic, background: { color: raw?.background }, elements }] }, 'hands-on', 'ai').slides[0];
    const box = clean.elements.find((e): e is ActivityElement => e.type === 'activity');
    if (!box || !activityReady(box)) continue;
    // The title stays silent; the box speaks its instructions (marked as AI-written, so a save can rewrite them if the box changes)
    for (const e of clean.elements) if (e !== box && e.type === 'text') e.silent = true;
    if (box.say) Object.assign(box, { silent: undefined, sayByAI: true, sayFrom: fingerprint(sayBasis(box)) });
    return { ...clean, elements: clean.elements.filter((e) => e === box || e.type === 'text') };
  }
  throw new Error('The AI could not make a hands-on box for this slide');
}
