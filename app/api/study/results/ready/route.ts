import { NextRequest, NextResponse } from 'next/server';
import { readSaved } from '@/lib/canvas/saved';
import { needsAudio, needsIntroAudio, speaksAtAll, storedHere } from '@/lib/canvas/aiFields';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { setupMissing } from '@/lib/setupCheck';
import { CONSENT, STUDY_LESSON, STUDY_LESSON_TITLE, studyOf } from '@/lib/study/content';
import { readDeck } from '@/lib/canvas/store';
import { getStudyVersion } from '@/lib/study/version';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisHealth } from '@/src/redisClient';
import type { Deck, SlideElement } from '@/lib/canvas/types';

/*
 * "Ready for the study?" on /studyResults (editors only: under /api/study/results in lib/editorAuth.ts):
 * what can be checked is checked here, each time; what only a person can check is ticked by them
 * (kept in study_settings.manual, migration 015, so everyone editing sees the same ticks).
 *   GET                  → { ready, items }
 *   POST { id, done }    → tick or untick one of the people's checks
 * ?study=2 / { study: 2 }: static vs adaptive's own (its frozen version, test runs and ticks: study_settings row 2, 020)
 */
const supabase = lazySupabaseAdmin();

type Item = { id: string; group: 'Setup' | 'The lesson' | 'The study'; label: string; ok: boolean; detail: string; manual?: boolean };
// (the consent page's contact line as it came: still to be replaced with the research team's real contact)
const CONTACT_PLACEHOLDER = 'Questions about this study? Contact the research team.';
const MANUAL: { id: string; group: Item['group']; label: string; hint: string }[] = [
  { id: 'extras_checked', group: 'The lesson', label: 'The extras only re-explain the slides', hint: 'The classmates’ questions, their answer slides and the helper slides teach nothing the slides don’t (✨ check them below)' },
  { id: 'quiz_checked', group: 'The study', label: 'The quizzes match the final lesson', hint: 'Every quiz question is answered in the lesson as it is now (lib/study/content.ts)' },
  { id: 'consent_approved', group: 'The study', label: 'The consent page is approved', hint: 'By your advisor or ethics board, as required' },
  { id: 'pilot_done', group: 'The study', label: 'The pilot is done', hint: 'A few real people went through it, and anything they hit is fixed' },
];

