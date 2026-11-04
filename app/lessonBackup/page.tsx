'use client';

/**
 * /lessonBackup (editors only: lib/editorAuth.ts): every lesson in Redis copied into Supabase, the
 * backup table and a folder per lesson in the lesson-backups bucket (app/api/editor/backup). Then
 * the pictures that pointed at the deleted Supabase project, to upload again in the editor.
 */

import { useState } from 'react';
import Link from 'next/link';

type Lost = { lesson: string; slide: number; topic: string; where: string; alt: string; file: string };
type Result = { lessons: { lesson: string; copied: string[] }[]; problems: string[]; lostPictures: Lost[]; boxesToRecordAgain: number };

export default function LessonBackup() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/editor/backup', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? `Error ${r.status}`);
      else setResult(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold flex-1">Lesson backup</h1>
          <Link href="/slideEditor" className="text-sm underline text-cyan-700">Back to the editor</Link>
        </header>
        <section className="rounded-2xl bg-white border p-5 flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Copies every lesson (its draft, the live version and each saved version) into Supabase: the backup table, and a folder
            per lesson in the <code>lesson-backups</code> storage bucket. Nothing in the lessons changes. Safe to run again. Each save
            and publish also keeps these up to date.
          </p>
          <button onClick={run} disabled={busy} className="self-start px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold">
            {busy ? 'Copying…' : 'Copy all lessons to Supabase'}
          </button>
          {error && <p className="rounded-lg bg-red-100 text-red-900 px-4 py-3">{error}</p>}
        </section>
        {result && (
          <>
            <section className="rounded-2xl bg-white border p-5">
              <h2 className="font-semibold">Copied</h2>
              <ul className="mt-2 text-sm flex flex-col gap-1">
                {result.lessons.map((l) => <li key={l.lesson}><b>{l.lesson}</b>: {l.copied.length ? l.copied.join(', ') : 'nothing to copy'}</li>)}
              </ul>
              {result.problems.length > 0 && (
                <ul className="mt-3 text-sm text-red-800 flex flex-col gap-1">{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
              <p className="mt-3 text-sm text-slate-600">
                {result.boxesToRecordAgain
                  ? <>{result.boxesToRecordAgain} recordings still point at the deleted project. Open each lesson in the editor and press Save: they are made again.</>
                  : 'No recordings left to make again.'}
              </p>
            </section>
            <section className="rounded-2xl bg-white border p-5 overflow-x-auto">
              <h2 className="font-semibold">Pictures to upload again ({result.lostPictures.length})</h2>
              {result.lostPictures.length === 0 ? <p className="mt-2 text-sm text-slate-600">None: every picture is in this project.</p> : (
                <table className="mt-3 text-sm w-full">
                  <thead><tr className="text-left text-slate-500">{['Lesson', 'Slide', 'Topic', 'Where', 'What it showed', 'Old file name'].map((h) => <th key={h} className="pr-4 pb-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {result.lostPictures.map((p, i) => (
                      <tr key={i} className="border-t align-top">
                        <td className="pr-4 py-1.5">{p.lesson}</td>
                        <td className="pr-4">{p.slide || '–'}</td>
                        <td className="pr-4">{p.topic}</td>
                        <td className="pr-4">{p.where}</td>
                        <td className="pr-4">{p.alt || '–'}</td>
                        <td className="pr-4 text-slate-500 break-all">{p.file}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
