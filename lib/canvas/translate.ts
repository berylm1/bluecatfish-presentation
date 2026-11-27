import type { Deck, Slide, SlideElement } from './types';
import { chat } from './ai';
import { fingerprint, sayBasis, slideBasis } from './aiFields';

/*
 * A lesson in another language: every word a learner sees or hears is translated, the layout and the pictures stay.
 * Works on plain strings (found under the keys that hold words), so every kind of box is covered, and the same words
 * always come out the same (a graph's line named in two places still matches).
 */

const WORD_KEYS = new Set(['text', 'say', 'plain', 'alt', 'caption', 'prompt', 'label', 'detail', 'back', 'title', 'topic', 'groups', 'columns', 'line', 'recap', 'word']);
const worth = (s: string) => /\p{L}{2,}/u.test(s) && !/^https?:\/\//.test(s) && !/^#[0-9a-f]{3,8}$/i.test(s);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, visit: (s: string) => string | void, key = ''): any {
  if (typeof node === 'string') {
    if (!WORD_KEYS.has(key) || !worth(node)) return node;
    return visit(node) ?? node;
  }
  if (Array.isArray(node)) return node.map((v) => walk(v, visit, key));
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) node[k] = walk(node[k], visit, k);
  }
  return node;
}

/** The strings, translated: the same count, the same order (throws if the model's answer doesn't line up) */
async function translateList(list: string[], language: string): Promise<string[]> {
  const out = await chat(
    `You translate the words of a lesson for {{ages}} year olds into ${language}. Natural, simple ${language}, as a good teacher there would say it. ` +
      'Keep numbers, units, math (3/4, x^2), bullet marks, line breaks and names of people and places as they are. Never add or drop a string. ' +
      `Reply as JSON: {"t":["…"]} with exactly ${list.length} strings, in the same order as the input.`,
    JSON.stringify({ t: list }),
    true,
    Math.min(12000, 600 + list.join('').length),
  );
  const t = JSON.parse(out)?.t;
  if (!Array.isArray(t) || t.length !== list.length) throw new Error('count');
  return t.map((x, i) => (typeof x === 'string' && x.trim() ? x : list[i]));
}

/** Every string → its translation (in chunks, side by side; a chunk that fails twice is tried string by string) */
export async function translateAll(strings: string[], language: string): Promise<Map<string, string>> {
  const unique = [...new Set(strings)];
  const chunks: string[][] = [];
  let cur: string[] = [], size = 0;
  for (const s of unique) {
    if (cur.length >= 30 || size + s.length > 5000) { chunks.push(cur); cur = []; size = 0; }
    cur.push(s); size += s.length;
  }
  if (cur.length) chunks.push(cur);
  const map = new Map<string, string>();
  await Promise.all(chunks.map(async (c) => {
    let t: string[] | null = null;
    for (let attempt = 0; attempt < 2 && !t; attempt++) t = await translateList(c, language).catch(() => null);
    if (!t) t = await Promise.all(c.map((s) => translateList([s], language).then((r) => r[0]).catch(() => s)));
    c.forEach((s, i) => map.set(s, t![i]));
  }));
  return map;
}

/** These slides, in `language` (changed in place). What the save-time AI wrote stays marked as its own, for these words. */
export async function translateSlides(slides: Slide[], language: string): Promise<void> {
  // (laser marks the AI placed go by the spoken words: they're placed again for the new ones when the lesson is saved)
  const each = (s: Slide): SlideElement[] => [...s.elements, ...(s.helper?.elements ?? [])];
  for (const s of slides) for (const e of each(s)) if (e.pointersByAI) { e.pointers = undefined; e.pointersByAI = undefined; e.pointersFrom = undefined; }
  const found: string[] = [];
  walk(slides, (s) => { found.push(s); });
  const map = await translateAll(found, language);
  walk(slides, (s) => map.get(s));
  for (const s of slides) {
    for (const e of each(s)) {
      if (e.sayByAI && e.say) e.sayFrom = fingerprint(sayBasis(e));
      if (e.plainByAI && e.say) e.plainFrom = fingerprint(e.say);
      e.audioUrl = undefined; e.plainAudioUrl = undefined; e.audioFor = undefined; e.plainAudioFor = undefined;
    }
    if (s.topicByAI) s.topicFrom = fingerprint(slideBasis(s));
    if (s.intro && !s.intro.off) s.intro = undefined;   // (the topic's introduction: written again, in the new language)
  }
}

/** The deck's own words (title, recap, what its profile says to learners), in `language`; its quiz and class questions are written again on save */
export async function translateDeckWords(deck: Deck, language: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (deck.profile ?? {}) as any;
  const list = [deck.title, deck.recap, p.title, p.pitch, p.about, ...(p.goals ?? []), ...(p.familyThings ?? []), p.familyIntro, p.teacher?.signOff]
    .filter((s): s is string => typeof s === 'string' && worth(s));
  const map = await translateAll(list, language);
  const t = <T,>(v: T): T => (typeof v === 'string' ? ((map.get(v) ?? v) as T) : v);
  deck.title = t(deck.title);
  if (deck.recap) deck.recap = t(deck.recap);
  if (deck.profile) {
    for (const k of ['title', 'pitch', 'about', 'familyIntro']) if (typeof p[k] === 'string') p[k] = t(p[k]);
    if (Array.isArray(p.goals)) p.goals = p.goals.map(t);
    if (Array.isArray(p.familyThings)) p.familyThings = p.familyThings.map(t);
    if (p.teacher?.signOff) p.teacher = { ...p.teacher, signOff: t(p.teacher.signOff) };
    p.language = language;
  }
  deck.quiz = undefined;
  if (!deck.bank?.off) deck.bank = undefined;
}
