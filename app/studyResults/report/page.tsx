'use client';

/**
 * /studyResults/report: the pilot report (editors only: under /studyResults in lib/editorAuth.ts).
 * Live by default (everyone so far); "Save snapshot" keeps it as it is now under a name ("After 5 people"),
 * shown as cards to open again or compare two side by side; "Print / PDF" prints the report alone.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ReportView from '@/components/study/ReportView';
import type { Report } from '@/lib/study/report';

type Snap = { id: number; name: string; created_at: string; created_by: string | null; people: number | null };
type Shown = { key: string; title: string; report: Report };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function PilotReport() {
  const [tests, setTests] = useState(false);
  const [live, setLive] = useState<Report | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [snapsMissing, setSnapsMissing] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, Report>>({});   // snapshots opened so far, by id
  const [picked, setPicked] = useState<string[]>(['live']);          // what's shown: one, or two to compare
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/study/results/report${tests ? '?tests=1' : ''}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? `Error ${r.status}`); return; }
      setLive(d.report); setSnaps(d.snapshots ?? []); setSnapsMissing(!!d.snapshotsMissing); setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [tests]);
  useEffect(() => { load(); }, [load]);

  // a snapshot's report, fetched the first time it's opened
  useEffect(() => {
    for (const key of picked) {
      if (key === 'live' || loaded[key]) continue;
      fetch(`/api/study/results/report?snapshot=${key}`).then((r) => r.json()).then((d) => {
        if (d.snapshot?.report) setLoaded((m) => ({ ...m, [key]: d.snapshot.report }));
        else setError(d.error ?? 'Could not open that snapshot');
      }).catch((e) => setError(String(e)));
    }
  }, [picked, loaded]);

  const open = (key: string) => setPicked([key]);
  const toggleCompare = (key: string) => setPicked((p) => (p.includes(key) ? (p.length > 1 ? p.filter((k) => k !== key) : p) : [...p.slice(-1), key]));

  const save = async () => {
    const name = window.prompt('Name this snapshot (e.g. “After 5 people”)', `After ${live?.people ?? 0} people`);
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/study/results/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, tests }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else await load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async (s: Snap) => {
    if (!window.confirm(`Delete the snapshot “${s.name}”? This can't be undone.`)) return;
    const r = await fetch('/api/study/results/report', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`);
    setPicked((p) => (p.filter((k) => k !== String(s.id)).length ? p.filter((k) => k !== String(s.id)) : ['live']));
    load();
  };

  const shown: Shown[] = picked.flatMap((key) => {
    if (key === 'live') return live ? [{ key, title: 'Now (live)', report: live }] : [];
    const s = snaps.find((x) => String(x.id) === key);
    return loaded[key] && s ? [{ key, title: `${s.name} · ${when(s.created_at)}`, report: loaded[key] }] : [];
  });

  const card = (key: string, title: string, sub: string, snap?: Snap) => {
    const on = picked.includes(key);
    return (
      <div key={key} className={`relative shrink-0 w-52 rounded-xl border bg-white p-3 flex flex-col gap-1 ${on ? 'border-cyan-600 ring-2 ring-cyan-600/20' : 'hover:border-slate-400'}`}>
        <button onClick={() => open(key)} className="text-left">
          <span className="block font-semibold text-sm truncate pr-5" title={title}>{title}</span>
          <span className="block text-xs text-slate-500">{sub}</span>
        </button>
        <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer w-fit">
          <input type="checkbox" checked={on && picked.length > 1} onChange={() => toggleCompare(key)} className="accent-cyan-600" /> Compare
        </label>
        {snap && <button onClick={() => remove(snap)} aria-label={`Delete ${snap.name}`} title="Delete this snapshot" className="absolute top-2 right-2 text-slate-400 hover:text-red-700 text-sm leading-none">✕</button>}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 print:bg-white print:p-0">
      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">Pilot report</h1>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Include test runs</label>
            <button onClick={save} disabled={busy || !live || snapsMissing} title={snapsMissing ? 'Run setup file 016 first' : 'Keep the report as it is now'}
              className="px-4 py-2 rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-40 text-sm font-semibold">{busy ? 'Saving…' : '📌 Save snapshot'}</button>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold">🖨 Print / PDF</button>
            <Link href="/studyResults" className="text-sm underline text-cyan-700">Study results</Link>
          </div>
        </header>
        {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3 text-sm print:hidden">{error}</p>}
        {snapsMissing && <p className="rounded-lg bg-amber-100 text-amber-900 px-4 py-2 text-sm print:hidden">To save snapshots, run setup file 016 (supabase/migrations/016_study_reports.sql) in Supabase.</p>}

        <nav aria-label="Reports" className="print:hidden">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {card('live', 'Now (live)', live ? `${live.people} ${live.people === 1 ? 'person' : 'people'} so far` : 'Loading…')}
            {snaps.map((s) => card(String(s.id), s.name, `${when(s.created_at)} · ${s.people ?? '?'} ${s.people === 1 ? 'person' : 'people'}${s.created_by ? ` · ${s.created_by}` : ''}`, s))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Click a card to open it; tick Compare on two to see them side by side.</p>
        </nav>

        {shown.length === 0 ? <p className="text-slate-500">Loading…</p> : (
          <div className={`grid gap-5 items-start ${shown.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {shown.map((s) => (
              <div key={s.key} className="flex flex-col gap-3 min-w-0">
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <ReportView report={s.report} compact={shown.length > 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
