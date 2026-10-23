import { NextResponse } from 'next/server';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { findRepeats, repeatCoverage } from '@/lib/canvas/repeats';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { deck, changed? } → { suggestions }: where the lesson repeats itself (changed: slide ids, only repeats involving them), with a
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
    // changed: the slides changed since the last check (only repeats involving them); none sent: the whole lesson
    const ids = JSON.parse(body)?.changed;
    const changed = Array.isArray(ids) ? new Set(ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 500)) : undefined;
    return NextResponse.json({ suggestions: await findRepeats(deck, changed), partial: repeatCoverage(deck) });
  } catch (e) {
    return NextResponse.json({ error: `The repeat check failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
