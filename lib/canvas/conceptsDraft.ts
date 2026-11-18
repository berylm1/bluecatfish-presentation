import type { Concept, Deck, DeckConcepts } from './types';
import { chat } from './ai';
import { lessonText } from './lessonText';
import { POST_QUIZ, STUDY_LESSON } from '@/lib/study/content';

/*
 * Drafting the concept map with the AI (the editor's "Ideas" → "Draft with AI"; server only). One read of the
 * lesson's slides: the ideas, the slide that teaches each, what each builds on; and which idea each of the question
 * bank's questions (and, for the study's lesson, each quiz question) is about. A person corrects it afterwards:
 * ideas they wrote or changed (not byAI) are kept when it's drafted again.
 */

const SYSTEM = `You map the IDEAS a short lesson teaches, from its slides (numbered).
List the 15 to 30 main ideas: each one thing a learner should come away knowing (a fact, a cause, a term), not a slide title.
For each idea:
- "name": 2 to 6 plain words
- "means": one plain sentence, only from what the slides say
- "slide": the number of the ONE slide that first teaches it
- "needs": the names of other ideas in your list a learner must already have to follow it (0 to 3). Only ideas taught on the same slide or an earlier one. Most ideas need at least one; the very first ideas need none.
Use only what the slides teach: no new facts.
Then, for each QUESTION given (by its id), the name of the one idea it is mostly about ("" if none fits).
Reply as JSON: {"ideas":[{"name":"...","means":"...","slide":3,"needs":["..."]}],"questions":{"<id>":"<idea name>"}}`;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function draftConcepts(deck: Deck): Promise<DeckConcepts> {
  if (!deck.slides.length) throw new Error('The lesson has no slides yet');
  const kept = (deck.concepts?.ideas ?? []).filter((c) => !c.byAI && deck.slides.some((s) => s.id === c.slide));
  const bank = deck.bank?.questions ?? [];
  const quiz = deck.lessonId === STUDY_LESSON ? POST_QUIZ.filter((q) => q.kind === 'choice') : [];
  const questions = [
    ...bank.map((q) => `[${q.id}] ${q.q}`),
    ...quiz.map((q) => `[quiz-${q.id}] ${q.q}`),
  ];
  const out = JSON.parse(await chat(
    SYSTEM,
    `Lesson: ${deck.title}\n\nSLIDES\n${lessonText(deck)}` +
      (kept.length ? `\n\nIDEAS ALREADY IN THE MAP (keep these names; add the others around them)\n${kept.map((c) => `- ${c.name} (slide ${deck.slides.findIndex((s) => s.id === c.slide) + 1})`).join('\n')}` : '') +
      `\n\nQUESTIONS\n${questions.join('\n') || '(none)'}`,
    true,
    6000,
  ));

  const stamp = Date.now().toString(36).slice(-5);
  const ideas: Concept[] = [...kept.map((c) => ({ ...c }))];
  const byName = new Map(ideas.map((c) => [key(c.name), c]));
  const wants = new Map<string, string[]>();   // idea id → the names it builds on (as the AI gave them)
  for (const [n, raw] of (Array.isArray(out?.ideas) ? out.ideas : []).slice(0, 40).entries()) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 80) : '';
    const at = deck.slides[Number(raw?.slide) - 1];
    if (!name || !at) continue;
    const needs = (Array.isArray(raw?.needs) ? raw.needs : []).filter((x: unknown): x is string => typeof x === 'string').slice(0, 4);
    const had = byName.get(key(name));
    if (had) { if (!had.needs.length) wants.set(had.id, needs); continue; }   // a person's idea: theirs stays (its links too, if it has any)
    const idea: Concept = { id: `c-${stamp}-${n}`, name, means: typeof raw?.means === 'string' ? raw.means.trim().slice(0, 240) : '', slide: at.id, needs: [], byAI: true };
    ideas.push(idea);
    byName.set(key(name), idea);
    wants.set(idea.id, needs);
  }
  // the links, by name; only to ideas taught on the same slide or before (a later one would be a loop in the lesson)
  const slideOf = new Map(deck.slides.map((s, i) => [s.id, i]));
  for (const idea of ideas) {
    const names = wants.get(idea.id);
    if (!names) continue;
    const at = slideOf.get(idea.slide) ?? 0;
    idea.needs = [...new Set(names.map((n) => byName.get(key(n))).filter((c): c is Concept => !!c && c.id !== idea.id && (slideOf.get(c.slide) ?? Infinity) <= at).map((c) => c.id))];
  }
  ideas.sort((a, b) => (slideOf.get(a.slide) ?? 0) - (slideOf.get(b.slide) ?? 0));

  const tagged: Record<string, string> = {};
  const quizTags: Record<string, string> = {};
  const answers = out?.questions && typeof out.questions === 'object' ? out.questions as Record<string, unknown> : {};
  for (const q of bank) { const c = typeof answers[q.id] === 'string' ? byName.get(key(answers[q.id] as string)) : null; if (c) tagged[q.id] = c.id; }
  for (const q of quiz) { const a = answers[`quiz-${q.id}`]; const c = typeof a === 'string' ? byName.get(key(a)) : null; if (c) quizTags[q.id] = c.id; }
  // (a person's own tags stay, where their idea is still there)
  const live = new Set(ideas.map((c) => c.id));
  for (const [q, c] of Object.entries(deck.concepts?.questions ?? {})) if (live.has(c) && kept.some((k) => k.id === c)) tagged[q] = c;
  for (const [q, c] of Object.entries(deck.concepts?.quiz ?? {})) if (live.has(c) && kept.some((k) => k.id === c)) quizTags[q] = c;

  if (!ideas.length) throw new Error('The AI found no ideas in the slides: try again');
  return { ideas, questions: tagged, quiz: Object.keys(quizTags).length ? quizTags : undefined, at: new Date().toISOString(), off: deck.concepts?.off };
}
