// Server only: the study's right answers (lib/study/content.ts has the questions). Never imported by a page.
import { QUIZ_SAME, type QuizQuestion } from './content';

export const ANSWERS: Record<string, string> = {
  q1: 'b', q2: 'c', q3: 'a', q4: 'a', q5: 'b',
  q6: 'd', q7: 'a', q8: 'd', q9: 'b', q10: 'c',
};

// The short answers: scored by hand (or a first pass by the AI, checked by hand), 0-2 each
export const RUBRIC: Record<string, string> = {
  s1: '2: not native AND harms the Bay (eats crabs or other animals the Bay depends on, few predators). 1: one of those. 0: neither.',
  s2: '2: a trait AND how it helps (big or long-lived: few predators, many years of eating and breeding; eats anything: food is never short; handles some salt: crosses the Bay to new rivers). 1: a trait with no or a vague reason. 0: neither.',
  s3: '2: a real step (fishing, eating them, commercial harvest, stopping their spread) AND a reason. 1: a step with no reason, or a reason with no clear step. 0: neither.',
};

const SAME = new Set(QUIZ_SAME.map((q) => q.id));

/** The multiple choice score, and the score on the 5 questions asked before and after the lesson */
export function score(questions: QuizQuestion[], answers: Record<string, unknown>) {
  let right = 0, same = 0;
  for (const q of questions) {
    if (q.kind !== 'choice' || answers[q.id] !== ANSWERS[q.id]) continue;
    right++;
    if (SAME.has(q.id)) same++;
  }
  return { right, same, of: questions.filter((q) => q.kind === 'choice').length };
}
