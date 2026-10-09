'use client';

import { useState } from 'react';
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

export default function CheckPanel({ slide, slideNumber, lessonTitle, onGoTo }: {
  slide: Slide;
  slideNumber: number;
  lessonTitle: string;
  /** Select an element on this slide */
  onGoTo: (elId: string) => void;
}) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);   // the slide being checked
  const [error, setError] = useState<{ slideId: string; message: string } | null>(null);
  const result = results[slide.id];
  const basis = fingerprint(slideBasis(slide));

  const check = async () => {
    const id = slide.id;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch('/api/editor/check-slide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slide, lessonTitle }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `The check failed (${res.status})`);
      setResults((r) => ({ ...r, [id]: { claims: d.claims ?? [], excerpts: d.excerpts ?? 0, basis } }));
    } catch (e) {
      setError({ slideId: id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

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
