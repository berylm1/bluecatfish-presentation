import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { deleteLesson, ensureLesson, isLessonId, listLessons } from '@/lib/canvas/store';
import { DEFAULT_LESSON } from '@/lib/canvas/lessons';

export const dynamic = 'force-dynamic';

// GET → every lesson. POST { title } → creates one (id made from the title).
// DELETE { id } → deletes a lesson and its decks (not the main lesson).
export async function GET() {
  return NextResponse.json({ lessons: await listLessons() });
}

export async function POST(req: Request) {
  const { title } = await req.json().catch(() => ({}));
  const clean = typeof title === 'string' ? title.trim().slice(0, 100) : '';
  if (!clean) return NextResponse.json({ error: 'Give the lesson a name' }, { status: 400 });
  const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'lesson';
  const taken = new Set((await listLessons()).map((l) => l.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const warning = await ensureLesson({ id, title: clean }, await editorName(req));
  return NextResponse.json({ lesson: { id, title: clean }, warning });
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!isLessonId(id)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  if (id === DEFAULT_LESSON.id) {
    return NextResponse.json({ error: `“${DEFAULT_LESSON.title}” is the lesson the home page plays, so it can’t be deleted. You can take its live deck down instead.` }, { status: 400 });
  }
  const warning = await deleteLesson(id);
  return NextResponse.json({ ok: true, warning });
}
