import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { deleteDeck, isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';
import { writeRecap } from '@/lib/canvas/prepare';

export const maxDuration = 60;

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
  // The end-of-lesson recap: written by the AI unless someone wrote their own
  let recapError: string | null = null;
  if (!draft.recap?.trim() || draft.recapByAI) {
    try {
      draft.recap = await writeRecap(draft);
      draft.recapByAI = true;
      await writeDeck(lesson, 'draft', draft, by);
    } catch (e) {
      recapError = `The recap couldn't be written: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const warning = (await writeDeck(lesson, 'live', draft, by)) ?? recapError;
  return NextResponse.json({ ok: true, publishedAt: new Date().toISOString(), by, warning, recap: draft.recap ?? null, recapByAI: !!draft.recapByAI });
}

export async function DELETE(req: Request) {
  const { lesson } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const warning = await deleteDeck(lesson, 'live');
  return NextResponse.json({ ok: true, warning });
}
