'use client';

/**
 * /studyResults: how the online study (the classmates study; the others: StudyTabs) is going (editors only: lib/editorAuth.ts). The two groups
 * side by side, where people stopped, everyone's row, and the whole thing as a spreadsheet
 * (/api/study/results?format=csv: one person per row, every answer in its own column).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ConfusionGraph, { type Curve } from '@/components/study/ConfusionGraph';
import StudyVersionPicker from '@/components/study/StudyVersionPicker';
import StudyChecklist from '@/components/study/StudyChecklist';
import StudyTabs from '@/components/study/StudyTabs';
import PilotReport from '@/components/study/PilotReport';
import { STUDIES, type StudyId } from '@/lib/study/content';

type Summary = {
  group: string | null; people: number; finished: number;
  pre: number | null; postSame: number | null; gain: number | null; post: number | null;
  lessonMinutes: number | null; questions: number | null; engaged: number | null; ueq: number | null;
};
type Data = { summary: Summary[]; steps: Record<string, number>; rows: Record<string, unknown>[]; confusion?: { topics: string[]; curves: Curve[] } };

const NOT_STARTED = 'Not started yet';
const STEPS = ['checks', 'about', 'pre', 'start', 'lesson', 'post', 'survey', 'done'];
const show = (v: unknown) => (v == null ? '–' : String(v));

/**
 * One study's results (app/studyResults: 1, the classmates study; app/studyResults/adaptive: 2, static vs adaptive), each
 * with its own lesson version, "Ready for the study?" and, at the bottom, pilot report (components/study/PilotReport).
 * children: more of the page, after the results. Print: the pilot report alone.
 */
