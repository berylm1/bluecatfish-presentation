'use client';

/**
 * /studyResults: "Ready for the study?" (app/api/study/results/ready). What can be checked is checked each time the
 * page opens (or ↻); the people's checks are ticked here, saved for everyone editing.
 */

import { useCallback, useEffect, useState } from 'react';

type Item = { id: string; group: string; label: string; ok: boolean; detail: string; manual?: boolean };
type State = { ready: boolean; items: Item[] };
type QuizCheck = { lesson: string; slides: number; results: { id: string; q: string; answer: string; verdict: 'taught' | 'partly' | 'not'; slides: number[]; note: string }[] };
const VERDICT = { taught: { icon: '✓', text: 'Taught', tone: 'bg-emerald-600' }, partly: { icon: '~', text: 'Only partly', tone: 'bg-amber-500' }, not: { icon: '✗', text: 'Not in the lesson', tone: 'bg-red-600' } } as const;

export default function StudyChecklist({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizCheck | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  // Each quiz question against the study's lesson, its base slides only (app/api/study/results/quizcheck)
  const checkQuiz = async () => {
    setQuizBusy(true);
    try {
      const r = await fetch('/api/study/results/quizcheck', { method: 'POST' });
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
      const r = await fetch('/api/study/results/ready');
      const d = await r.json();
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setState(d); setError(null); }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const tick = async (id: string, done: boolean) => {
    setState((s) => (s ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, ok: done } : i)) } : s));
    const r = await fetch('/api/study/results/ready', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, done }) });
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
