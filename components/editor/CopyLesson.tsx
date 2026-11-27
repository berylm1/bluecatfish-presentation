'use client';

import { useState } from 'react';

/*
 * "Duplicate this lesson…" and "Translate a copy…" (the editor's menu): a new lesson made from this one's saved draft.
 * A duplicate is the same lesson under another name, to change freely. A translation is that copy with every word a
 * learner sees or hears put in another language (a few slides at a time; the voice is recorded on its first Save).
 * The original isn't touched, and the copy isn't published.
 */
const LANGUAGES = ['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Swahili', 'Arabic', 'Hindi', 'Chinese (Simplified)', 'Japanese', 'Korean'];

export default function CopyLesson({ from, title, translate, onClose, onMade }: {
  from: string;
  title: string;
  translate: boolean;
  onClose: () => void;
  onMade: (lesson: { id: string; title: string }, note: string) => void;
}) {
  const [language, setLanguage] = useState('Spanish');
  const [name, setName] = useState(translate ? `${title} (Spanish)` : `${title} (copy)`);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pickLanguage = (l: string) => { setLanguage(l); if (!touched) setName(`${title} (${l})`); };

  const go = async () => {
    setError(''); setBusy('Copying the lesson…');
    try {
      const res = await fetch('/api/editor/copy-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, title: name.trim() }) });
      const made = await res.json().catch(() => ({}));
      if (!res.ok || !made.lesson) throw new Error(made.error ?? 'The lesson couldn’t be copied');
      let note = `“${made.lesson.title}” is a copy of “${title}”. It isn’t published.`;
      if (translate) {
        let failed = '';
        for (let from2: number | null = 0, rounds = 0; from2 !== null && rounds < 60; rounds++) {
          setBusy(`Translating into ${language}: slide ${Math.min(from2 + 1, made.slides)} of ${made.slides}…`);
          const r: { error?: string; title?: string; next: number | null } = await fetch('/api/editor/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: made.lesson.id, language, from: from2 }) })
            .then((x) => x.json()).catch(() => ({ error: 'the server couldn’t be reached' }));
          if (r.error) { failed = r.error; break; }
          if (r.title) made.lesson.title = r.title;
          from2 = r.next;
        }
        note = failed
          ? `The copy was made, but the translation stopped part way (${failed}). The slides before that are in ${language}.`
          : `“${made.lesson.title}” is in ${language}. Press Save in it: the AI records the voice and writes the class questions in ${language}. It isn’t published.`;
      }
      onMade(made.lesson, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy('');
    }
  };

  const box = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:border-slate-900 outline-none';
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-label={translate ? 'Translate a copy' : 'Duplicate this lesson'} data-copy-lesson>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 text-slate-800 flex flex-col gap-3">
        <h2 className="text-lg font-bold">{translate ? 'Translate a copy of this lesson' : 'Duplicate this lesson'}</h2>
        <p className="text-sm text-slate-600">
          {translate
            ? 'Makes a new lesson with the same slides and pictures, and every word in the language you pick. This lesson stays as it is.'
            : 'Makes a new lesson with the same slides, pictures and settings, to change freely. This lesson stays as it is.'}
          {' '}It copies the draft as last saved.
        </p>
        {translate && (
          <label className="text-sm font-medium text-slate-700">Language
            <input className={`${box} mt-1`} list="copy-languages" value={language} maxLength={40} onChange={(e) => pickLanguage(e.target.value)} disabled={!!busy} />
            <datalist id="copy-languages">{LANGUAGES.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
        )}
        <label className="text-sm font-medium text-slate-700">Name of the new lesson
          <input className={`${box} mt-1`} value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setTouched(true); }} disabled={!!busy} />
        </label>
        {busy && <p className="text-sm text-slate-600 flex items-center gap-2" role="status"><span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" aria-hidden />{busy}</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm" onClick={onClose} disabled={!!busy}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold disabled:opacity-50" onClick={go} disabled={!!busy || !name.trim() || (translate && !language.trim())}>
            {translate ? 'Translate' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}
