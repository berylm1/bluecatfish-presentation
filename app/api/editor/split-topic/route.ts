import { NextResponse } from 'next/server';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { suggestSplit } from '@/lib/canvas/splitTopic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { deck, start } → { split }: where to split the topic that starts at
// slide `start`, and a name for each part (the editor's "Split this topic";
// nothing is changed here). Editors only: under /api/editor, see proxy.ts.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: 'The lesson is too big' }, { status: 413 });
  let deck;
  let start: number;
  try {
    const parsed = JSON.parse(body);
    deck = sanitizeDeck(parsed?.deck, 'draft', 'hand');
    start = Number(parsed?.start);
    if (!Number.isInteger(start) || start < 0 || start >= deck.slides.length) throw new Error('bad start');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    return NextResponse.json({ split: await suggestSplit(deck.slides, start, deck.title) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
