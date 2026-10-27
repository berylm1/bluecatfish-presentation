import { NextRequest, NextResponse } from 'next/server';
import { listSaved } from '@/lib/canvas/saved';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { STUDY_LESSON } from '@/lib/study/content';
import { getStudyVersion, LIVE_LABEL, setStudyVersion } from '@/lib/study/version';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';

/*
 * The lesson version the study plays (/studyResults; editors only: under /api/study/results in lib/editorAuth.ts)
 *   GET              → the version now, the saved versions to pick from, and how many people saw each
 *   POST { slug }    → freeze the study to that saved version (null: the live lesson again)
 */
const supabase = lazySupabaseAdmin();

export async function GET(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const [current, versions] = await Promise.all([getStudyVersion(), listSaved(STUDY_LESSON)]);
  // people (not test runs) per version they saw
  const seen: Record<string, number> = {};
  const { data } = await supabase.from('study_participants').select('lesson_version').eq('is_test', false).not('lesson_version', 'is', null);
  for (const r of (data ?? []) as { lesson_version: string }[]) {
    const label = r.lesson_version === LIVE_LABEL ? LIVE_LABEL : r.lesson_version.split(':').slice(1).join(':') || r.lesson_version;
    seen[label] = (seen[label] ?? 0) + 1;
  }
  return NextResponse.json({
    lesson: STUDY_LESSON, current,
    versions: versions.map((v) => ({ slug: v.slug, name: v.name, savedAt: v.savedAt, slides: v.slides })),
    seen,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const editor = await verifyToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!editor) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.slug === 'string' ? body.slug : null;
  try {
    if (!slug) {
      await setStudyVersion(null, null, editor);
      return NextResponse.json({ ok: true, current: await getStudyVersion() });
    }
    const v = (await listSaved(STUDY_LESSON)).find((x) => x.slug === slug);
    if (!v) return NextResponse.json({ error: 'No saved version by that name' }, { status: 400 });
    await setStudyVersion(v.slug, v.name, editor);
    return NextResponse.json({ ok: true, current: await getStudyVersion() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
