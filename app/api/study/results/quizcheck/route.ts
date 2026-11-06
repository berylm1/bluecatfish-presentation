import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { chat } from '@/lib/canvas/ai';
import { readSaved } from '@/lib/canvas/saved';
import { readDeck } from '@/lib/canvas/store';
import { shownWords, spokenText } from '@/lib/canvas/queue';
import { POST_QUIZ, STUDY_LESSON } from '@/lib/study/content';
import { ANSWERS, RUBRIC } from '@/lib/study/key';
import { getStudyVersion } from '@/lib/study/version';
import { studyOf } from '@/lib/study/content';
import type { Deck } from '@/lib/canvas/types';

export const maxDuration = 120;

/*
 * "Check the quizzes against the lesson" (/studyResults, "Ready for the study?"; editors only: under
 * /api/study/results in lib/editorAuth.ts). Every quiz question (Quiz 2 has all of Quiz 1's) against the study's
 * lesson: the version it's frozen to, else the live one. Only the base slides, what everyone sees and hears: no helper
 * slides, no classmates' questions, no topic introductions. So whatever the lesson's length, each question must be
 * answerable from its own slides.
 *   POST → { lesson, slides, results: [{ id, q, answer, verdict: 'taught' | 'partly' | 'not', slides, note }] }
 */
type Verdict = 'taught' | 'partly' | 'not';

/** The base slides, numbered: what's on screen and what the professor says */
function lessonText(deck: Deck): string {
  return deck.slides.map((s, i) => {
    const parts = s.elements.flatMap((el) => {
      const shown = shownWords(el).replace(/\s+/g, ' ').trim();
      const said = el.silent ? '' : spokenText(el).replace(/\s+/g, ' ').trim();
      return [shown && `shows: ${shown}`, said && said !== shown && `says: ${said}`].filter(Boolean);
    });
    return `SLIDE ${i + 1}${s.topic ? ` (${s.topic.trim()})` : ''}\n${parts.join('\n')}`;
  }).join('\n\n');
}

export async function POST(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  try {
    // (the study's frozen version: { study: 2 } for the classmates study)
    const body = await req.json().catch(() => ({}));
    const version = await getStudyVersion(studyOf(body?.study).id);
    const frozen = version.slug ? await readSaved(STUDY_LESSON, version.slug) : null;
    const deck = frozen ?? (await readDeck(STUDY_LESSON, 'live'));
    if (!deck?.slides?.length) return NextResponse.json({ error: 'The study’s lesson has no slides yet' }, { status: 400 });

    const questions = POST_QUIZ.map((q) => q.kind === 'choice'
      ? { id: q.id, q: q.q, answer: q.choices.find((c) => c.id === ANSWERS[q.id])?.text ?? '', wrong: q.choices.filter((c) => c.id !== ANSWERS[q.id]).map((c) => c.text) }
      : { id: q.id, q: q.q, answer: RUBRIC[q.id] ?? '', wrong: [] as string[] });
    const out = JSON.parse(await chat(
      'You check a study\'s quiz against the lesson it tests. For each question, is its right answer TAUGHT by the lesson below ' +
        '(said or shown on its slides, plainly enough that someone who only watched the lesson could answer)? ' +
        '"taught": yes; "partly": hinted or only part of it; "not": not in the lesson. Give the slide numbers where it is taught. ' +
        'For a multiple-choice question, also say in the note if the lesson makes a WRONG choice look right. ' +
        'For a written question (its answer is a scoring guide), check the lesson teaches what a full-marks answer needs. ' +
        'Notes: one short plain sentence, only when something is missing or off. ' +
        'Reply as JSON: {"results":[{"id":"q1","verdict":"taught","slides":[3],"note":""}]}',
      `QUESTIONS\n${questions.map((q) => `${q.id}. ${q.q}\n   right answer: ${q.answer}${q.wrong.length ? `\n   wrong choices: ${q.wrong.join(' | ')}` : ''}`).join('\n')}\n\nTHE LESSON\n${lessonText(deck)}`,
      true,
      4000,
    ));
    const got = new Map<string, { verdict?: unknown; slides?: unknown; note?: unknown }>((Array.isArray(out?.results) ? out.results : []).map((r: { id?: unknown }) => [String(r.id), r]));
    const results = questions.map((q) => {
      const r = got.get(q.id) ?? {};
      const verdict: Verdict = r.verdict === 'taught' || r.verdict === 'partly' ? r.verdict : 'not';
      const slides = (Array.isArray(r.slides) ? r.slides : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= deck.slides.length).slice(0, 6);
      const note = !got.has(q.id) ? 'The check skipped this one: check again' : typeof r.note === 'string' ? r.note.slice(0, 300) : '';
      return { id: q.id, q: q.q, answer: q.answer.slice(0, 300), verdict, slides, note };
    });
    return NextResponse.json({ lesson: frozen ? version.name : 'the live lesson (not frozen yet)', slides: deck.slides.length, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
