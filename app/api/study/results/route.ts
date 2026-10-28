import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEMOGRAPHICS, POST_QUIZ, PRE_QUIZ, SURVEY } from '@/lib/study/content';
import { ANSWERS } from '@/lib/study/key';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { TOPIC_MAX } from '@/lib/confusion';

/*
 * The study's results, for /studyResults (editors only: under PROTECTED_APIS in lib/editorAuth.ts).
 * One row per person, every answer in its own column (the JSON answers spread out), plus what they
 * did in the lesson (learner_state and events, by its session ids).
 *   ?format=csv   the spreadsheet; otherwise JSON (the rows and a summary per group)
 *   ?tests=1      include our own test runs
 */
let client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!client) client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return client as any;
}

type Row = Record<string, string | number | boolean | null>;
/** Every row of a query, a page at a time (Supabase sends at most 1000 per request) */
async function all(query: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const minutes = (from?: string | null, to?: string | null) => (from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 6000) / 10 : null);

// The lesson's own decisions worth counting (tutor_decision events, app/presentation/page.tsx)
const ACTIONS = ['activity_done', 'activity_done_early', 'activity_wrong', 'activity_skip', 'activity_hint', 'activity_help',
  'activity_finn', 'activity_finn_caught', 'classmate_mistake_answer', 'helper', 'plain', 'bank_answer', 'bank_together'];

/** A topic's confusion, from the lesson's confusion meter (lib/confusion.ts: the confusion_topic events) */
type TopicScore = { topic: number; name: string; score: number; level: string; overall: number; overallLevel: string; at: string; partial: boolean };
/** What one lesson session showed of the confusion meter */
type Confusion = { topics: Map<number, TopicScore>; levels: { at: string; level: string }[]; last: string; mates: { topic: number; action: string; byMeter: boolean }[] };
const CLASSMATE_ACTIONS = ['classmate', 'classmate_mistake', 'classmate_mid', 'classmate_lost', 'classmate_react'];
const MAX_CONFUSED_STRETCH_MS = 10 * 60_000;   // one stretch of "confused" counts at most this long (a tab left open)
const MAX_TOPICS = 50;   // a topic number past this is junk (the browser writes these events: a made-up 1,000,000 would mean a column each)
const LEVELS = ['clear', 'unsure', 'confused'];
/** A score from an event: a number in the meter's range, or null (the browser writes these: never trusted as they come) */
const scoreOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(TOPIC_MAX, Math.max(0, v)) : null);
const levelOf = (v: unknown) => (typeof v === 'string' && LEVELS.includes(v) ? v : '');

/** Minutes the meter's level was "confused": from each level change to the next (or the session's last event) */
function confusedMinutes(c: Confusion): number {
  let ms = 0;
  const lv = [...c.levels].sort((a, b) => a.at.localeCompare(b.at));
  lv.forEach((l, i) => {
    if (l.level !== 'confused') return;
    const to = lv[i + 1]?.at ?? c.last;
    ms += Math.min(MAX_CONFUSED_STRETCH_MS, Math.max(0, Date.parse(to) - Date.parse(l.at)));
  });
  return Math.round(ms / 6000) / 10;
}

