import { NextResponse } from 'next/server';
import { isLessonId, readDeck } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';

// Public: GET ?lesson= → the published (live) deck; with none, the AI-made
// canvas deck; with neither, null (the presentation then uses the old AI lesson).
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const live = await readDeck(lesson, 'live');
  const deck = live?.slides?.length ? live : await readDeck(lesson, 'ai');
  return NextResponse.json({ deck: deck?.slides?.length ? deck : null, source: deck === live ? 'live' : 'ai' }, { headers: { 'Cache-Control': 'no-store' } });
}
