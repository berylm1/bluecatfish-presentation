import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rateLimit';
import { DEMOGRAPHICS, GROUPS, POST_QUIZ, PRE_QUIZ, STUDY_VERSION, surveyFor, type QuizQuestion } from '@/lib/study/content';
import { ANSWERS, score } from '@/lib/study/key';
import { studyDeck } from '@/lib/study/version';

/*
 * The online study (app/study): one row per person in study_participants (migration 011), saved
 * step by step so someone who stops halfway is still counted where they stopped.
 *   join    consent given: a new row, its id back (the browser keeps it); next, the sound/mic/camera checks
 *   get     where they are (coming back after a refresh), and their group
 *   save    a step's answers (demographics, the checks, the lesson's session, timings)
 *   pre     the pre-quiz (once: it can't be answered again after the lesson)
 *   assign  Start: their group (study_assign keeps the groups even; a test run may pick one)
 *   post    the post-quiz (once)
 *   survey  the questionnaire (once): the end, and how they did on the quizzes
 * The id is a random uuid: knowing it is what lets a browser write to that row.
 * Each step needs the one before it (so the answers can't be had early: the right answers come back
 * only once the post-quiz and the questionnaire are in), and a save can only move a person one step on.
 */
let client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!client) client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return client as any;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = ['consent', 'checks', 'about', 'pre', 'start', 'lesson', 'post', 'survey', 'done'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 6 * 3600_000) : null);
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const at = (step: string) => STEPS.indexOf(step);
// What a save may move someone on to, from where (the rest move on with their own action)
const SAVE_STEPS: Record<string, string[]> = { about: ['checks'], pre: ['about'], post: ['lesson'] };

/** Only answers to these questions, in their form (a choice's letter, or text up to 2000) */
function cleanAnswers(questions: QuizQuestion[], raw: any) {
  const answers: Record<string, string> = {};
  const times: Record<string, number> = {};
  for (const q of questions) {
    const a = raw?.answers?.[q.id];
    if (q.kind === 'choice' && typeof a === 'string' && q.choices.some((c) => c.id === a)) answers[q.id] = a;
    if (q.kind === 'text' && typeof a === 'string') answers[q.id] = a.trim().slice(0, 2000);
    const t = ms(raw?.times?.[q.id]);
    if (t !== null) times[q.id] = t;
  }
  return { version: STUDY_VERSION, answers, times, ms: ms(raw?.ms) };
}

