import type { Deck, QuizQuestion } from './types';
import { chat, knowledgeExcerpts, STYLE } from './ai';
import { spokenText, shownWords } from './queue';
import { quiz as cleanQuiz } from './sanitize';
import { QUIZ_POOL } from './aiFields';

// The end-of-lesson quiz pool, made when the lesson is saved (prepare.ts):
//   - none yet: the AI writes POOL questions from what the lesson teaches;
//   - the lesson changed: the questions are checked again, not rewritten (so they
//     stay the ones a person looked at), and topped up if some were dropped.
// Every question's answer is checked against the lesson and the knowledge base by a
// second AI read; a question that's wrong, doubtful or not taught in the lesson is
// dropped. Learners get QUIZ_ASKED of them at random (app/presentation).

const POOL = QUIZ_POOL;
const MIN_POOL = 5;        // fewer left after a check: write more

/** What the lesson teaches, slide by slide (the quiz may only ask about this). */
function lessonText(deck: Deck): string {
  return deck.slides
    .map((s, i) => `Slide ${i + 1} [${s.topic ?? ''}]: ${s.elements.map((e) => spokenText(e) || shownWords(e)).filter(Boolean).join(' ')}`)
    .join('\n')
    .slice(0, 14000);
}

const numbered = (qs: QuizQuestion[]) =>
  qs.map((q, i) => `${i + 1}. ${q.q}\n${q.choices.map((c, k) => `   ${String.fromCharCode(65 + k)}) ${c}${k === q.answer ? '   ← marked right' : ''}`).join('\n')}`).join('\n');

/** New questions from the lesson (not repeating `avoid`). */
async function write(deck: Deck, count: number, avoid: QuizQuestion[]): Promise<QuizQuestion[]> {
  const out = JSON.parse(await chat(
    `${STYLE}\nWrite ${count} multiple-choice quiz questions for the end of this lesson, for 10-14 year olds. ` +
      'Each asks about one main idea the lesson TEACHES (nothing it doesn\'t say), in plain words, under 20 words. ' +
      '4 short choices, exactly one right; the wrong ones believable (common mix-ups), not silly; no "all of the above". ' +
      'Spread them over the whole lesson. "why": one short sentence giving the reason or a fact from the lesson that backs the answer (not the answer said again). ' +
      'Reply as JSON: {"questions":[{"q":"...","choices":["...","...","...","..."],"answer":0,"why":"..."}]} (answer = index of the right choice)',
    `Lesson: ${deck.title}\n\n${lessonText(deck)}` + (avoid.length ? `\n\nAlready asked (don't repeat these):\n${avoid.map((q) => `- ${q.q}`).join('\n')}` : ''),
    true,
    3000,
  ));
  // the same cleaning as a saved deck (a bad question is left out)
  return cleanQuiz({ from: 'x', questions: out?.questions })?.questions ?? [];
}

/** The questions whose marked answer is right, taught in the lesson, and the only right choice. */
async function check(deck: Deck, qs: QuizQuestion[]): Promise<{ kept: QuizQuestion[]; dropped: string[] }> {
  if (!qs.length) return { kept: [], dropped: [] };
  const excerpts = await knowledgeExcerpts(`${deck.title} ${qs.map((q) => `${q.q} ${q.choices[q.answer]}`).join(' ')}`.slice(0, 2000), 8);
  const out = JSON.parse(await chat(
    'You check end-of-lesson quiz questions for 10-14 year olds. For each numbered question: "ok" only if the choice marked right IS right ' +
      '(by the lesson and the knowledge base excerpts), no other choice is also right, and the lesson teaches it. Otherwise "bad", with a short reason. ' +
      'Reply as JSON: {"items":[{"n":1,"verdict":"ok|bad","why":"..."}]}',
    `LESSON:\n${lessonText(deck)}\n\nKNOWLEDGE BASE EXCERPTS:\n${excerpts.map((e, i) => `[${i + 1}] ${e.content}`).join('\n') || '(none found)'}\n\nQUESTIONS:\n${numbered(qs)}`,
    true,
    2000,
  ));
  const bad = new Map<number, string>();
  for (const v of Array.isArray(out?.items) ? out.items : []) {
    const n = Number(v?.n);
    if (Number.isInteger(n) && v?.verdict !== 'ok') bad.set(n, typeof v?.why === 'string' ? v.why.slice(0, 160) : '');
  }
  // a question the check didn't answer for counts as not checked: left out
  const answered = new Set((Array.isArray(out?.items) ? out.items : []).map((v: { n?: unknown }) => Number(v?.n)));
  const kept: QuizQuestion[] = [];
  const dropped: string[] = [];
  qs.forEach((q, i) => {
    if (answered.has(i + 1) && !bad.has(i + 1)) kept.push(q);
    else dropped.push(`${q.q}${bad.get(i + 1) ? ` (${bad.get(i + 1)})` : ''}`);
  });
  return { kept, dropped };
}

/** The pool for the lesson as it is now: the current questions checked again, new ones written and checked to fill it up. */
export async function refreshQuiz(deck: Deck): Promise<{ questions: QuizQuestion[]; dropped: string[]; added: number }> {
  const current = deck.quiz?.questions ?? [];
  const { kept, dropped } = await check(deck, current);
  let added = 0;
  if (kept.length < MIN_POOL) {
    const fresh = await check(deck, await write(deck, POOL - kept.length, kept));
    kept.push(...fresh.kept);
    added = fresh.kept.length;
  }
  return { questions: kept.slice(0, POOL + 2), dropped, added };
}
