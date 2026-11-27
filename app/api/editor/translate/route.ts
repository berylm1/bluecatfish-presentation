import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';
import { profileOf } from '@/lib/canvas/profile';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { translateDeckWords, translateSlides } from '@/lib/canvas/translate';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PER_ROUND = 3;   // slides translated in one request (each round fits well inside the time a request may take)

// POST { lesson, language, from } → { next, total }: puts a lesson's DRAFT in another language, a few slides a round.
// from: 0 starts (the title, recap and settings are done with the first slides); the caller asks again with `next`
// until it's null. Meant for a fresh copy (/api/editor/copy-lesson), before anyone edits it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) ?? {};
  const language = typeof body.language === 'string' ? body.language.trim().slice(0, 40) : '';
  const from = Number.isInteger(body.from) && body.from >= 0 ? body.from : 0;
  if (!isLessonId(body.lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  if (!/\p{L}{2,}/u.test(language)) return NextResponse.json({ error: 'Which language?' }, { status: 400 });
  const deck = await readDeck(body.lesson, 'draft');
  if (!deck) return NextResponse.json({ error: 'That lesson has no draft' }, { status: 404 });
  enterProfile(profileOf(deck));
  try {
    const part = deck.slides.slice(from, from + PER_ROUND);
    await Promise.all([translateSlides(part, language), from === 0 ? translateDeckWords(deck, language) : null]);
    const failed = await writeDeck(body.lesson, 'draft', deck, await editorName(req));
    if (failed) return NextResponse.json({ error: failed }, { status: 500 });
    const next = from + PER_ROUND < deck.slides.length ? from + PER_ROUND : null;
    return NextResponse.json({ next, total: deck.slides.length, title: deck.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