/** What they answered and what was right (shown at the very end) */
function review(questions: QuizQuestion[], answers: Record<string, string>) {
  return questions.filter((q) => q.kind === 'choice').map((q) => {
    const c = q.kind === 'choice' ? q.choices : [];
    return { id: q.id, q: q.q, yours: c.find((x) => x.id === answers[q.id])?.text ?? null, right: c.find((x) => x.id === ANSWERS[q.id])?.text ?? '', correct: answers[q.id] === ANSWERS[q.id] };
  });
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'study');
  if (limited) return limited;
  let body: any;
  try { body = await request.json(); } catch { return fail('Bad request'); }
  const action = body?.action;
  const supabase = db();

  try {
    if (action === 'join') {
      // (a new row each time: tighter, so a script can't fill the table with fake people)
      const joinLimited = await rateLimit(request, 'studyJoin');
      if (joinLimited) return joinLimited;
      const { data, error } = await supabase.from('study_participants').insert({
        is_test: body.test === true,
        step: 'checks',
        consent_at: new Date().toISOString(),
        seen_before_browser: bool(body.seenBefore),
        device: str(body.device, 300),
        screen: str(body.screen, 40),
      }).select('id').single();
      if (error) throw error;
      return NextResponse.json({ id: data.id });
    }

    const id = body?.id;
    if (typeof id !== 'string' || !UUID.test(id)) return fail('id required');
    const { data: row, error: readError } = await supabase.from('study_participants')
      .select('id, step, study_group, is_test, pre_quiz, post_quiz, survey, lesson_started_at, lesson_finished_at, lesson_session').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!row) return fail('Not found', 404);
    const update = async (fields: Record<string, unknown>) => {
      const { error } = await supabase.from('study_participants').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    };
    // Steps only go forward (a stale tab can't send someone back)
    const forward = (step: unknown) => (typeof step === 'string' && STEPS.indexOf(step) > STEPS.indexOf(row.step) ? { step } : {});

    if (action === 'get') return NextResponse.json({ step: row.step, group: row.study_group, test: row.is_test });

    if (action === 'save') {
      const fields: Record<string, unknown> = SAVE_STEPS[body.step]?.includes(row.step) ? { step: body.step } : {};
      if (body.about && typeof body.about === 'object') {
        for (const d of DEMOGRAPHICS) {
          const v = str(body.about[d.id], d.text ? 200 : 60);
          if (v !== null && (d.text || d.choices?.includes(v))) fields[d.id] = v;
        }
      }
      if (body.checks && typeof body.checks === 'object') {
        for (const k of ['sound_ok', 'mic_ok', 'camera_ok'] as const) if (bool(body.checks[k]) !== null) fields[k] = body.checks[k];
      }
      const session = str(body.lessonSession, 64);
      // (each start of the lesson is a new session: a refresh, picking up where they were; all of them kept, space-separated)
      const sessions: string[] = row.lesson_session ? String(row.lesson_session).split(' ') : [];
      if (session && /^[\w-]+$/.test(session) && !sessions.includes(session) && sessions.length < 20) fields.lesson_session = [...sessions, session].join(' ');
      if (body.lessonStarted === true && !row.lesson_started_at) fields.lesson_started_at = new Date().toISOString();
      if (body.lessonFinished === true && !row.lesson_finished_at) fields.lesson_finished_at = new Date().toISOString();
      if (Object.keys(fields).length) await update(fields);
      return NextResponse.json({ ok: true });
    }

    if (action === 'pre') {
      if (row.pre_quiz) return NextResponse.json({ ok: true });   // (once)
      if (row.step !== 'pre') return fail('Answer the questions about you first');
      const pre = cleanAnswers(PRE_QUIZ, body);
      await update({ pre_quiz: pre, pre_score: score(PRE_QUIZ, pre.answers).right, ...forward('start') });
      return NextResponse.json({ ok: true });
    }

    if (action === 'assign') {
      if (!row.pre_quiz) return fail('Do the first quiz first');
      let group: string | null = row.study_group;
      // a test run can choose (to try both); everyone else gets the group with fewer people
      if (!group && row.is_test && GROUPS.includes(body.group)) {
        group = body.group;
        await update({ study_group: group });
      }
      if (!group) {
        const { data, error } = await supabase.rpc('study_assign', { p_id: id });
        if (!error && GROUPS.includes(data)) group = data;
        else {
          // (the function can't be reached, e.g. no permission to run it: the same choice here, without its lock)
          console.error('study_assign:', error?.message ?? data);
          const count = async (g: string) => (await supabase.from('study_participants').select('id', { count: 'exact', head: true }).eq('is_test', false).eq('study_group', g)).count ?? 0;
          const [withMates, without] = await Promise.all([count('classmates'), count('no_classmates')]);
          group = withMates < without ? 'classmates' : without < withMates ? 'no_classmates' : Math.random() < 0.5 ? 'classmates' : 'no_classmates';
          await update({ study_group: group });
        }
      }
      // the lesson version they'll see (the one the study is frozen to now), recorded once (migration 014)
      const { version } = await studyDeck(null).catch(() => ({ version: null }));
      if (version) {
        const { error: vError } = await supabase.from('study_participants').update({ lesson_version: version }).eq('id', id).is('lesson_version', null);
        if (vError && !/lesson_version/.test(vError.message)) throw vError;   // (column missing: migration 014 not run yet)
      }
      await update(forward('lesson'));
      return NextResponse.json({ group });
    }

    if (action === 'post') {
      if (row.post_quiz) return NextResponse.json({ ok: true });
      if (!row.study_group || at(row.step) < at('lesson')) return fail('Do the lesson first');
      const post = cleanAnswers(POST_QUIZ, body);
      const s = score(POST_QUIZ, post.answers);
      await update({ post_quiz: post, post_score: s.right, post_same_score: s.same, ...forward('survey') });
      return NextResponse.json({ ok: true });
    }

    if (action === 'survey') {
      // (the right answers come back below: only once the post-quiz is in)
      if (!row.post_quiz) return fail('Do the second quiz first');
      if (!row.survey) {
        const items = surveyFor(row.study_group);
        const answers: Record<string, string | number> = {};
        for (const it of items) {
          const v = body.answers?.[it.id];
          if (it.kind === 'scale' && Number.isInteger(v) && v >= 1 && v <= 5) answers[it.id] = v;
          if (it.kind === 'pick' && typeof v === 'string' && it.choices.includes(v)) answers[it.id] = v;
          if (it.kind === 'text' && typeof v === 'string' && v.trim()) answers[it.id] = v.trim().slice(0, 2000);
        }
        await update({ survey: { version: STUDY_VERSION, answers, ms: ms(body.ms) }, finished_at: new Date().toISOString(), ...forward('done') });
      }
      // How they did (only now: after this nothing can be answered again)
      const { data: done } = await supabase.from('study_participants').select('pre_quiz, post_quiz, pre_score, post_score').eq('id', id).single();
      const preA = done?.pre_quiz?.answers ?? {};
      const postA = done?.post_quiz?.answers ?? {};
      return NextResponse.json({
        pre: { right: done?.pre_score ?? 0, of: PRE_QUIZ.length },
        post: { right: done?.post_score ?? 0, of: POST_QUIZ.filter((q) => q.kind === 'choice').length },
        review: { pre: review(PRE_QUIZ, preA), post: review(POST_QUIZ, postA) },
      });
    }

    return fail('Unknown action');
  } catch (e) {
    console.error('study:', e);
    const msg = e instanceof Error ? e.message : String((e as any)?.message ?? e);
    // Migration 011 not run yet
    if (/study_participants|study_assign|schema cache|does not exist/i.test(msg)) return fail('The study isn’t set up yet (run migration 011 in Supabase).', 503);
    return fail('Something went wrong saving that. Please try again.', 500);
  }
}
