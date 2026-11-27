/*
 * No long dashes in what the lesson says or shows: the em dash (—) and the spaced en dash ( – ) read as "written by
 * an AI" and are harder for children to follow than a comma or a full stop. The AI is told not to write them
 * (NO_LONG_DASHES, added to every instruction: lib/canvas/ai.ts), and this takes out any that slip through.
 * A hyphen inside a word ("hands-on") and a range of numbers ("1970s–80s", "10–14") are left as they are.
 */

/** Told to the AI with every instruction that writes words */
export const NO_LONG_DASHES =
  'Never write a long dash (— or –) between words or parts of a sentence: use a comma, a colon or a full stop, or start a new sentence. ' +
  '(A hyphen inside a word, like "hands-on", is fine.)';

// an em dash anywhere, or an en dash with a space on at least one side (not one between numbers: a range)
const LONG_DASH = /\s*—+\s*|\s+–\s*|\s*–\s+/g;

/** How many long dashes a text has */
export const countLongDashes = (text: string | undefined | null): number => (text ? text.match(LONG_DASH)?.length ?? 0 : 0);

/**
 * The text with each long dash turned into a comma (or nothing, at an edge or next to other punctuation).
 * keep: text the dashes may have been copied from (what the AI was given): a dash that's in it, with the same words
 * around it, is left alone, so a name or an answer quoted back still matches the original.
 */
export function noLongDashes(text: string, keep = ''): string {
  if (!text || !/[—–]/.test(text)) return text;
  return text.replace(LONG_DASH, (dash, at: number, all: string) => {
    if (keep && keep.includes(all.slice(Math.max(0, at - 6), at + dash.length + 6))) return dash;
    const before = all.slice(0, at), after = all.slice(at + dash.length);
    if (!before.trim() || !after.trim()) return '';                       // at the start or the end
    if (/[,;:.!?(]$/.test(before) || /^[,;:.!?)]/.test(after)) return ' ';  // next to punctuation already
    if (/["“]$/.test(before)) return '';
    return ', ';
  });
}

/* ------------------------------------------------- a whole lesson's words */

// Not words: addresses, ids, fingerprints, settings
const NOT_WORDS = /^(id|src|image|url|audioUrl|plainAudioUrl|creditUrl|credit|color|style|kind|type|fit|align|asker|anchor|from|at|by|unit|savedAs|source|lessonId|editRev|updatedAt|updatedBy)$|From$|For$/;

function walk(node: unknown, fn: (text: string) => string): unknown {
  if (typeof node === 'string') return fn(node);
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = walk(node[i], fn); return node; }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) { if (!NOT_WORDS.test(k) && k !== 'answerCheck' && k !== 'pointers') o[k] = walk(o[k], fn); }
  }
  return node;
}
type Lesson = { slides?: unknown; recap?: string; bank?: { questions?: unknown }; quiz?: { questions?: unknown } };
const parts = (d: Lesson): unknown[] => [d.slides, d.bank?.questions, d.quiz?.questions];

/** How many long dashes a lesson has: on its slides (shown and said), its helpers, class questions, quiz and recap */
export function countDeckLongDashes(deck: Lesson): number {
  let n = countLongDashes(deck.recap);
  for (const p of parts(deck)) walk(structuredClone(p ?? null), (t) => { n += countLongDashes(t); return t; });
  return n;
}

/** Takes them out, in place (the editor's "Remove long dashes"); returns how many went */
export function removeDeckLongDashes(deck: Lesson): number {
  const before = countDeckLongDashes(deck);
  if (typeof deck.recap === 'string') deck.recap = noLongDashes(deck.recap);
  for (const p of parts(deck)) walk(p, (t) => noLongDashes(t));
  return before - countDeckLongDashes(deck);
}
