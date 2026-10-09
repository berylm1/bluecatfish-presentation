import { NextResponse } from 'next/server';
import { CantDescribe, describeImage } from '@/lib/canvas/describeImage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { src, lessonTitle?, topic? } → { description }: the AI's description
// of a picture (the editor's "✨ Describe it"; nothing is saved here).
// Editors only: under /api/editor, see proxy.ts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const src = typeof body?.src === 'string' ? body.src.trim() : '';
  if (!src || src.length > 2000) return NextResponse.json({ error: 'No picture' }, { status: 400 });
  try {
    const description = await describeImage(src, {
      lesson: String(body.lessonTitle ?? '').slice(0, 200),
      topic: String(body.topic ?? '').slice(0, 200),
    });
    return NextResponse.json({ description });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: e instanceof CantDescribe ? msg : `The AI couldn't describe it: ${msg}` }, { status: e instanceof CantDescribe ? 422 : 500 });
  }
}
