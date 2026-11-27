import { NextResponse } from 'next/server';
import { isLessonId } from '@/lib/canvas/store';
import { AI_PRICES, readUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

// GET ?lesson= → { usage: { calls, tokensIn, tokensOut, voiceChars, searchTokens, dollars }, prices }: how much AI the
// lesson has used since counting began (lib/usage.ts), with an estimate in dollars (editors only: under /api/editor)
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  return NextResponse.json({ usage: await readUsage(lesson), prices: AI_PRICES });
}
