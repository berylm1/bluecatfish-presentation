import { NextResponse } from 'next/server';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { findRepeats, repeatCoverage } from '@/lib/canvas/repeats';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { deck } → { suggestions }: where the lesson repeats itself, with a
// rewrite for each later repeat (the editor's "Check for repeats"; nothing is
// saved here). Editors only: under /api/editor, see proxy.ts.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: 'The lesson is too big to check' }, { status: 413 });
  let deck;
  try {
    deck = sanitizeDeck(JSON.parse(body)?.deck, 'draft', 'hand');
  } catch {
    return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  }
  try {
    return NextResponse.json({ suggestions: await findRepeats(deck), partial: repeatCoverage(deck) });
  } catch (e) {
    return NextResponse.json({ error: `The repeat check failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
