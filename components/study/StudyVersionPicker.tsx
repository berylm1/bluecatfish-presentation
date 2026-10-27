'use client';

/**
 * /studyResults: the lesson version the study plays (app/api/study/results/version). Frozen to one saved version,
 * editing or publishing the lesson doesn't change it for people taking part; none picked, they get the live lesson.
 */

import { useEffect, useState } from 'react';

type Version = { slug: string; name: string; savedAt: string; slides: number };
type State = { lesson: string; current: { slug: string | null; name: string | null; setAt: string | null; setBy: string | null }; versions: Version[]; seen: Record<string, number> };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function StudyVersionPicker({ onChange }: { onChange?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch('/api/study/results/version').then(async (r) => {
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? `Error ${r.status}`); return; }
    setState(d);
    setPick(d.current.slug ?? '');
  }).catch((e) => setError(String(e)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!state) return;
    const already = Object.values(state.seen).reduce((a, b) => a + b, 0);
    const name = state.versions.find((v) => v.slug === pick)?.name ?? 'the live lesson (not frozen)';
    if (already && !window.confirm(`${already} ${already === 1 ? 'person has' : 'people have'} already taken part. From now on, new people get "${name}". Each person's row keeps the version they saw. Change it?`)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/study/results/version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: pick || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { await load(); onChange?.(); }
    } finally {
      setBusy(false);
    }
  };

  if (!state) return error ? <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3 text-sm">{error}</p> : null;
  const now = state.current;
  const seen = Object.entries(state.seen);
  return (
    <section className="rounded-2xl bg-white border p-5 flex flex-col gap-3">
      <h2 className="font-semibold">Lesson for the study</h2>
      <div className="flex flex-wrap items-center gap-3">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-72">
          <option value="">The live lesson (not frozen)</option>
          {state.versions.map((v) => <option key={v.slug} value={v.slug}>{v.name} · saved {day(v.savedAt)} · {v.slides} slides</option>)}
        </select>
        <button onClick={save} disabled={busy || pick === (now.slug ?? '')}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm">
          {busy ? 'Saving…' : 'Use for the study'}
        </button>
      </div>
      {now.slug
        ? <p className="text-sm">Now playing: <b>{now.name}</b>, since {day(now.setAt)}{now.setBy ? ` (${now.setBy})` : ''}. Editing or publishing the lesson doesn&apos;t change it.</p>
        : <p className="text-sm rounded-lg bg-amber-100 text-amber-900 px-3 py-2">Not frozen: the study plays the live lesson, so an edit or a publish changes what people see. Save a version in the editor (Publish, then name it) and pick it here before the study starts.</p>}
      {state.versions.length === 0 && <p className="text-sm text-slate-500">No saved versions of “{state.lesson}” yet.</p>}
      {seen.length > 0 && <p className="text-sm text-slate-500">Seen so far (not test runs): {seen.map(([k, n]) => `${k}: ${n}`).join(' · ')}</p>}
      {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-2 text-sm">{error}</p>}
    </section>
  );
}
