import { NextResponse } from 'next/server';
import { isLessonId, readDeck } from '@/lib/canvas/store';
import { STUDY_LESSON } from '@/lib/study/content';
import { studyDeck } from '@/lib/study/version';

export const dynamic = 'force-dynamic';

// Public: GET ?lesson= → the published (live) deck; with none, the AI-made
// canvas deck; with neither, null (the presentation then uses the old AI lesson).
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  // The study (&study=<their id>, or 1 before they have one): the saved version it's frozen to (lib/study/version.ts)
  const study = new URL(req.url).searchParams.get('study');
  if (study && lesson === STUDY_LESSON) {
    const frozen = await studyDeck(study === '1' ? null : study).catch(() => null);
    if (frozen?.deck) return NextResponse.json({ deck: frozen.deck, source: 'study', version: frozen.version }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const live = await readDeck(lesson, 'live');
  const deck = live?.slides?.length ? live : await readDeck(lesson, 'ai');
  return NextResponse.json({ deck: deck?.slides?.length ? deck : null, source: deck === live ? 'live' : 'ai' }, { headers: { 'Cache-Control': 'no-store' } });
}
