import { NextResponse } from 'next/server';
import { isLessonId, listLessons, readDeck, writeDeck } from '@/lib/canvas/store';
import { generateAiDeck } from '@/lib/canvas/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;   // planning + one call per topic (in parallel) + one retry

// GET ?lesson= → about the lesson's AI deck (or null).
// POST { lesson } → makes a new AI deck in the canvas format and stores it.
// Learners get it when nothing is published. Audio is made afterwards by
// /api/editor/prepare with kind "ai".
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const deck = await readDeck(lesson, 'ai');
  return NextResponse.json({
    ai: deck?.slides?.length ? { at: deck.updatedAt, slides: deck.slides.length, topics: new Set(deck.slides.map((s) => s.topic)).size } : null,
  });
}

export async function POST(req: Request) {
  const { lesson } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const info = (await listLessons()).find((l) => l.id === lesson) ?? { id: lesson, title: lesson };
  try {
    const started = Date.now();
    const { deck, notes } = await generateAiDeck(info);
    await writeDeck(lesson, 'ai', deck, 'AI');
    return NextResponse.json({ ok: true, slides: deck.slides.length, seconds: Math.round((Date.now() - started) / 1000), notes });
  } catch (e) {
    return NextResponse.json({ error: `The AI deck couldn't be made: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
