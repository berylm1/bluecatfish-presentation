import { NextResponse } from 'next/server';
import { isLessonId } from '@/lib/canvas/store';
import { STUDY_LESSON } from '@/lib/study/content';
import { getStudyVersion } from '@/lib/study/version';
import { cleanName, deleteSaved, listSaved, nameTaken, readSaved, slugOf } from '@/lib/canvas/saved';

export const dynamic = 'force-dynamic';

// Named versions (saved on publish), for the editor's "Saved versions…" and the Publish name.
//   GET ?lesson=…            → that lesson's saved versions, newest first
//   GET ?lesson=…&slug=…     → one version's deck
//   GET ?name=…              → { ok, taken }: can a version be saved under this name?
//   DELETE { lesson, slug }  → removes one (its name can be used again)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.has('name')) {
    const name = cleanName(q.get('name'));
    return NextResponse.json({ ok: !!name, taken: name ? await nameTaken(name) : false, slug: name ? slugOf(name) : null });
  }
  const lesson = q.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const slug = q.get('slug');
  if (slug) {
    const deck = await readSaved(lesson, slug);
    return deck ? NextResponse.json({ deck }) : NextResponse.json({ error: 'That version is no longer saved' }, { status: 404 });
  }
  return NextResponse.json({ versions: await listSaved(lesson) });
}

export async function DELETE(req: Request) {
  const { lesson, slug } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson) || typeof slug !== 'string' || !/^[a-z0-9-]{1,60}$/.test(slug)) return NextResponse.json({ error: 'Bad version' }, { status: 400 });
  // (not the version the study plays: /studyResults picks another first; was: deleted, and the study quietly fell back to the live lesson)
  const study = await getStudyVersion().catch(() => null);
  if (lesson === STUDY_LESSON && study?.slug === slug) {
    return NextResponse.json({ error: `“${study.name}” is the lesson the study plays. Pick another one on Study results first.` }, { status: 409 });
  }
  await deleteSaved(lesson, slug);
  return NextResponse.json({ ok: true });
}