/** What each lesson session did: summed over its topics (learner_state), and counted from the events */
async function lessonStats(sessions: string[]) {
  const out = new Map<string, Record<string, number>>();
  const confusion = new Map<string, Confusion>();
  if (!sessions.length) return { out, confusion };
  const add = (s: string, k: string, n: number) => {
    const m = out.get(s) ?? {};
    m[k] = (m[k] ?? 0) + n;
    out.set(s, m);
  };
  const cols = ['questions', 'classmate_turns', 'bank_answers', 'confusion_marks', 'repeats', 'simplify_requests', 'skips', 'barge_ins', 'dwell_ms_total'];
  // (a few hundred sessions at a time: they go in the address)
  const batches: string[][] = [];
  for (let i = 0; i < sessions.length; i += 200) batches.push(sessions.slice(i, i + 200));
  for (const batch of batches) {
    let states: any[];
    try { states = await all(() => db().from('learner_state').select(['session_id', ...cols].join(', ')).in('session_id', batch).order('session_id').order('section')); }
    // (migration 010 not run: no classmate columns)
    catch { states = await all(() => db().from('learner_state').select(['session_id', ...cols.filter((c) => c !== 'classmate_turns' && c !== 'bank_answers')].join(', ')).in('session_id', batch).order('session_id').order('section')); }
    for (const st of states) for (const c of cols) if (typeof st[c] === 'number') add(st.session_id, c, st[c]);
    const events = await all(() => db().from('events').select('id, session_id, section, event_type, value, created_at')
      .in('session_id', batch).in('event_type', ['emotion_state', 'hand_raise', 'presence_away', 'tutor_decision', 'confusion_level', 'confusion_topic']).order('created_at').order('id'));
    for (const e of events) countEvent(e);
  }
  return { out, confusion };
  function meterOf(session: string): Confusion {
    let c = confusion.get(session);
    if (!c) { c = { topics: new Map(), levels: [], last: '', mates: [] }; confusion.set(session, c); }
    return c;
  }
  function countEvent(e: any) {
    const v = e.value ?? {};
    if (e.event_type === 'confusion_topic' || e.event_type === 'confusion_level') {
      const c = meterOf(e.session_id);
      if (e.created_at > c.last) c.last = e.created_at;
      if (e.event_type === 'confusion_level') { if (levelOf(v.level)) c.levels.push({ at: e.created_at, level: v.level }); return; }
      const topic = Number.isInteger(v.topic) ? v.topic : e.section;
      const score = scoreOf(v.score);
      if (!Number.isInteger(topic) || topic < 0 || topic >= MAX_TOPICS || score === null) return;
      const had = c.topics.get(topic);
      // the latest snapshot of a topic counts (one taken as it ended beats a partial one, when the tab was hidden, taken before it)
      if (had && !had.partial && v.partial) return;
      c.topics.set(topic, { topic, name: String(v.name ?? '').slice(0, 80), score, level: levelOf(v.level), overall: scoreOf(v.overall) ?? 0, overallLevel: levelOf(v.overallLevel), at: e.created_at, partial: !!v.partial });
      return;
    }
    if (e.event_type === 'emotion_state') add(e.session_id, `face_${e.value?.state ?? 'other'}`, 1);
    else if (e.event_type === 'tutor_decision') {
      if (ACTIONS.includes(v.action)) add(e.session_id, v.action, 1);
      if (v.byMeter === true) add(e.session_id, 'helped_by_meter', 1);
      if (CLASSMATE_ACTIONS.includes(v.action) && Number.isInteger(e.section) && e.section < MAX_TOPICS) meterOf(e.session_id).mates.push({ topic: e.section, action: v.action, byMeter: v.byMeter === true });
      if (e.created_at > (confusion.get(e.session_id)?.last ?? '')) meterOf(e.session_id).last = e.created_at;
    }
    else add(e.session_id, e.event_type, 1);
  }
}

