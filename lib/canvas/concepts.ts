import type { Concept, Deck, DeckConcepts } from './types';

/*
 * The concept map (Deck.concepts): the ideas the lesson's slides teach, the slide that teaches each, and the ideas
 * each one builds on. Small and kept in the lesson, like the question bank: no graph database.
 *
 * What goes by it:
 *   - the classmates: a question is asked only once its idea's slide has played (app/presentation/page.tsx)
 *   - the professor's answers: told which ideas have been taught so far, and what the one in question builds on
 *   - the results page: quiz scores per idea (the study's quiz questions are tagged too)
 * The pure helpers are here (the browser uses them); drafting it with the AI is in conceptsDraft.ts (server only).
 */

/** The map the lesson goes by: null when there is none, it's switched off, or it has no ideas on this lesson's slides */
export function conceptMap(deck: Deck): DeckConcepts | null {
  const c = deck.concepts;
  if (!c || c.off || !Array.isArray(c.ideas) || !c.ideas.length) return null;
  const ids = new Set(deck.slides.map((s) => s.id));
  if (!c.ideas.some((i) => ids.has(i.slide))) return null;
  // (whole, whatever was stored: a map saved without its question tags, or an idea without its links, must never stop a lesson)
  return { ...c, ideas: c.ideas.map((i) => (Array.isArray(i.needs) ? i : { ...i, needs: [] })), questions: c.questions ?? {} };
}

/** Each idea's slide number (0-based); an idea whose slide is gone isn't in it */
export function conceptSlides(deck: Deck, concepts: DeckConcepts): Map<string, number> {
  const at = new Map(deck.slides.map((s, i) => [s.id, i]));
  const out = new Map<string, number>();
  for (const c of concepts.ideas) { const i = at.get(c.slide); if (i !== undefined) out.set(c.id, i); }
  return out;
}

/** Each tagged bank question's slide number: the slide of its idea */
export function questionSlides(deck: Deck, concepts: DeckConcepts): Map<string, number> {
  const slides = conceptSlides(deck, concepts);
  const out = new Map<string, number>();
  for (const [q, c] of Object.entries(concepts.questions ?? {})) { const i = slides.get(c); if (i !== undefined) out.set(q, i); }
  return out;
}

/** Everything an idea builds on, nearest first (its needs, then theirs); a loop in the map doesn't hang it */
export function builtOn(concepts: DeckConcepts, id: string): Concept[] {
  const by = new Map(concepts.ideas.map((c) => [c.id, c]));
  const seen = new Set([id]);
  const out: Concept[] = [];
  let level = by.get(id)?.needs ?? [];
  while (level.length) {
    const next: string[] = [];
    for (const n of level) {
      const c = by.get(n);
      if (!c || seen.has(n)) continue;
      seen.add(n);
      out.push(c);
      next.push(...c.needs);
    }
    level = next;
  }
  return out;
}

/**
 * For the professor, as the learner is on slide `i`: the ideas taught so far, the ones this slide teaches with what
 * they build on, and the ones still to come (not to be explained ahead of the lesson). '' with no map.
 */
export function conceptsForTutor(deck: Deck, i: number): string {
  const map = conceptMap(deck);
  if (!map) return '';
  const slides = conceptSlides(deck, map);
  const name = (c: Concept) => c.name;
  const before = map.ideas.filter((c) => (slides.get(c.id) ?? Infinity) < i);
  const here = map.ideas.filter((c) => slides.get(c.id) === i);
  const later = map.ideas.filter((c) => (slides.get(c.id) ?? -1) > i);
  const lines: string[] = [];
  if (here.length) {
    lines.push(`This slide teaches: ${here.map((c) => {
      const needs = builtOn(map, c.id).filter((n) => (slides.get(n.id) ?? Infinity) <= i).slice(0, 3);
      return `${c.name}${needs.length ? ` (builds on: ${needs.map(name).join(', ')})` : ''}`;
    }).join('; ')}.`);
  }
  if (before.length) lines.push(`Already taught: ${before.map(name).join(', ').slice(0, 700)}.`);
  if (later.length) lines.push(`Not taught yet (don't explain with these; say it comes later if asked): ${later.map(name).join(', ').slice(0, 500)}.`);
  if (here.length) lines.push('If the learner seems lost on this slide, check the idea it builds on first, and re-explain that one if that is where the gap is.');
  return lines.length ? `\nThe lesson's ideas. ${lines.join(' ')}` : '';
}

/** Problems a person should look at: an idea that builds on one taught later, an idea on a missing slide, a question with no idea */
export function conceptIssues(deck: Deck, concepts: DeckConcepts): { id: string; text: string }[] {
  const slides = conceptSlides(deck, concepts);
  const by = new Map(concepts.ideas.map((c) => [c.id, c]));
  const out: { id: string; text: string }[] = [];
  for (const c of concepts.ideas) {
    const at = slides.get(c.id);
    if (at === undefined) { out.push({ id: c.id, text: `“${c.name}” is on a slide that no longer exists` }); continue; }
    for (const n of c.needs) {
      const need = by.get(n);
      const needAt = slides.get(n);
      if (need && needAt !== undefined && needAt > at) out.push({ id: c.id, text: `“${c.name}” (slide ${at + 1}) builds on “${need.name}”, which is taught later (slide ${needAt + 1})` });
    }
  }
  const untagged = (deck.bank?.questions ?? []).filter((q) => !concepts.questions?.[q.id]).length;
  if (untagged) out.push({ id: '', text: `${untagged} classmate question${untagged === 1 ? ' has' : 's have'} no idea yet (they fall back to matching words)` });
  return out;
}
