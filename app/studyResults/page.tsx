'use client';

/**
 * /studyResults: how the online study is going (editors only: lib/editorAuth.ts). The two groups
 * side by side, where people stopped, everyone's row, and the whole thing as a spreadsheet
 * (/api/study/results?format=csv: one person per row, every answer in its own column).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Summary = {
  group: string | null; people: number; finished: number;
  pre: number | null; postSame: number | null; gain: number | null; post: number | null;
  lessonMinutes: number | null; questions: number | null; enjoy: number | null;
};
type Data = { summary: Summary[]; steps: Record<string, number>; rows: Record<string, unknown>[] };

const GROUP_NAME: Record<string, string> = { classmates: 'With classmates', no_classmates: 'Without classmates', null: 'Not started yet' };
const STEPS = ['about', 'pre', 'start', 'checks', 'lesson', 'post', 'survey', 'done'];
const show = (v: unknown) => (v == null ? '–' : String(v));

export default function StudyResults() {
  const [tests, setTests] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/study/results${tests ? '?tests=1' : ''}`).then(async (r) => {
      const d = await r.json();
      if (!live) return;
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setData(d); setError(null); }
    }).catch((e) => live && setError(String(e)));
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, [tests]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold flex-1">Study results</h1>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Include test runs</label>
          <a href={`/api/study/results?format=csv${tests ? '&tests=1' : ''}`} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">⬇ Download spreadsheet (CSV)</a>
          <Link href="/study?test=1" className="text-sm underline text-cyan-700">Try it (test run)</Link>
        </header>
        {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3">{error}</p>}
        {data && (
          <>
            <section className="grid md:grid-cols-2 gap-4">
              {data.summary.filter((s) => s.group).map((s) => (
                <div key={s.group} className="rounded-2xl bg-white border p-5">
                  <h2 className="font-semibold text-lg">{GROUP_NAME[String(s.group)]}</h2>
                  <p className="text-sm text-slate-500">{s.people} put in this group · {s.finished} finished everything</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt>Pre-quiz (of 5)</dt><dd className="font-semibold">{show(s.pre)}</dd>
                    <dt>Same 5 after</dt><dd className="font-semibold">{show(s.postSame)}</dd>
                    <dt>Gain on those 5</dt><dd className="font-semibold">{show(s.gain)}</dd>
                    <dt>Post-quiz (of 10)</dt><dd className="font-semibold">{show(s.post)}</dd>
                    <dt>Lesson minutes</dt><dd className="font-semibold">{show(s.lessonMinutes)}</dd>
                    <dt>Questions asked</dt><dd className="font-semibold">{show(s.questions)}</dd>
                    <dt>“I enjoyed it” (1–5)</dt><dd className="font-semibold">{show(s.enjoy)}</dd>
                  </dl>
                  <p className="mt-3 text-xs text-slate-400">Averages over the people who finished.</p>
                </div>
              ))}
            </section>
            <section className="rounded-2xl bg-white border p-5">
              <h2 className="font-semibold">Where people are (or stopped)</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {STEPS.map((st) => <span key={st} className="px-3 py-1 rounded-full bg-slate-100">{st}: <b>{data.steps[st] ?? 0}</b></span>)}
              </div>
            </section>
            <section className="rounded-2xl bg-white border p-5 overflow-x-auto">
              <h2 className="font-semibold">Everyone ({data.rows.length})</h2>
              <table className="mt-3 text-sm w-full">
                <thead><tr className="text-left text-slate-500">{['Started', 'Group', 'Step', 'Age', 'Done before', 'Pre', 'Post', 'Lesson min', 'Questions', 'Camera', 'Test'].map((h) => <th key={h} className="pr-4 pb-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.rows.slice().reverse().map((r) => (
                    <tr key={String(r.id)} className="border-t">
                      <td className="pr-4 py-1.5 whitespace-nowrap">{new Date(String(r.created_at)).toLocaleString()}</td>
                      <td className="pr-4">{GROUP_NAME[String(r.group)]}</td>
                      <td className="pr-4">{show(r.step)}</td>
                      <td className="pr-4">{show(r.age_range)}</td>
                      <td className="pr-4">{show(r.done_before)}{r.seen_before_browser ? ' (browser: yes)' : ''}</td>
                      <td className="pr-4">{show(r.pre_score)}</td>
                      <td className="pr-4">{show(r.post_score)}</td>
                      <td className="pr-4">{show(r.lesson_minutes)}</td>
                      <td className="pr-4">{show(r.lesson_questions)}</td>
                      <td className="pr-4">{r.camera_ok == null ? '–' : r.camera_ok ? 'on' : 'off'}</td>
                      <td className="pr-4">{r.is_test ? 'test' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