export default function StudyResultsView({ which, children }: { which: StudyId; children?: React.ReactNode }) {
  const S = STUDIES[which];
  const groupName = (g: unknown) => (g == null ? NOT_STARTED : S.names[String(g)] ?? String(g));
  const q = (more: string) => { const p = [which === 2 ? 'study=2' : '', more].filter(Boolean).join('&'); return p ? `?${p}` : ''; };
  const [tests, setTests] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState(0);   // bumped when the study's lesson version changes: the checklist checks again   // their own line on the confusion graph

  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/study/results${q(tests ? 'tests=1' : '')}`).then(async (r) => {
      const d = await r.json();
      if (!live) return;
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else { setData(d); setError(null); }
    }).catch((e) => live && setError(String(e)));
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, [tests]);

  // The interview's notes for one person (app/api/study/results/notes)
  const editNotes = async (id: string, code: string, now: string) => {
    const notes = window.prompt(`Interview notes${code ? ` for ${code}` : ''}:`, now);
    if (notes === null || notes === now) return;
    const r = await fetch('/api/study/results/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, notes, study: which }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? `Error ${r.status}`); return; }
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x.id === id ? { ...x, interview_notes: notes.trim() || null } : x)) });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 print:bg-white print:p-0">
      {/* (print: the pilot report alone) */}
      <div className="max-w-6xl mx-auto flex flex-col gap-6 print:[&>*:not(#pilot-report)]:hidden">
        <StudyTabs current={which === 2 ? 'adaptive' : 'classmates'} />
        <header className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold flex-1">{which === 2 ? 'Static vs adaptive' : 'Classmates study'}</h1>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Include test runs</label>
          <a href={`/api/study/results${q(`format=csv${tests ? '&tests=1' : ''}`)}`} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">⬇ Download spreadsheet (CSV)</a>
          <a href="#pilot-report" className="px-4 py-2 rounded-lg border bg-white hover:bg-slate-50 font-semibold">📋 Pilot report ↓</a>
          <Link href={`${S.path}?test=1`} className="text-sm underline text-cyan-700">Try it (test run)</Link>
        </header>
        <p className="text-sm text-slate-600 -mt-3">People take it at <b>{S.path}</b> (test runs: <b>{S.path}?test=1</b>).</p>
        <StudyVersionPicker which={which} onChange={() => setReadyKey((k) => k + 1)} />
        <StudyChecklist which={which} refreshKey={readyKey} />
        {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3">{error}</p>}
        {data && (
          <>
            <section className="grid md:grid-cols-2 gap-4">
              {data.summary.filter((s) => s.group).map((s) => (
                <div key={s.group} className="rounded-2xl bg-white border p-5">
                  <h2 className="font-semibold text-lg">{groupName(s.group)}</h2>
                  <p className="text-sm text-slate-500">{s.people} put in this group · {s.finished} finished everything</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt>Pre-quiz (of 5)</dt><dd className="font-semibold">{show(s.pre)}</dd>
                    <dt>Same 5 after</dt><dd className="font-semibold">{show(s.postSame)}</dd>
                    <dt>Gain on those 5</dt><dd className="font-semibold">{show(s.gain)}</dd>
                    <dt>Post-quiz (of 10)</dt><dd className="font-semibold">{show(s.post)}</dd>
                    <dt>Lesson minutes</dt><dd className="font-semibold">{show(s.lessonMinutes)}</dd>
                    <dt>Questions asked</dt><dd className="font-semibold">{show(s.questions)}</dd>
                    <dt>“Kept me engaged” (1–5)</dt><dd className="font-semibold">{show(s.engaged)}</dd>
                    <dt>UEQ-S overall (−3 to +3)</dt><dd className="font-semibold">{show(s.ueq)}</dd>
                  </dl>
                  <p className="mt-3 text-xs text-slate-400">Averages over the people who finished.</p>
                </div>
              ))}
            </section>
            <section className="rounded-2xl bg-white border p-5">
              <h2 className="font-semibold">Confusion through the lesson</h2>
              <p className="text-sm text-slate-500 mb-3">From the lesson&apos;s confusion meter, per topic. Click someone in the table below to see their own line.</p>
              <ConfusionGraph groups={S.groups.map((g) => ({ group: g, name: S.names[g] }))} topics={data.confusion?.topics ?? []} curves={data.confusion?.curves ?? []} person={person} onClearPerson={() => setPerson(null)} />
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
                <thead><tr className="text-left text-slate-500">{['Code', 'Started', 'Group', 'Version', 'Step', 'Age', 'Pre', 'Post', 'Lesson min', 'Questions', 'Confusion at the end', 'Confused topics', 'Camera', 'Test', 'Interview notes'].map((h) => <th key={h} className="pr-4 pb-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.rows.slice().reverse().map((r) => (
                    <tr key={String(r.id)} onClick={() => setPerson(person === r.id ? null : String(r.id))} title="Show their line on the confusion graph"
                      className={`border-t cursor-pointer hover:bg-slate-50 ${person === r.id ? 'bg-cyan-50' : ''}`}>
                      <td className="pr-4 py-1.5 font-semibold whitespace-nowrap">{show(r.code)}</td>
                      <td className="pr-4 py-1.5 whitespace-nowrap">{new Date(String(r.created_at)).toLocaleString()}</td>
                      <td className="pr-4">{groupName(r.group)}</td>
                      <td className="pr-4">{show(r.lesson_version)}</td>
                      <td className="pr-4">{show(r.step)}</td>
                      <td className="pr-4">{show(r.about_age)}</td>
                      <td className="pr-4">{show(r.pre_score)}</td>
                      <td className="pr-4">{show(r.post_score)}</td>
                      <td className="pr-4">{show(r.lesson_minutes)}</td>
                      <td className="pr-4">{show(r.lesson_questions)}</td>
                      <td className="pr-4">{r.confusion_end_level ? `${show(r.confusion_end_overall)} (${r.confusion_end_level})` : '–'}</td>
                      <td className="pr-4">{show(r.confusion_topics_confused)}</td>
                      <td className="pr-4">{r.camera_ok == null ? '–' : r.camera_ok ? 'on' : 'off'}</td>
                      <td className="pr-4">{r.is_test ? 'test' : ''}</td>
                      <td className="pr-4 max-w-64">
                        <button onClick={(e) => { e.stopPropagation(); editNotes(String(r.id), String(r.code ?? ''), (r.interview_notes as string | null) ?? ''); }}
                          className="text-left text-cyan-800 hover:underline" title="The interview's notes">
                          {r.interview_notes ? <span className="line-clamp-2 text-slate-700">{String(r.interview_notes)}</span> : '✎ Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
        {children}
        <PilotReport which={which} />
      </div>
    </main>
  );
}
