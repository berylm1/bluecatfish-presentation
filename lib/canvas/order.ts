import type { Deck, OrderMove, Slide } from './types';
import { fingerprint } from './aiFields';
import { topicIndexes } from './queue';

// Story-order suggestions as moves a person can make one at a time (the editor's Check
// tab), worked out from the order the check wants. Shared by the server (which makes
// them) and the editor (which shows and applies them).

/** A slide's name for a move's label: its title (or first words on screen). */
export function slideName(s: Slide | undefined): string {
  if (!s) return '?';
  const texts = s.elements.filter((e) => e.type === 'text') as { text: string; style: string }[];
  const t = (texts.find((e) => e.style === 'title') ?? texts[0])?.text.trim().split('\n')[0] ?? '';
  return t ? (t.length > 50 ? `${t.slice(0, 48)}…` : t) : 'untitled slide';
}

/** The skipped-move key */
export const moveKey = (m: OrderMove) => fingerprint(`${m.ids.join(',')}>${m.after ?? '^'}`);

/** The topics as blocks of slide ids, in order. */
function blocks(slides: Slide[]): { name: string; ids: string[] }[] {
  const idx = topicIndexes(slides);
  const out: { name: string; ids: string[] }[] = [];
  slides.forEach((s, i) => { (out[idx[i]] ??= { name: s.topic?.trim() || `Part ${idx[i] + 1}`, ids: [] }).ids.push(s.id); });
  return out;
}

/**
 * The moves that turn the deck's order into `target` (slide ids): topics first ("move the topic
 * … to the start / after …"), then slides inside each topic. Made one after another, they give
 * `target`; each also makes sense alone.
 */
export function movesFor(slides: Slide[], target: string[], reword: string[] = []): OrderMove[] {
  const byId = new Map(slides.map((s) => [s.id, s]));
  const moves: OrderMove[] = [];
  let work = slides.map((s) => s.id);
  const apply = (m: OrderMove) => { work = moveIds(work, m) ?? work; moves.push(m); };

  // topics: in the order they first appear in the target
  const cur = blocks(slides);
  const topicOf = new Map(cur.flatMap((b, k) => b.ids.map((id) => [id, k] as const)));
  const wantTopics = [...new Set(target.map((id) => topicOf.get(id)!))];
  for (let i = 0; i < wantTopics.length; i++) {
    const nowTopics = [...new Set(work.map((id) => topicOf.get(id)!))];
    if (nowTopics[i] === wantTopics[i]) continue;
    const ids = work.filter((id) => topicOf.get(id) === wantTopics[i]);
    const prev = i === 0 ? null : work.filter((id) => topicOf.get(id) === nowTopics[i - 1]).at(-1) ?? null;
    apply({ ids, after: prev, topic: true, label: `Move the topic “${cur[wantTopics[i]].name}” ${prev ? `after “${cur[topicOf.get(prev)!].name}”` : 'to the start'}` });
  }
  // slides inside each topic
  for (const k of wantTopics) {
    const want = target.filter((id) => topicOf.get(id) === k);
    for (let j = 0; j < want.length; j++) {
      const now = work.filter((id) => topicOf.get(id) === k);
      if (now[j] === want[j]) continue;
      const first = work.indexOf(now[0]);
      const prev = j === 0 ? (first > 0 ? work[first - 1] : null) : want[j - 1];
      apply({ ids: [want[j]], after: prev, label: j === 0
        ? `Move “${slideName(byId.get(want[j]))}” to the start of “${cur[k].name}”`
        : `Move “${slideName(byId.get(want[j]))}” after “${slideName(byId.get(want[j - 1]))}”` });
    }
  }
  // words that won't fit: with the move that moves them (else the first move)
  for (const id of reword) {
    if (!byId.has(id)) continue;
    const m = moves.find((x) => x.ids.includes(id)) ?? moves[0];
    if (m) (m.reword ??= []).push(id);
  }
  return moves;
}

/** The ids in the order after the move, or null when it can't be made (a slide is gone). */
function moveIds(order: string[], m: OrderMove): string[] | null {
  if (!m.ids.length || m.ids.some((id) => !order.includes(id)) || (m.after && (!order.includes(m.after) || m.ids.includes(m.after)))) return null;
  const rest = order.filter((id) => !m.ids.includes(id));
  const at = m.after ? rest.indexOf(m.after) + 1 : 0;
  return [...rest.slice(0, at), ...m.ids, ...rest.slice(at)];
}

/** Already where the move would put them (made, or not needed any more). */
export function moveDone(slides: Slide[], m: OrderMove): boolean {
  const order = slides.map((s) => s.id);
  const at = order.indexOf(m.ids[0]);
  if (at < 0) return true;   // gone: nothing to do
  return m.ids.every((id, k) => order[at + k] === id) && (m.after ? order[at - 1] === m.after : at === 0);
}

/** Moves the slides (in place). False if it can't be made. */
export function applyMove(deck: Deck, m: OrderMove): boolean {
  const order = moveIds(deck.slides.map((s) => s.id), m);
  if (!order) return false;
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  deck.slides = order.map((id) => byId.get(id)!);
  return true;
}

/**
 * After a move: AI-written words on the slides it names are cleared, so the save-time AI writes
 * them again for the new order. Returns the slides whose words a person wrote (left as they are, to look at).
 */
export function clearRewordedWords(deck: Deck, ids: string[] = []): Slide[] {
  const theirs: Slide[] = [];
  for (const id of ids) {
    const s = deck.slides.find((x) => x.id === id);
    if (!s) continue;
    let mine = false;
    for (const e of s.elements) {
      if (!e.say || e.type === 'activity') continue;
      if (e.sayByAI) { delete e.say; delete e.plain; delete e.sayByAI; delete e.plainByAI; } else mine = true;
    }
    if (mine) theirs.push(s);
  }
  return theirs;
}

/**
 * The suggested moves still to look at: not skipped, still possible, and not made already. (A move
 * can look made only because an earlier one isn't yet: it stays while an earlier one is still open.)
 */
export function openMoves(deck: Deck): OrderMove[] {
  const skipped = new Set(deck.checks?.orderSkips ?? []);
  const have = new Set(deck.slides.map((s) => s.id));
  const out: OrderMove[] = [];
  for (const m of deck.checks?.order?.moves ?? []) {
    if (skipped.has(moveKey(m)) || !m.ids.every((id) => have.has(id)) || (m.after && !have.has(m.after))) continue;
    if (out.length || !moveDone(deck.slides, m)) out.push(m);
  }
  return out;
}
