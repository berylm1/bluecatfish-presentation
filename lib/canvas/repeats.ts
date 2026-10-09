import type { Deck, SlideElement } from './types';
import { spokenText } from './queue';
import { chat } from './ai';

// Repeated content across a lesson. Each topic of an AI deck is written from
// its own knowledge-base search, so neighbouring topics find the same facts
// and say them again; hand-made decks repeat too. The AI reads the whole deck
// and suggests a rewrite for each later repeat (the first time stays).
//   - removeRepeats: right after an AI deck is written (generate.ts), applied
//     at once, before any audio is made (so no clip is paid for and then cut);
//     it reads again, up to REPEAT_PASSES times, until a read finds nothing
//   - the editor's "Check for repeats" (/api/editor/repeats): suggestions a
//     person accepts or skips one by one

const REPEAT_PASSES = 3;
const INPUT_LIMIT = 60_000;    // characters of lesson the AI reads in one go
const REPEAT_PASS_MS = 60_000;   // about how long one read can take

export interface RepeatSuggestion {
  slideIndex: number;
  slideId: string;
  elId: string;
  /** New spoken words (undefined = unchanged) */
  say?: string;
  /** New shown text, text boxes only (undefined = unchanged) */
  text?: string;
  /** What it repeats ("repeats slide 3: they weigh over 100 pounds") */
  why: string;
  /** What's there now, to show next to the suggestion */
  beforeSay: string;
  beforeText?: string;
}

/** The elements the check reads: everything with words, except hands-on boxes. */
function candidates(deck: Deck): { key: string; slideIndex: number; el: SlideElement }[] {
  return deck.slides.flatMap((s, si) => s.elements.flatMap((el, ei) => {
    // A hands-on box's words are instructions ("Your turn: drag…"), alike on purpose: never a repeat
    if (el.type === 'activity') return [];
    if (!spokenText(el) && !(el.type === 'text' && el.text.trim())) return [];
    // Keys by position: element ids are only unique within a slide
    return [{ key: `${si + 1}.${ei + 1}`, slideIndex: si, el }];
  }));
}

/** What the AI reads: one line per element, as many whole lines as fit (and the last slide they reach). */
function repeatInput(deck: Deck) {
  const items = candidates(deck);
  const lines: string[] = [];
  let size = 0, lastSlide = 0, partial = false;
  for (const { key, slideIndex, el } of items) {
    const shown = el.type === 'text' ? el.text : '';
    const said = spokenText(el);
    const line = `[${key}] (slide ${slideIndex + 1}, ${deck.slides[slideIndex].topic ?? ''})${shown ? ` SHOWN: ${shown}` : ''}${said && said !== shown.trim() ? ` SAID: ${said}` : ''}`;
    if (size + line.length > INPUT_LIMIT) { partial = true; break; }
    lines.push(line);
    size += line.length + 1;
    lastSlide = slideIndex;
  }
  return { items, lines, partial: partial ? lastSlide + 1 : undefined };
}

/** How far a very long lesson is read in one check (slide number), or undefined when it's read in full. */
export const repeatCoverage = (deck: Deck) => repeatInput(deck).partial;

/** The AI's suggestions for the deck as it is (nothing is changed). */
export async function findRepeats(deck: Deck): Promise<RepeatSuggestion[]> {
  const { items, lines } = repeatInput(deck);
  if (lines.length < 2) return [];
  const out = await chat(
    'You edit a lesson for 10-14 year olds to remove REPEATED content. Below is every element of the lesson in order: what it SHOWS and what the professor SAYS. ' +
      'Find places that repeat a fact, example or explanation already given EARLIER in the lesson (same idea in other words counts; a short reminder that links back, ' +
      'like "Remember how big they get?", is fine). The FIRST time something is said stays. For each later repeat, rewrite that element: ' +
      '"say" = the spoken words with the repeated part removed or replaced by something new from the same element, still 2+ sentences that read naturally ' +
      '(or a one-sentence link back if nothing else is left); "text" = the shown text, only if the SHOWN text itself repeats an earlier slide, kept as short as it was. ' +
      'Don\'t change anything that isn\'t a repeat, and don\'t add facts that aren\'t already in the lesson. ' +
      'Reply as JSON: {"fixes":[{"id":"3.2","say":"...","text":"...","why":"repeats slide 1: ..."}]} (id = the [number] of the element; an empty list when there are no repeats).',
    `Lesson: ${deck.title}\n\n${lines.join('\n')}`,
    true,
    8000,
  );
  const fixes = JSON.parse(out).fixes;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const suggestions: RepeatSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of Array.isArray(fixes) ? fixes : []) {
    const item = byKey.get(String(f?.id));
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    const { el, slideIndex } = item;
    const beforeSay = spokenText(el);
    const say = typeof f.say === 'string' && f.say.trim() && f.say.trim() !== beforeSay ? f.say.trim().slice(0, 4000) : undefined;
    // shown text stays about as long, so it still fits its box
    const text = el.type === 'text' && typeof f.text === 'string' && f.text.trim() && f.text.trim() !== el.text.trim()
      && f.text.trim().length <= el.text.length * 1.2 + 10 ? f.text.trim().slice(0, 2000) : undefined;
    if (!say && !text) continue;
    suggestions.push({
      slideIndex, slideId: deck.slides[slideIndex].id, elId: el.id, say, text,
      why: typeof f.why === 'string' ? f.why.slice(0, 300) : 'repeats an earlier slide',
      beforeSay, beforeText: el.type === 'text' ? el.text : undefined,
    });
  }
  return suggestions;
}

/** Applies one suggestion to a deck (in place). false when the element is gone or has changed since. */
export function applyRepeatFix(deck: Deck, s: RepeatSuggestion, by: 'ai' | 'person'): boolean {
  const el = deck.slides.find((x) => x.id === s.slideId)?.elements.find((e) => e.id === s.elId);
  if (!el || spokenText(el) !== s.beforeSay || (el.type === 'text' && s.beforeText !== undefined && el.text !== s.beforeText)) return false;
  if (s.say) {
    el.say = s.say;
    // A person accepted it: their words now (the save-time AI won't rewrite them)
    el.sayByAI = by === 'ai' ? el.sayByAI : undefined;
    // the plain version was made from the old words: the AI writes a new one (unless a person wrote it)
    if (el.plainByAI || by === 'ai') { el.plain = undefined; el.plainByAI = undefined; }
  }
  if (s.text && el.type === 'text') el.text = s.text;
  return true;
}

/** Removes repeated content across the deck (in place); notes say what changed. */
export async function removeRepeats(deck: Deck, notes: string[], deadline = Infinity): Promise<void> {
  for (let pass = 1; pass <= REPEAT_PASSES; pass++) {
    // Another read wouldn't finish in time (the route has 5 minutes): what's fixed so far stays
    if (Date.now() + REPEAT_PASS_MS > deadline) { notes.push(`Repeat check stopped after ${pass - 1} pass(es): out of time`); return; }
    let found: RepeatSuggestion[];
    try {
      found = await findRepeats(deck);
    } catch (e) {
      notes.push(`Checking for repeats failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const changed = found.filter((s) => applyRepeatFix(deck, s, 'ai')).length;
    if (changed) notes.push(`Repeat check ${pass}: rewrote ${changed} repeated part(s)`);
    if (!changed) return;   // nothing repeated any more
  }
}
