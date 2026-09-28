import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { ensureLesson, isLessonId, listLessons, readDeck, writeDeck, type DeckKind } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';

// GET ?lesson=&kind=draft|live → that deck (or null). PUT { lesson, deck } → saves the draft.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lesson = params.get('lesson');
  const kind = (params.get('kind') ?? 'draft') as DeckKind;
  if (!isLessonId(lesson) || !['draft', 'live'].includes(kind)) {
    return NextResponse.json({ error: 'Bad lesson or kind' }, { status: 400 });
  }
  return NextResponse.json({ deck: await readDeck(lesson, kind) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const body = await req.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: 'Deck is too big to save' }, { status: 413 });
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: 'Not JSON' }, { status: 400 }); }
  const { lesson } = parsed ?? {};
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  try {
    const deck = sanitizeDeck(parsed.deck, lesson, 'hand');
    const by = await editorName(req);
    const known = (await listLessons()).find((l) => l.id === lesson);
    const lessonWarning = await ensureLesson(known ?? { id: lesson, title: deck.title }, by);
    const warning = await writeDeck(lesson, 'draft', deck, by);
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString(), by, warning: warning ?? lessonWarning });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
