'use client';

/**
 * /studyResults: "Ready for the study?" (app/api/study/results/ready). What can be checked is checked each time the
 * page opens (or ↻); the people's checks are ticked here, saved for everyone editing.
 */

import { useCallback, useEffect, useState } from 'react';
import type { StudyId } from '@/lib/study/content';

type Item = { id: string; group: string; label: string; ok: boolean; detail: string; manual?: boolean };
type State = { ready: boolean; items: Item[] };
type QuizCheck = { lesson: string; slides: number; results: { id: string; q: string; answer: string; verdict: 'taught' | 'partly' | 'not'; slides: number[]; note: string }[] };
type ExtrasCheck = { lesson: string; slides: number; extras: number; results: { id: string; kind: 'bank' | 'helper'; where: string; label: string; added: string[] | null }[] };
const VERDICT = { taught: { icon: '✓', text: 'Taught', tone: 'bg-emerald-600' }, partly: { icon: '~', text: 'Only partly', tone: 'bg-amber-500' }, not: { icon: '✗', text: 'Not in the lesson', tone: 'bg-red-600' } } as const;

/** which: the study (each has its own frozen version, test runs and ticks) */
export default function StudyChecklist({ refreshKey = 0, which = 1 }: { refreshKey?: number; which?: StudyId }) {
  const post = (path: string) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ study: which }) });
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizCheck | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  // The study's lesson's extras against its slides (app/api/study/results/extrascheck), and making the lesson
  const [extras, setExtras] = useState<ExtrasCheck | null>(null);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const checkExtras = async () => {
    setExtrasBusy(true);
    try {
      const r = await post('/api/study/results/extrascheck');
      const d = await r.json();
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setExtras(d); setError(null); }
    } catch (e) {
      setError(String(e));
    } finally {
      setExtrasBusy(false);
    }
  };
  const [making, setMaking] = useState(false);
  const makeStudyLesson = async () => {
    if (!window.confirm('Make “Blue Catfish (study)” from the original lesson? Its slides are copied (with their recordings); its classmate questions and helper slides are written again when you save it, from its slides only.')) return;
    setMaking(true);
    try {
      const r = await fetch('/api/editor/study-lesson', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setError(d.warnings?.length ? d.warnings.join(' · ') : null); window.open(`/slideEditor?lesson=${encodeURIComponent(d.lesson.id)}`, '_blank', 'noopener'); }
    } finally {
      setMaking(false);
      load();
    }
  };
  // Each quiz question against the study's lesson, its base slides only (app/api/study/results/quizcheck)
  const checkQuiz = async () => {
    setQuizBusy(true);
    try {
      const r = await post('/api/study/results/quizcheck');
      const d = await r.json();
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setQuiz(d); setError(null); }
    } catch (e) {
      setError(String(e));
    } finally {
      setQuizBusy(false);
    }
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/study/results/ready${which === 2 ? '?study=2' : ''}`);
      const d = await r.json();
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setState(d); setError(null); }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [which]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const tick = async (id: string, done: boolean) => {
    setState((s) => (s ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, ok: done } : i)) } : s));
    const r = await fetch('/api/study/results/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, done, study: which }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`);
    load();
  };

  if (!state) return error ? <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3 text-sm">{error}</p> : null;
  const left = state.items.filter((i) => !i.ok).length;
  const groups = [...new Set(state.items.map((i) => i.group))];
  return (
    <section className="rounded-2xl bg-white border p-5 flex flex-col gap-4" aria-labelledby="ready-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ready-title" className="font-semibold flex-1">Ready for the study?</h2>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${state.ready ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
          {state.ready ? '✓ Ready' : `${left} of ${state.items.length} left`}
        </span>
        <button onClick={load} disabled={busy} className="text-sm underline text-cyan-700 disabled:opacity-50">{busy ? 'Checking…' : '↻ Check again'}</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
            <ul className="flex flex-col gap-2">
              {state.items.filter((i) => i.group === g).map((i) => (
                <li key={i.id} className="flex gap-2.5 items-start">
                  {i.manual ? (
                    <input type="checkbox" checked={i.ok} onChange={(e) => tick(i.id, e.target.checked)} aria-label={i.label}
                      className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0 cursor-pointer" />
                  ) : (
                    <span aria-hidden className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[10px] leading-4 text-center font-bold text-white ${i.ok ? 'bg-emerald-600' : 'bg-amber-500'}`}>{i.ok ? '✓' : '!'}</span>
                  )}
                  <span className="text-sm leading-snug">
                    <span className="font-medium">{i.label}</span>
                    <span className="sr-only">{i.ok ? ' (done)' : ' (to do)'}</span>
                    <span className={`block text-xs ${i.ok ? 'text-slate-500' : 'text-amber-800'}`}>{i.detail}</span>
                    {i.id === 'study_lesson' && !i.ok && /^Not yet/.test(i.detail) && (
                      <button onClick={makeStudyLesson} disabled={making} className="mt-1 text-xs underline text-cyan-700 disabled:opacity-50">{making ? 'Making it…' : '⧉ Make it from the original'}</button>
                    )}
                    {i.id === 'extras_checked' && (
                      <button onClick={checkExtras} disabled={extrasBusy} className="mt-1 text-xs underline text-cyan-700 disabled:opacity-50">
                        {extrasBusy ? 'Checking every extra… (a minute or two)' : '✨ Check the extras against the slides'}
                      </button>
                    )}
                    {i.id === 'quiz_checked' && (
                      <button onClick={checkQuiz} disabled={quizBusy} className="mt-1 text-xs underline text-cyan-700 disabled:opacity-50">
                        {quizBusy ? 'Checking every question… (about a minute)' : '✨ Check them against the lesson'}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {extras && (
        <div className="border-t pt-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold text-sm flex-1">The extras against {extras.lesson} ({extras.slides} slides)</h3>
            <span className="text-xs text-slate-500">
              {extras.results.filter((r) => r.added && r.added.length === 0).length} of {extras.extras} add nothing · the classmates’ questions with their answer slides, and the helper slides
            </span>
            <button onClick={() => setExtras(null)} className="text-xs underline text-slate-500">Close</button>
          </div>
          {extras.extras === 0 ? <p className="mt-2 text-sm text-slate-600">No extras yet: Save the study’s lesson in the editor to write them.</p> : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {/* (the ones adding something first) */}
              {[...extras.results].sort((a, b) => (b.added?.length ?? 99) - (a.added?.length ?? 99)).map((r) => {
                const v = r.added === null ? VERDICT.partly : r.added.length ? VERDICT.not : VERDICT.taught;
                return (
                  <li key={r.id} className="flex gap-2.5 items-start text-sm">
                    <span aria-hidden className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[10px] leading-4 text-center font-bold text-white ${v.tone}`}>{v.icon}</span>
                    <span className="leading-snug">
                      <span className="font-medium">{r.kind === 'bank' ? `A classmate asks: “${r.label}”` : r.label}</span>
                      <span className="sr-only"> ({r.added === null ? 'not checked' : r.added.length ? 'adds facts' : 'adds nothing'})</span>
                      <span className="block text-xs text-slate-500">{r.kind === 'bank' ? 'Question bank' : 'Helper slide'} · {r.where}</span>
                      {r.added === null && <span className="block text-xs text-amber-800">The check skipped this one: check again</span>}
                      {r.added && r.added.length > 0 && <span className="block text-xs text-red-800">Adds: {r.added.join('; ')}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">The AI&apos;s reading. Fix or delete what adds something in the editor (the topic&apos;s questions, or the slide&apos;s helper), Save and Publish, then check again and tick “The extras only re-explain the slides” above.</p>
        </div>
      )}
      {quiz && (
        <div className="border-t pt-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold text-sm flex-1">The quizzes against {quiz.lesson} ({quiz.slides} slides)</h3>
            <span className="text-xs text-slate-500">
              {quiz.results.filter((r) => r.verdict === 'taught').length} of {quiz.results.length} taught · the base slides only (no helper slides, classmates or introductions)
            </span>
            <button onClick={() => setQuiz(null)} className="text-xs underline text-slate-500">Close</button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {quiz.results.map((r) => (
              <li key={r.id} className="flex gap-2.5 items-start text-sm">
                <span aria-hidden className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[10px] leading-4 text-center font-bold text-white ${VERDICT[r.verdict].tone}`}>{VERDICT[r.verdict].icon}</span>
                <span className="leading-snug">
                  <span className="font-medium">{r.q}</span>
                  <span className="sr-only"> ({VERDICT[r.verdict].text})</span>
                  <span className="block text-xs text-slate-500">
                    {r.id.startsWith('s') ? 'Written answer' : <>Answer: {r.answer}</>}
                    {r.slides.length > 0 && <> · slide{r.slides.length === 1 ? '' : 's'} {r.slides.join(', ')}</>}
                  </span>
                  {r.note && <span className={`block text-xs ${r.verdict === 'taught' ? 'text-slate-600' : 'text-amber-800'}`}>{r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">The AI&apos;s reading: look over anything not ✓, then tick “The quizzes match the final lesson” above. Questions are in lib/study/content.ts.</p>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-2 text-sm">{error}</p>}
    </section>
  );
}
