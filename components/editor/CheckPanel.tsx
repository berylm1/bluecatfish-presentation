'use client';

import { useRef, useState } from 'react';
import type { Slide } from '@/lib/canvas/types';
import type { CheckedClaim } from '@/lib/canvas/checkSlide';
import { fingerprint, slideBasis } from '@/lib/canvas/aiFields';

/*
 * "Check this slide" in the editor's side panel: the slide's facts checked
 * against the knowledge base, each with the file it came from. Results are
 * kept per slide (and marked when the slide has changed since).
 */

const VERDICT: Record<CheckedClaim['verdict'], { icon: string; label: string; box: string }> = {
  contradicted: { icon: '❌', label: 'The sources say something different', box: 'border-red-200 bg-red-50' },
  unsupported: { icon: '⚠️', label: 'Not found in the sources', box: 'border-amber-200 bg-amber-50' },
  supported: { icon: '✅', label: 'In the sources', box: 'border-emerald-200 bg-emerald-50' },
};

type Result = { claims: CheckedClaim[]; excerpts: number; basis: string };

/** One slide checked by the server (throws with the server's message). */
async function checkOne(slide: Slide, lessonTitle: string): Promise<Result> {
  const res = await fetch('/api/editor/check-slide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slide, lessonTitle }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `The check failed (${res.status})`);
  return { claims: d.claims ?? [], excerpts: d.excerpts ?? 0, basis: fingerprint(slideBasis(slide)) };
}

const EVERY_AT_ONCE = 2;   // "Check every slide": slides checked side by side

export default function CheckPanel({ slide, slideNumber, slides, lessonTitle, onGoTo, onGoToSlide }: {
  slide: Slide;
  slideNumber: number;
  /** The whole lesson, for "Check every slide" */
  slides: Slide[];
  lessonTitle: string;
  /** Select an element on this slide */
  onGoTo: (elId: string) => void;
  onGoToSlide: (index: number) => void;
}) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);   // the slide being checked
  const [error, setError] = useState<{ slideId: string; message: string } | null>(null);
  // "Check every slide": how far it got (null = not running), and a way to stop it
  const [every, setEvery] = useState<{ done: number; total: number; failed: number } | null>(null);
  const stopEvery = useRef(false);
  const [summary, setSummary] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});   // slide id → why its check failed (in "Check every slide")
  const result = results[slide.id];
  const basis = fingerprint(slideBasis(slide));

  const check = async () => {
    const id = slide.id;
    setBusy(id);
    setError(null);
    try {
      const r = await checkOne(slide, lessonTitle);
      setResults((all) => ({ ...all, [id]: r }));
      setFailed((f) => { const { [id]: _gone, ...rest } = f; return rest; });
    } catch (e) {
      setError({ slideId: id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  /** Every slide with something to check, two at a time; stoppable; each result kept as it comes. */
  const checkEvery = async () => {
    const todo = slides.filter((s) => s.elements.some((e) => !e.silent || e.type === 'text'));
    stopEvery.current = false;
    setSummary(true);
    setEvery({ done: 0, total: todo.length, failed: 0 });
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !stopEvery.current) {
        const s = todo[next++];
        try {
          const r = await checkOne(s, lessonTitle);
          setResults((all) => ({ ...all, [s.id]: r }));
          setFailed((f) => { const { [s.id]: _gone, ...rest } = f; return rest; });
          setEvery((p) => p && { ...p, done: p.done + 1 });
        } catch (e) {
          setFailed((f) => ({ ...f, [s.id]: e instanceof Error ? e.message : String(e) }));
          setEvery((p) => p && { ...p, done: p.done + 1, failed: p.failed + 1 });
        }
      }
    };
    await Promise.all(Array.from({ length: EVERY_AT_ONCE }, worker));
    setEvery(null);
  };

  // The lesson-wide summary: slides with problems first
  const rows = slides.map((s, i) => {
    const r = results[s.id];
    const n = (v: CheckedClaim['verdict']) => r?.claims.filter((c) => c.verdict === v).length ?? 0;
    return { i, s, r, error: r ? undefined : failed[s.id], bad: n('contradicted'), missing: n('unsupported'), ok: n('supported'), stale: !!r && r.basis !== fingerprint(slideBasis(s)) };
  }).filter((x) => x.r || x.error);
  // problems first, then the ones that couldn't be checked, then the rest in order
  rows.sort((a, b) => b.bad - a.bad || b.missing - a.missing || Number(!!b.error) - Number(!!a.error) || a.i - b.i);

  const counts = result ? (['contradicted', 'unsupported', 'supported'] as const).map((v) => [v, result.claims.filter((c) => c.verdict === v).length] as const) : [];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <h3 className="font-bold text-slate-900">Check slide {slideNumber}</h3>
        <p className="text-xs text-slate-500 mt-1">Checks this slide&apos;s facts (what it shows and what the professor says) against the knowledge base, and shows where each one came from.</p>
      </div>
      <button className="w-full px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50" onClick={check} disabled={busy !== null}>
        {busy === slide.id ? '🔎 Checking…' : result ? '🔎 Check again' : '🔎 Check this slide'}
      </button>
      {error?.slideId === slide.id && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error.message}</p>}
      {result && result.basis !== basis && <p className="text-xs text-amber-800">This slide has changed since it was checked.</p>}
      {/* the whole lesson */}
      <div className="flex gap-2 items-center">
        {every ? (
          <>
            <span className="text-xs text-slate-600 flex-1" role="status">Checking every slide… {every.done} of {every.total}{every.failed ? ` (${every.failed} failed)` : ''}</span>
            <button className="text-xs underline" onClick={() => { stopEvery.current = true; }}>Stop</button>
          </>
        ) : (
          <button className="text-xs text-cyan-700 underline disabled:opacity-50" onClick={checkEvery} disabled={busy !== null}>
            🔎 Check every slide ({slides.length})
          </button>
        )}
        {rows.length > 0 && !every && <button className="text-xs underline ml-auto" onClick={() => setSummary((v) => !v)}>{summary ? 'Hide summary' : 'Summary'}</button>}
      </div>
      {summary && rows.length > 0 && (
        <div className="rounded-md border border-slate-200 p-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Whole lesson</h4>
          <ul className="flex flex-col gap-0.5">
            {rows.map((x) => (
              <li key={x.s.id}>
                <button className={`w-full text-left text-xs px-1.5 py-1 rounded hover:bg-slate-100 ${x.i === slideNumber - 1 ? 'bg-cyan-50' : ''}`} onClick={() => onGoToSlide(x.i)}>
                  <b>Slide {x.i + 1}</b>{x.s.topic ? <span className="text-slate-500"> · {x.s.topic}</span> : null}{' '}
                  <span className="float-right">
                    {x.error ? <span className="text-red-700" title={x.error}>couldn&apos;t check</span>
                      : <>{x.bad ? `❌ ${x.bad} ` : ''}{x.missing ? `⚠️ ${x.missing} ` : ''}{!x.bad && !x.missing ? (x.ok ? '✅' : '—') : ''}{x.stale ? ' · changed' : ''}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <p className="text-xs text-slate-600" role="status">
          {result.claims.length === 0
            ? 'No facts to check on this slide.'
            : counts.filter(([, n]) => n).map(([v, n]) => `${VERDICT[v].icon} ${n}`).join('   ')}
          {result.claims.length > 0 && <span className="text-slate-400"> · from {result.excerpts} excerpt{result.excerpts === 1 ? '' : 's'}</span>}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {result?.claims.map((c, i) => (
          <li key={i} className={`rounded-md border px-2.5 py-2 ${VERDICT[c.verdict].box}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs"><span aria-hidden>{VERDICT[c.verdict].icon}</span> <b>{c.claim}</b></p>
              {c.elId && slide.elements.some((e) => e.id === c.elId) && (
                <button className="text-xs underline shrink-0" onClick={() => onGoTo(c.elId!)}>Show</button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{VERDICT[c.verdict].label}</p>
            {c.sources.map((s, k) => (
              <p key={k} className="text-xs mt-1">
                <span className="text-slate-500">📄 {s.source}</span>
                {s.quote && <span className="block italic text-slate-700">“{s.quote}”</span>}
              </p>
            ))}
            {c.fix && <p className="text-xs mt-1"><span className="text-slate-500">The sources say:</span> {c.fix}</p>}
          </li>
        ))}
      </ul>
      {result && result.claims.some((c) => c.verdict !== 'supported') && (
        <p className="text-xs text-slate-500">“Not found” doesn&apos;t mean wrong: the knowledge base may just not cover it. Add a source in Text upload, or reword it.</p>
      )}
    </div>
  );
}
