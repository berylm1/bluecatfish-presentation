'use client';

/**
 * /instructor-view — live learner-state dashboard (Ch5 evidence collector).
 *
 * Read-only: polls /api/instructor/overview every 8s and shows what the
 * platform actually sensed and did — per-section rollups, the 24h event
 * histogram, and the mood distribution. This is the page you leave open
 * next to the lecture during a demo or pilot.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

type StateRow = {
  session_id: string;
  section: number;
  seq: number;
  visits: number;
  repeats: number;
  simplify_requests: number;
  confusion_marks: number;
  barge_ins: number;
  questions: number;
  last_state: string;
  updated_at: string;
};

type Overview = {
  states: StateRow[];
  histogram: Record<string, number>;
  moods: Record<string, number>;
  /** Finn's deliberate mistakes, last 24h: caught / believed / not sure / judged by the professor (said in their own words) */
  finn?: { caught: number; fooled: number; unsure: number; other: number };
  sessions: number;
  error?: string;
};

const MOOD_STYLES: Record<string, string> = {
  engaged: 'bg-emerald-100 text-emerald-800',
  neutral: 'bg-slate-100 text-slate-700',
  confused: 'bg-amber-100 text-amber-800',
  frustrated: 'bg-red-100 text-red-800',
  bored: 'bg-blue-100 text-blue-700',
};

const MOOD_FACE: Record<string, string> = {
  engaged: '✅', neutral: '•', confused: '🤔', frustrated: '😣', bored: '😐',
};

export default function InstructorView() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/instructor/overview', { cache: 'no-store' });
        const json = (await res.json()) as Overview;
        if (!alive) return;
        if (!res.ok || json.error) {
          setFailed(json.error || `HTTP ${res.status}`);
        } else {
          setFailed(null);
          setData(json);
          setUpdatedAt(new Date().toLocaleTimeString());
        }
      } catch (e) {
        if (alive) setFailed(e instanceof Error ? e.message : 'fetch failed');
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const hist = Object.entries(data?.histogram ?? {}).sort((a, b) => b[1] - a[1]);
  const maxHist = Math.max(1, ...hist.map(([, n]) => n));
  const moods = Object.entries(data?.moods ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 p-8 font-sans">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Instructor View</h1>
            <p className="text-sm text-slate-600">
              What the platform sensed and did — live from the events table.
            </p>
          </div>
          <Link href="/" className="text-sm text-cyan-700 underline">← Deck</Link>
        </header>

        {failed && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Could not load: {failed}
          </div>
        )}

        {/* Top cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl bg-white shadow p-5">
            <div className="text-3xl font-bold text-blue-900">{data?.sessions ?? '—'}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Recent sessions</div>
          </div>
          <div className="rounded-xl bg-white shadow p-5">
            <div className="text-3xl font-bold text-blue-900">{data ? Object.values(data.histogram).reduce((a, b) => a + b, 0) : '—'}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Events · last 24h</div>
          </div>
          <div className="rounded-xl bg-white shadow p-5">
            <div className="text-lg font-bold text-blue-900 leading-tight">
              {moods.length
                ? moods.map(([m, n]) => `${MOOD_FACE[m] ?? '•'} ${n}`).join('  ')
                : '—'}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Mood distribution</div>
          </div>
          <div className="rounded-xl bg-white shadow p-5" title="Finn says something wrong on purpose; did the learner catch it? (last 24h)">
            {(() => {
              const f = data?.finn;
              const judged = f ? f.caught + f.fooled + f.unsure : 0;
              return (
                <>
                  <div className="text-3xl font-bold text-blue-900">{f ? (judged ? `${f.caught}/${judged}` : '—') : '—'}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Finn&apos;s mix-ups caught · 24h</div>
                  {f && judged > 0 && <div className="text-xs text-slate-500 mt-1">believed {f.fooled} · not sure {f.unsure}{f.other ? ` · own words ${f.other}` : ''}</div>}
                </>
              );
            })()}
          </div>
        </div>

        {/* Event histogram */}
        <section className="rounded-xl bg-white shadow p-5 mb-8">
          <h2 className="font-semibold text-blue-900 mb-3">Events · last 24 hours</h2>
          {hist.length === 0 ? (
            <p className="text-sm text-slate-500">No events yet — run a lecture session with the 🎙 Interrupt toggle on.</p>
          ) : (
            <div className="space-y-2">
              {hist.map(([type, n]) => (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-40 text-xs text-slate-600 font-mono">{type}</div>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded" style={{ width: `${(n / maxHist) * 100}%` }} />
                  </div>
                  <div className="w-10 text-right text-xs font-semibold text-slate-700">{n}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Per-section rollups */}
        <section className="rounded-xl bg-white shadow p-5">
          <h2 className="font-semibold text-blue-900 mb-3">
            Learner state rollups
            {updatedAt && <span className="ml-2 text-xs font-normal text-slate-400">updated {updatedAt}</span>}
          </h2>
          {!data || data.states.length === 0 ? (
            <p className="text-sm text-slate-500">No rollups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b">
                    <th className="py-2 pr-3">Session</th>
                    <th className="py-2 pr-3">§</th>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3">Confused</th>
                    <th className="py-2 pr-3">Repeats</th>
                    <th className="py-2 pr-3">Simplify</th>
                    <th className="py-2 pr-3">Barges</th>
                    <th className="py-2 pr-3">Questions</th>
                    <th className="py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.states.map((s, i) => (
                    <tr key={`${s.session_id}-${s.section}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{s.session_id.slice(0, 10)}…</td>
                      <td className="py-2 pr-3">{s.section}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${MOOD_STYLES[s.last_state] ?? MOOD_STYLES.neutral}`}>
                          {MOOD_FACE[s.last_state] ?? '•'} {s.last_state}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{s.confusion_marks}</td>
                      <td className="py-2 pr-3">{s.repeats}</td>
                      <td className="py-2 pr-3">{s.simplify_requests}</td>
                      <td className="py-2 pr-3">{s.barge_ins}</td>
                      <td className="py-2 pr-3">{s.questions}</td>
                      <td className="py-2 text-xs text-slate-400">{new Date(s.updated_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-slate-400">
          Read-only over Supabase (service role, server-side). Frames never leave the learner's browser — only counters and state labels are stored.
        </p>
      </div>
    </main>
  );
}
