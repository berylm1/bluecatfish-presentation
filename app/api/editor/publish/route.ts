import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { deleteDeck, isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';

// POST { lesson } → the saved draft becomes the live deck.
// DELETE { lesson } → takes the live deck down (the presentation goes back to the AI lesson).
export async function POST(req: Request) {
  const { lesson } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const draft = await readDeck(lesson, 'draft');
  if (!draft || draft.slides.length === 0) {
    return NextResponse.json({ error: 'Save at least one slide before publishing' }, { status: 400 });
  }
  const by = await editorName(req);
  const warning = await writeDeck(lesson, 'live', draft, by);
  return NextResponse.json({ ok: true, publishedAt: new Date().toISOString(), by, warning });
}

export async function DELETE(req: Request) {
  const { lesson } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const warning = await deleteDeck(lesson, 'live');
  return NextResponse.json({ ok: true, warning });
}
