import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { THRESHOLDS } from '@/lib/confusion';
import { buildReport, type ReportPerson, type ReportTopic } from '@/lib/study/report';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { studyOf, type StudyDef } from '@/lib/study/content';

/*
 * The pilot report (at the bottom of each study's results page; editors only: under /api/study/results in lib/editorAuth.ts).
 * ?study=2 / { study: 2 }: static vs adaptive's (its table; its snapshots, study_reports.study, migration 020)
 *   GET [?tests=1]        → the report now (lib/study/report.ts), and the saved snapshots (their names)
 *   GET ?snapshot=<id>    → one saved snapshot
 *   POST { name, tests }  → save the report now as a snapshot (migration 016)
 *   DELETE { id }         → remove a snapshot
 */
const supabase = lazySupabaseAdmin();
const MAX_NAME = 80;

async function all<T>(query: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function reportNow(tests: boolean, S: StudyDef) {
  const people = await all<ReportPerson & { lesson_session: string | null }>(() => {
    const q = supabase.from(S.table)
      .select('id, step, study_group, is_test, consent_at, lesson_started_at, lesson_finished_at, finished_at, sound_ok, mic_ok, camera_ok, pre_quiz, post_quiz, survey, lesson_session')
      .order('created_at').order('id');
    return tests ? q : q.eq('is_test', false);
  });
  // their topics' confusion snapshots: the latest per PERSON and topic (a refresh starts a new session, the same topic
  // goes on there); one taken as the topic ended beats a later partial one (the tab hidden)
  const owner = new Map<string, string>();
  for (const p of people) for (const s of (p.lesson_session ?? '').split(' ').filter(Boolean)) owner.set(s, p.id);
  const sessions = [...owner.keys()];
  const latest = new Map<string, { partial: boolean; t: ReportTopic }>();
  for (let i = 0; i < sessions.length; i += 200) {
    const rows = await all<{ session_id: string; value: any }>(() => supabase.from('events').select('session_id, value')
      .in('session_id', sessions.slice(i, i + 200)).eq('event_type', 'confusion_topic').order('created_at').order('id'));
    for (const r of rows) {
      const v = r.value ?? {};
      // (the browser writes these: a score out of the meter's range is junk, left out)
      if (typeof v.score !== 'number' || !Number.isFinite(v.score) || v.score < 0 || v.score > 20 || !Number.isInteger(v.topic)) continue;
      const key = `${owner.get(r.session_id) ?? r.session_id}|${v.topic}`;
      const had = latest.get(key);
      if (had && !had.partial && v.partial) continue;
      const before = typeof v.beforeCheck === 'number' && v.beforeCheck >= 0 && v.beforeCheck <= 20 ? v.beforeCheck : undefined;
      latest.set(key, { partial: !!v.partial, t: { score: v.score, beforeCheck: before, signals: v.signals && typeof v.signals === 'object' ? v.signals : {} } });
    }
  }
  return buildReport(people, [...latest.values()].map((x) => x.t), { tests, groups: S.groups, current: { unsure: THRESHOLDS.topic[0], confused: THRESHOLDS.topic[1] } });
}

const missingTable = (msg: string) => /study_reports/.test(msg);

export async function GET(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const S = studyOf(q.get('study'));
  try {
    const snapshot = q.get('snapshot');
    if (snapshot) {
      const { data, error } = await supabase.from('study_reports').select('id, name, created_at, created_by, report').eq('id', Number(snapshot)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: 'No such snapshot' }, { status: 404 });
      return NextResponse.json({ snapshot: data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // (each study's own snapshots; before migration 020 there's no study column: all are the classmates study's)
    const listOf = async () => {
      const r = await supabase.from('study_reports').select('id, name, created_at, created_by, report->people').eq('study', S.id).order('created_at', { ascending: false });
      if (r.error && /column/i.test(r.error.message)) {   // (the study column: 020 not run yet)
        return S.id === 1 ? supabase.from('study_reports').select('id, name, created_at, created_by, report->people').order('created_at', { ascending: false }) : { data: [], error: null };
      }
      return r;
    };
    const [report, list] = await Promise.all([reportNow(q.get('tests') === '1', S), listOf()]);
    return NextResponse.json({
      report,
      snapshots: list.error ? [] : list.data,
      snapshotsMissing: !!list.error && missingTable(list.error.message),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const editor = await verifyToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!editor) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!name) return NextResponse.json({ error: 'Give the snapshot a name' }, { status: 400 });
  try {
    const S = studyOf(body?.study);
    const report = await reportNow(body?.tests === true, S);
    const { data, error } = await supabase.from('study_reports').insert({ name, created_by: editor, report, ...(S.id === 2 ? { study: 2 } : {}) }).select('id').single();
    if (error) throw new Error(missingTable(error.message) ? 'Run setup file 016 (supabase/migrations/016_study_reports.sql) first.' : /column/i.test(error.message) ? 'Run setup file 020 (supabase/migrations/020_study2_settings.sql) first.' : error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!Number.isInteger(body?.id)) return NextResponse.json({ error: 'Bad snapshot' }, { status: 400 });
  const { error } = await supabase.from('study_reports').delete().eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
