import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { ensureLesson, listLessons } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';

// GET → every lesson. POST { title } → creates one (id made from the title).
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
