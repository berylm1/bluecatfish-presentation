import { NextResponse } from 'next/server';
import { rewriteSlide } from '@/lib/canvas/rewriteSlide';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { lessonOf } from '@/lib/canvas/lessonProfiles';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { slide, instruction, lessonTitle? } → { slide, note }: the slide written again as the editor asks
// (editors only: under /api/editor, see proxy.ts)
export async function POST(req: Request) {
  enterProfile(await lessonOf(req));
  const body = await req.json().catch(() => null) ?? {};
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 500) : '';
  if (!instruction) return NextResponse.json({ error: 'Say what to change' }, { status: 400 });
  let slide;
  try {
    slide = sanitizeDeck({ slides: [body.slide] }, 'draft', 'hand').slides[0];
  } catch {
    slide = null;
  }
  if (!slide) return NextResponse.json({ error: 'Bad slide' }, { status: 400 });
  try {
    return NextResponse.json(await rewriteSlide(slide, instruction, String(body.lessonTitle ?? '').slice(0, 200)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