export async function GET(request: NextRequest) {
  // (the editor gate in proxy.ts covers this too; checked here as well, so these answers never depend on one place)
  if (!(await verifyToken(request.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked: unlock the editor first (/unlock).' }, { status: 401 });
  const url = new URL(request.url);
  const tests = url.searchParams.get('tests') === '1';
  let people: any[];
  try {
    people = await all(() => {
      const q = db().from('study_participants').select('*').order('created_at', { ascending: true }).order('id');
      return tests ? q : q.eq('is_test', false);
    });
  } catch (error: any) {
    const missing = /study_participants|schema cache|does not exist/i.test(error?.message ?? '');
    return NextResponse.json({ error: missing ? 'Run migration 011 in Supabase first.' : 'Could not read the results.' }, { status: missing ? 503 : 500 });
  }

  const sessionsOf = (p: any): string[] => (p.lesson_session ? String(p.lesson_session).split(' ').filter(Boolean) : []);
  // (the lesson's counts can't be read: the answers still come, with those columns empty)
  const { out: stats, confusion } = await lessonStats(people.flatMap(sessionsOf)).catch((e) => {
    console.error('study results:', e);
    return { out: new Map<string, Record<string, number>>(), confusion: new Map<string, Confusion>() };
  });
  const LESSON_COLS = ['questions', 'classmate_turns', 'bank_answers', 'confusion_marks', 'repeats', 'simplify_requests', 'skips', 'barge_ins', 'dwell_ms_total', 'face_confused', 'face_bored', 'hand_raise', 'presence_away', ...ACTIONS, 'helped_by_meter'];
  // The confusion meter, per person: their sessions together (a later session's topic replaces an earlier one's)
  const meterOf = (p: any) => {
    const topics = new Map<number, TopicScore>();
    const mates: Confusion['mates'] = [];
    let minutesConfused = 0;
    let any = false;
    for (const s of sessionsOf(p)) {
      const c = confusion.get(s);
      if (!c || (!c.topics.size && !c.levels.length)) continue;   // (a session from before the meter)
      any = true;
      // (the latest; but a later partial snapshot, the tab hidden, never replaces one taken as the topic ended)
      for (const [t, sc] of c.topics) { const had = topics.get(t); if (!had || (had.at <= sc.at && !(sc.partial && !had.partial))) topics.set(t, sc); }
      mates.push(...c.mates);
      minutesConfused += confusedMinutes(c);
    }
    return any ? { topics, mates, minutesConfused: Math.round(minutesConfused * 10) / 10 } : null;
  };
  const meters = new Map(people.map((p: any) => [p.id, meterOf(p)]));
  // a column per topic (the lesson's topics, in order: topic 1, 2, …)
  const topicCount = Math.max(0, ...[...meters.values()].flatMap((m) => (m ? [...m.topics.keys()].map((t) => t + 1) : [])));

  const rows: Row[] = people.map((p: any) => {
    const r: Row = {
      id: p.id, created_at: p.created_at, is_test: p.is_test, step: p.step, group: p.study_group, finished: !!p.finished_at,
      // the lesson version they saw (migration 014: "slug:Name", shown by its name)
      lesson_version: typeof p.lesson_version === 'string' ? (p.lesson_version.includes(':') ? p.lesson_version.split(':').slice(1).join(':') : p.lesson_version) : null,
    };
    for (const d of DEMOGRAPHICS) r[d.id] = p[d.id];
    Object.assign(r, {
      seen_before_browser: p.seen_before_browser, device: p.device, screen: p.screen,
      sound_ok: p.sound_ok, mic_ok: p.mic_ok, camera_ok: p.camera_ok,
      lesson_minutes: minutes(p.lesson_started_at, p.lesson_finished_at),
      total_minutes: minutes(p.consent_at, p.finished_at),
      pre_score: p.pre_score, post_same_score: p.post_same_score, gain: p.pre_score != null && p.post_same_score != null ? p.post_same_score - p.pre_score : null,
      post_score: p.post_score,
    });
    // what they did in the lesson (all their sessions together)
    const did: Record<string, number> = {};
    for (const s of sessionsOf(p)) for (const [k, n] of Object.entries(stats.get(s) ?? {})) did[k] = (did[k] ?? 0) + n;
    for (const c of LESSON_COLS) r[`lesson_${c}`] = sessionsOf(p).length ? did[c] ?? 0 : null;
    // the confusion meter (empty when it wasn't in the lesson yet, or migration 012 wasn't run)
    const m = meters.get(p.id);
    const scores = m ? [...m.topics.values()] : [];
    const last = scores.filter((t) => !t.partial).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? scores.sort((a, b) => a.at.localeCompare(b.at)).pop();
    const max = scores.reduce<TopicScore | null>((b, t) => (!b || t.score > b.score ? t : b), null);
    Object.assign(r, {
      confusion_end_overall: last?.overall ?? null,
      confusion_end_level: last?.overallLevel ?? null,
      confusion_max_topic_score: max?.score ?? null,
      confusion_max_topic: max ? max.name || `topic ${max.topic + 1}` : null,
      confusion_topics_confused: m ? scores.filter((t) => t.level === 'confused').length : null,
      confusion_minutes_confused: m ? m.minutesConfused : null,
    });
    for (let t = 0; t < topicCount; t++) r[`confusion_topic_${t + 1}`] = m?.topics.get(t)?.score ?? null;
    // every answer
    for (const [phase, qs, saved] of [['pre', PRE_QUIZ, p.pre_quiz], ['post', POST_QUIZ, p.post_quiz]] as const) {
      for (const qq of qs) {
        const a = saved?.answers?.[qq.id] ?? null;
        r[`${phase}_${qq.id}`] = a;
        if (qq.kind === 'choice') r[`${phase}_${qq.id}_right`] = a == null ? null : a === ANSWERS[qq.id];
        r[`${phase}_${qq.id}_sec`] = saved?.times?.[qq.id] != null ? Math.round(saved.times[qq.id] / 100) / 10 : null;
      }
    }
    for (const s of SURVEY) r[`survey_${s.id}`] = p.survey?.answers?.[s.id] ?? null;
    r.lesson_sessions = sessionsOf(p).join(' ');
    return r;
  });

  if (url.searchParams.get('format') === 'csv') {
    const cols = Object.keys(rows[0] ?? { id: '' });
    const cell = (v: unknown) => {
      if (v == null) return '';
      let s = String(v);
      // (typed answers that start like a formula, "=HYPERLINK(…)", would run in Excel: kept as text)
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
    return new NextResponse('﻿' + csv, {   // (the BOM: Excel reads the dashes and quotes right)
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="study-results-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }

  // A summary per group (finished people only, for the averages)
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
  const summary = ['classmates', 'no_classmates', null].map((g) => {
    const mine = rows.filter((r) => r.group === g);
    const done = mine.filter((r) => r.finished);
    return {
      group: g, people: mine.length, finished: done.length,
      pre: avg(done.map((r) => r.pre_score as number)), postSame: avg(done.map((r) => r.post_same_score as number)),
      gain: avg(done.map((r) => r.gain as number)), post: avg(done.map((r) => r.post_score as number)),
      lessonMinutes: avg(done.map((r) => r.lesson_minutes as number)), questions: avg(done.map((r) => r.lesson_questions as number)),
      enjoy: avg(done.map((r) => r.survey_enjoy as number)),
    };
  });
  const steps = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [String(r.step)]: (m[String(r.step)] ?? 0) + 1 }), {});
  // The confusion graph: each person's topic scores, and where a classmate spoke
  const names: string[] = [];
  for (const m of meters.values()) for (const t of m?.topics.values() ?? []) if (t.name && !names[t.topic]) names[t.topic] = t.name;
  const curves = people.flatMap((p: any) => {
    const m = meters.get(p.id);
    if (!m || !m.topics.size) return [];
    return [{
      id: p.id, group: p.study_group, finished: !!p.finished_at,
      scores: Array.from({ length: topicCount }, (_, t) => m.topics.get(t)?.score ?? null),
      mates: m.mates.map((x) => ({ topic: x.topic, byMeter: x.byMeter, action: x.action })),
    }];
  });
  return NextResponse.json({ summary, steps, rows, confusion: { topics: Array.from({ length: topicCount }, (_, t) => names[t] || `Topic ${t + 1}`), curves } });
}
