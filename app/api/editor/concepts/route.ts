import { NextResponse } from 'next/server';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { draftConcepts } from '@/lib/canvas/conceptsDraft';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { deck } → { concepts }: the lesson's concept map, drafted by the AI from its slides (the editor's "Ideas";
// nothing is saved here: the editor keeps it in the lesson). Editors only: under /api/editor, see proxy.ts.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: 'The lesson is too big to read' }, { status: 413 });
  let deck;
  try {
    const raw = JSON.parse(body)?.deck;
    deck = sanitizeDeck(raw, typeof raw?.lessonId === 'string' && /^[\w-]{1,64}$/.test(raw.lessonId) ? raw.lessonId : 'draft', 'hand');
  } catch {
    return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  }
  try {
    return NextResponse.json({ concepts: await draftConcepts(deck) });
  } catch (e) {
    return NextResponse.json({ error: `The ideas couldn’t be drafted: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