const run = async (fn: () => Promise<Omit<Item, 'id' | 'group' | 'label'>>): Promise<Omit<Item, 'id' | 'group' | 'label'>> => {
  try {
    return await Promise.race([fn(), new Promise<never>((_, no) => setTimeout(() => no(new Error('timed out after 15 s')), 15000))]);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
};

/** What's missing in a lesson version: recordings (or recorded for words since changed), and pictures not in this project */
function lessonGaps(deck: Deck): { audio: number; pictures: number } {
  let audio = 0;
  let pictures = 0;
  const look = (els: SlideElement[] | undefined) => {
    for (const e of els ?? []) {
      if (speaksAtAll(e) && needsAudio(e)) audio++;
      if (e.type === 'image' && e.src && !storedHere(e.src)) pictures++;
    }
  };
  deck.slides.forEach((s, i) => {
    look(s.elements);
    look(s.helper?.elements);
    if (needsIntroAudio(deck.slides, i)) audio++;
    if (s.background?.image && !storedHere(s.background.image)) pictures++;
  });
  if (!deck.bank?.off) for (const q of deck.bank?.questions ?? []) look(q.slide?.elements);
  return { audio, pictures };
}

export async function GET(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const S = studyOf(new URL(req.url).searchParams.get('study'));
  const version = await getStudyVersion(S.id);
  const frozen = version.slug ? await readSaved(STUDY_LESSON, version.slug) : null;

  const [setup, services, knowledge, tests, studyLesson, manualRow] = await Promise.all([
    run(async () => {
      const missing = await setupMissing(supabase as never);
      return missing.length ? { ok: false, detail: `Missing: ${missing.join(', ')}. Run the setup files in supabase/migrations.` } : { ok: true, detail: 'Every table, search and storage bucket is there' };
    }),
    run(async () => {
      const [openai, redis] = await Promise.all([
        fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }).then((r) => r.ok).catch(() => false),
        checkRedisHealth().catch(() => false),
      ]);
      const down = [!openai && 'OpenAI', !redis && 'Redis'].filter(Boolean);
      return down.length ? { ok: false, detail: `Not working: ${down.join(', ')} (see /api/health)` } : { ok: true, detail: 'Supabase, OpenAI and Redis all answer' };
    }),
    run(async () => {
      const { count, error } = await supabase.from('documents3').select('*', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return count ? { ok: true, detail: `${count} pieces` } : { ok: false, detail: 'Empty: upload it on /textIngest, or the professor answers from the slides only' };
    }),
    // a finished test run in each of the study's groups, on its frozen version
    run(async () => {
      if (!version.slug) return { ok: false, detail: 'Freeze the lesson first: test runs count on that version' };
      const { data, error } = await supabase.from(S.table).select('study_group').eq('is_test', true).not('finished_at', 'is', null).like('lesson_version', `${version.slug}:%`);
      if (error) throw new Error(/study2/.test(error.message) ? `Run setup file ${S.setup}` : error.message);
      const groups = new Set((data ?? []).map((r: { study_group: string | null }) => r.study_group));
      const missing = S.groups.filter((g) => !groups.has(g)).map((g) => S.names[g]);
      return missing.length
        ? { ok: false, detail: `No finished test run on "${version.name}" yet: ${missing.join(', ')} (${S.path}?test=1, and pick the group)` }
        : { ok: true, detail: `Finished in every group on "${version.name}"` };
    }),
    // the study's lesson: made from the original yet? (app/api/editor/study-lesson)
    Promise.all([readDeck(STUDY_LESSON, 'draft'), readDeck(STUDY_LESSON, 'live')]).then(([d, l]) => ({ draft: !!d?.slides?.length, live: !!l?.slides?.length }), () => ({ draft: false, live: false })),
    supabase.from('study_settings').select('manual').eq('id', S.id).maybeSingle().then((r) => r, () => ({ data: null, error: { message: 'unreachable' } })),
  ]);

  const gaps = frozen ? lessonGaps(frozen) : null;
  const manual = (manualRow.data?.manual ?? {}) as Record<string, { by: string; at: string }>;
  const manualMissing = !!manualRow.error;   // (migration 015 not run: no ticks yet)

  const items: Item[] = [
    { id: 'setup', group: 'Setup', label: 'The database is set up', ...setup },
    { id: 'services', group: 'Setup', label: 'The services answer', ...services },
    { id: 'study_lesson', group: 'The lesson', label: `“${STUDY_LESSON_TITLE}” is made`, ok: studyLesson.live,
      detail: studyLesson.live ? 'Its extras are written from its own slides only' : studyLesson.draft ? 'Made: open it in the editor, Save, then Publish it' : 'Not yet: make it from the original (its slides, none of its extras)' },
    { id: 'frozen', group: 'The lesson', label: 'The lesson is frozen for the study', ok: !!frozen,
      detail: frozen ? `"${version.name}", ${frozen.slides.length} slide${frozen.slides.length === 1 ? "" : "s"}` : version.slug ? `"${version.name}" is no longer saved: pick another` : 'Not frozen: pick a saved version above' },
    { id: 'recordings', group: 'The lesson', label: 'Every sentence has its recording', ok: !!gaps && gaps.audio === 0,
      detail: !gaps ? 'Freeze the lesson first' : gaps.audio ? `${gaps.audio} without one: open the lesson in the editor, Save, publish and save the version again, then freeze that` : 'All recorded' },
    { id: 'pictures', group: 'The lesson', label: 'Every picture is in storage', ok: !!gaps && gaps.pictures === 0,
      detail: !gaps ? 'Freeze the lesson first' : gaps.pictures ? `${gaps.pictures} pointing at the deleted project: see Lesson backup for which` : 'All there' },
    { id: 'knowledge', group: 'The lesson', label: 'The knowledge base is loaded', ...knowledge },
    { id: 'tests', group: 'The study', label: 'A test run finished in every group', ...tests },
    { id: 'contact', group: 'The study', label: 'The consent page has your contact', ok: CONSENT.contact !== CONTACT_PLACEHOLDER,
      detail: CONSENT.contact !== CONTACT_PLACEHOLDER ? CONSENT.contact : 'Still "Contact the research team": put a real email or name in lib/study/content.ts (CONSENT.contact)' },
    ...MANUAL.map((m) => ({
      id: m.id, group: m.group, label: m.label, manual: true, ok: !!manual[m.id],
      detail: manualMissing ? 'Run setup file 015 to tick these' : manual[m.id] ? `Ticked by ${manual[m.id].by}, ${new Date(manual[m.id].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : m.hint,
    })),
  ];
  return NextResponse.json({ ready: items.every((i) => i.ok), items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const editor = await verifyToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!editor) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!MANUAL.some((m) => m.id === body?.id) || typeof body?.done !== 'boolean') return NextResponse.json({ error: 'Bad check' }, { status: 400 });
  const S = studyOf(body?.study);
  const { data, error } = await supabase.from('study_settings').select('manual').eq('id', S.id).maybeSingle();
  if (error) return NextResponse.json({ error: /manual/.test(error.message) ? 'Run setup file 015 (supabase/migrations/015_study_checklist.sql) first.' : error.message }, { status: 500 });
  const manual = { ...((data?.manual ?? {}) as Record<string, unknown>) };
  if (body.done) manual[body.id] = { by: editor, at: new Date().toISOString() };
  else delete manual[body.id];
  const { error: upError } = await supabase.from('study_settings').upsert({ id: S.id, manual }, { onConflict: 'id' });
  if (upError) return NextResponse.json({ error: S.id === 2 && /check|constraint/i.test(upError.message) ? 'Run setup file 020 (supabase/migrations/020_study2_settings.sql) first.' : upError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
