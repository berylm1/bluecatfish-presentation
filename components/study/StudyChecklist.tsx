'use client';

/**
 * /studyResults: "Ready for the study?" (app/api/study/results/ready). What can be checked is checked each time the
 * page opens (or ↻); the people's checks are ticked here, saved for everyone editing.
 */

import { useCallback, useEffect, useState } from 'react';

type Item = { id: string; group: string; label: string; ok: boolean; detail: string; manual?: boolean };
type State = { ready: boolean; items: Item[] };

export default function StudyChecklist({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-2 text-sm">{error}</p>}
    </section>
  );
}
