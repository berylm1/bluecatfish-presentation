import { NextResponse } from 'next/server';
import { draftActivity, isActivityKind } from '@/lib/canvas/activityDraft';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { lessonOf } from '@/lib/canvas/lessonProfiles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { slide, lessonTitle?, kind? } → { slide }: a hands-on slide drafted
// from the slide being edited (editors only: under /api/editor, see proxy.ts).
export async function POST(req: Request) {
  enterProfile(await lessonOf(req));   // (the lesson being edited: its ages, subject and knowledge base)
  const body = await req.json().catch(() => null) ?? {};
  if (!body?.slide || typeof body.slide !== 'object') return NextResponse.json({ error: 'Bad slide' }, { status: 400 });
  let slide;
  try {
    slide = sanitizeDeck({ slides: [body.slide] }, 'draft', 'hand').slides[0];
  } catch {
    return NextResponse.json({ error: 'Bad slide' }, { status: 400 });
  }
  try {
    const out = await draftActivity(slide, String(body.lessonTitle ?? '').slice(0, 200), isActivityKind(body.kind) ? body.kind : undefined);
    return NextResponse.json({ slide: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
