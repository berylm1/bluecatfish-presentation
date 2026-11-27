import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { ensureLesson, isLessonId, listLessons, readDeck, writeDeck } from '@/lib/canvas/store';
import { profileOf } from '@/lib/canvas/profile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { from, title } → { lesson }: a copy of a lesson, as a new one with its own draft (the slides, the settings and
// the same knowledge bases, so its facts and pictures are still found). Not published; the original isn't touched.
// (the first step of "Translate a copy…" too: /api/editor/translate then puts the copy in the other language)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  if (!isLessonId(body.from)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Give the copy a name' }, { status: 400 });
  const source = (await readDeck(body.from, 'draft')) ?? (await readDeck(body.from, 'live')) ?? (await readDeck(body.from, 'ai'));
  if (!source) return NextResponse.json({ error: 'That lesson has no slides to copy yet: save it first' }, { status: 404 });
  const by = await editorName(req);
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'lesson';
  const taken = new Set((await listLessons()).map((l) => l.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const warning = await ensureLesson({ id, title }, by);
  // The whole profile is written out (a copy of the blue catfish lesson keeps its settings, which were defaults by its id)
  const copy = structuredClone(source);
  copy.title = title;
  copy.profile = { ...profileOf(source), title };
  copy.basedOn = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (copy as any).savedAs;
  const failed = await writeDeck(id, 'draft', copy, by);
  if (failed) return NextResponse.json({ error: failed }, { status: 500 });
  return NextResponse.json({ lesson: { id, title }, slides: copy.slides.length, warning });
}
