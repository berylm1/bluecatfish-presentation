import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { studyOf } from '@/lib/study/content';

/*
 * The researcher's notes from a person's interview (/studyResults; editors only: under /api/study/results in
 * lib/editorAuth.ts). POST { id, notes, study? } → kept on their row, in its study's table (interview_notes).
 */
const supabase = lazySupabaseAdmin();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 5000;

export async function POST(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== 'string' || !UUID.test(body.id) || typeof body?.notes !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const notes = body.notes.trim().slice(0, MAX) || null;
  const { data, error } = await supabase.from(studyOf(body.study).table).update({ interview_notes: notes }).eq('id', body.id).select('id');
  if (error) return NextResponse.json({ error: /interview_notes/.test(error.message) ? 'Run setup file 017 (supabase/migrations/017_study_in_person.sql) first.' : error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'No such person' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
