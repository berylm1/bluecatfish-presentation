import type { Deck, Slide } from './types';
import { chat } from './ai';
import { shownWords, spokenText, topicIndexes } from './queue';
import { movesFor } from './order';

// The story check for a whole AI-made lesson (generate.ts), after the other checks and
// before any audio: are the topics in an order that tells the story (starting with
// the one that introduces the subject, ending with the one that wraps it up), and the
// slides inside each topic in an order where each builds on the last? The topics are
// written in parallel, so nothing else looks at the lesson as a whole like this.
//
// It only moves slides (a topic's slides stay together); the words are left alone,
// except spoken words that point at something now in the wrong place ("as we saw…"):
// those are cleared, so the save-time AI writes them again, before any audio.
// On save (prepare.ts) the same check gives the editor suggested moves instead (order.ts).

type Topic = { name: string; slides: Slide[] };

/** The deck's topics, in order, each with its slides. */
export function topicsOf(deck: Deck): Topic[] {
  const idx = topicIndexes(deck.slides);
  const out: Topic[] = [];
  deck.slides.forEach((s, i) => { (out[idx[i]] ??= { name: s.topic?.trim() || `Part ${idx[i] + 1}`, slides: [] }).slides.push(s); });
  return out;
}

/** What a slide is about, short: its words on screen, and the start of what's said. */
function gist(s: Slide): string {
  const shown = s.elements.map((e) => (e.type === 'activity' ? `[hands-on: ${shownWords(e).slice(0, 140)}]` : e.type === 'text' ? e.text : '')).filter(Boolean).join(' / ');
  const said = s.elements.map(spokenText).filter(Boolean).join(' ');
  return `${shown.slice(0, 220)} | says: ${said.slice(0, 260)}`;
}

/** A list that is exactly 0..n-1 in some order (else null). */
function permutation(v: unknown, n: number): number[] | null {
  if (!Array.isArray(v) || v.length !== n) return null;
  const nums = v.map((x) => Number(x) - 1);
  return nums.every((x) => Number.isInteger(x) && x >= 0 && x < n) && new Set(nums).size === n ? nums : null;
}

/**
 * The order the story wants, as slide ids (a topic's slides stay together), and the slides whose
 * spoken words wouldn't fit it; null when the order is already right (or the answer made no sense).
 */
export async function askStoryOrder(deck: Deck, lessonTitle: string): Promise<{ order: string[]; reword: string[]; why?: string } | null> {
  const topics = topicsOf(deck);
  if (deck.slides.length < 2) return null;
  const outline = topics.map((t, ti) =>
    `TOPIC ${ti + 1}: ${t.name}\n${t.slides.map((s, si) => `  ${ti + 1}.${si + 1} ${gist(s)}`).join('\n')}`).join('\n\n');
  const out = JSON.parse(await chat(
    'You check the ORDER of a lesson for 10-14 year olds, so it tells a story from start to finish. ' +
      'The first topic must introduce the subject (what it is, meeting it); the last must wrap it up (why it matters, the big picture, what happens next or what we can do). ' +
      'In between, each topic should lead into the next (cause before effect, what something is before what it does). ' +
      'Inside a topic, each slide should build on the one before; a hands-on slide comes after the slides that teach what it uses. ' +
      'Only change the order where it clearly helps the story; if it is already right, give it back unchanged. ' +
      'Also list the slides whose spoken words would no longer make sense in the new order (they mention something as already seen, or say "next we\'ll…" about something that moved). ' +
      'Reply as JSON: {"topics":[topic numbers in the right order], "slides":{"<topic number>":[slide numbers within that topic, in order]}, ' +
      '"reword":["<topic>.<slide>" as numbered now], "why":"one sentence"}',
    `Lesson: ${lessonTitle}\n\n${outline}`,
    true,
    1500,
  ));
  const topicOrder = permutation(out?.topics, topics.length) ?? topics.map((_, i) => i);
  const order: string[] = [];
  for (const ti of topicOrder) {
    const t = topics[ti];
    const inner = permutation(out?.slides?.[String(ti + 1)], t.slides.length) ?? t.slides.map((_, i) => i);
    order.push(...inner.map((k) => t.slides[k].id));
  }
  if (order.every((id, i) => deck.slides[i].id === id)) return null;
  const reword: string[] = [];
  for (const ref of Array.isArray(out?.reword) ? out.reword : []) {
    const m = /^(\d+)\.(\d+)$/.exec(String(ref).trim());
    const s = m ? topics[Number(m[1]) - 1]?.slides[Number(m[2]) - 1] : undefined;
    if (s && !reword.includes(s.id)) reword.push(s.id);
  }
  return { order, reword, why: typeof out?.why === 'string' ? out.why.slice(0, 240) : undefined };
}

/**
 * A whole AI-made lesson (generate.ts): put in story order right away (in place). Returns what moved,
 * for the generation notes (empty: already in order). The editor gets the same check as suggestions (prepare.ts).
 */
export async function fixStoryOrder(deck: Deck, lessonTitle: string): Promise<string[]> {
  const want = await askStoryOrder(deck, lessonTitle);
  if (!want) return [];
  const notes = movesFor(deck.slides, want.order).map((m) => m.label);
  if (want.why) notes.push(`(${want.why})`);
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  deck.slides = want.order.map((id) => byId.get(id)!);
  // Words that pointed at the old order: written again by the save-time AI (before any audio).
  // (Every word here is the AI's: it's marked as such only after this)
  for (const id of want.reword) {
    for (const e of byId.get(id)?.elements ?? []) if (e.say && e.type !== 'activity') { delete e.say; delete e.plain; }
  }
  if (want.reword.length) notes.push(`${want.reword.length === 1 ? "1 slide's" : `${want.reword.length} slides'`} spoken words will be written again to fit the new order`);
  return notes.map((n) => `Story order: ${n}`);
}
