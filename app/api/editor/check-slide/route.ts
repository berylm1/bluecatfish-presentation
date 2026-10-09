import { NextResponse } from 'next/server';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { checkSlide } from '@/lib/canvas/checkSlide';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { slide, lessonTitle? } → { claims, excerpts }: the slide's facts
// checked against the knowledge base, with where each came from (the
// editor's "Check this slide"; nothing is saved). Editors only: under
// /api/editor, see proxy.ts.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 300_000) return NextResponse.json({ error: 'The slide is too big to check' }, { status: 413 });
  let slide;
  let title = '';
  try {
    const parsed = JSON.parse(body);
    slide = sanitizeDeck({ slides: [parsed?.slide] }, 'draft', 'hand').slides[0];
    title = String(parsed?.lessonTitle ?? '').slice(0, 200);
  } catch {
    return NextResponse.json({ error: 'Bad slide' }, { status: 400 });
  }
  try {
    return NextResponse.json(await checkSlide(slide, title));
  } catch (e) {
    return NextResponse.json({ error: `The check failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
