import { NextResponse } from 'next/server';
import { isLessonId, readDeck } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';

// Public: GET ?lesson= → the published (live) deck, or null if there isn't one.
// With no live deck the presentation uses the AI lesson instead.
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  return NextResponse.json({ deck: await readDeck(lesson, 'live') }, { headers: { 'Cache-Control': 'no-store' } });
}
