'use client';

import { useState } from 'react';
import type { Outline } from '@/lib/canvas/outline';
import { TEACHER_VOICES } from '@/lib/voice';
import Icon from '@/components/Icon';

/*
 * "New lesson": a lesson on any topic, in four steps.
 *   1. What to teach: a topic, and the teacher's own material if they have some (pasted)
 *   2. Who it's for: ages, length, subject, language, where facts and sections come from (each can be left to the AI)
 *   3. The outline: the AI proposes the title, one line about it, the goals and the sections; edit any of it, or try another
 *   4. Make it: the lesson, its own knowledge base with the material, its profile, then the AI drafts the slides from the
 *      sections (a few minutes). The editor then opens it, like any lesson.
 */

type Step = 'what' | 'who' | 'outline' | 'making';
const AI = '';   // (a setting left to the AI)

const box = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:border-cyan-500 outline-none';
const lbl = 'block text-sm font-medium text-slate-700 mt-4 mb-1';
const hint = 'text-xs text-slate-500 mt-1';
const primary = 'px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold disabled:opacity-50';
const secondary = 'px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm';
const tiny = 'px-1.5 text-slate-400 hover:text-slate-800 disabled:opacity-30';

export default function NewLessonWizard({ onClose, onCreated, onBlank }: {
  onClose: () => void;
  /** The new lesson, made and drafted: the editor opens it */
  onCreated: (lesson: { id: string; title: string }, notes: string[]) => void;
  /** "Just an empty lesson" (the old way: a name, nothing else) */
  onBlank: () => void;
}) {
  const [step, setStep] = useState<Step>('what');
  const [topic, setTopic] = useState('');
  const [material, setMaterial] = useState('');
  const [ages, setAges] = useState<string>(AI);         // "10-14", or AI
  const [minutes, setMinutes] = useState<string>(AI);
  const [subject, setSubject] = useState('');
  const [language, setLanguage] = useState('English');
  const [sourceMode, setSourceMode] = useState<string>(AI);
  const [structure, setStructure] = useState<string>(AI);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Free pictures (Wikimedia Commons, Openverse) for the new lesson's library, before its slides are written
  const [freePictures, setFreePictures] = useState(true);
  // The teacher: a name and a voice (left empty: the usual teacher's)
  const [teacherName, setTeacherName] = useState('');
  const [voice, setVoice] = useState('');
  const [hearing, setHearing] = useState(false);
  const hear = async () => {
    setHearing(true);
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Hello! I'm ${teacherName.trim() || 'your teacher'}. Ready to learn something new?`, voice: voice || undefined }) });
      if (res.ok) await new Audio(URL.createObjectURL(await res.blob())).play();
    } catch { /* no sound this time */ } finally { setHearing(false); }
  };
  // A PDF, Word or text file: its words go in the material box (read on the server, nothing is stored there)
  const [reading, setReading] = useState('');
  const addFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ['txt', 'md', 'csv'].includes(ext) ? 'txt' : '';
    if (!fileType) { setError('Use a PDF, a Word file (.docx) or a text file.'); return; }
    // (4 MB: the most the server takes in one go; a text file is read right here, whatever its size)
    if (fileType !== 'txt' && file.size > 4 * 1024 * 1024) { setError('That file is over 4 MB, the most that can be sent. Paste the part you need instead, or save it as a smaller file.'); return; }
    setError(''); setReading(`Reading ${file.name}…`);
    try {
      let d: { text?: string; error?: string };
      if (fileType === 'txt') {
        d = { text: (await file.text()).replace(/\u0000/g, '').trim() };
        if (!d.text) throw new Error('That file is empty');
      } else {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/editor/read-file', { method: 'POST', body: form });
        d = await res.json().catch(() => ({}));
        // (413 with no message of ours: the host itself turned it away for its size)
        if (!res.ok || !d.text) throw new Error(d.error ?? (res.status === 413 ? 'That file is too big to send. Paste the part you need instead.' : 'That file couldn’t be read'));
      }
      const joined = [material.trim(), d.text ?? ''].filter(Boolean).join('\n\n');
      setMaterial(joined.slice(0, 60000));
      setReading(joined.length > 60000 ? `Added the first part of ${file.name} (the box holds 60,000 characters).` : `Added ${file.name}.`);
      if (!topic.trim()) setTopic(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
    } catch (e) {
      setReading('');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const propose = async (avoid?: string) => {
    setError(''); setBusy(avoid ? 'Thinking of another version…' : 'Planning the lesson…');
    const [ageMin, ageMax] = ages ? ages.split('-').map(Number) : [undefined, undefined];
    try {
      const res = await fetch('/api/editor/outline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic, material: material.trim() || undefined, subject: subject.trim() || undefined, language: language.trim() || undefined,
          ageMin, ageMax, minutes: minutes ? Number(minutes) : undefined,
          sourceMode: sourceMode || undefined, structure: structure || undefined, avoid,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.outline) throw new Error(d.error ?? 'The AI couldn’t plan it');
      setOutline(d.outline);
      setStep('outline');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const make = async () => {
    if (!outline) return;
    setError(''); setStep('making'); setBusy('Making the lesson and its knowledge base…');
    try {
      const res = await fetch('/api/editor/create-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outline, material: material.trim() || undefined, teacher: { name: teacherName.trim() || undefined, voice: voice || undefined } }) });
      const made = await res.json();
      if (!res.ok || !made.lesson) throw new Error(made.error ?? 'The lesson couldn’t be made');
      // Its pictures first (a new lesson's library is empty): the slides are then written with them to hand.
      // (none found, or the picture sites can't be reached: the lesson is made without, and says so)
      const pictureNotes: string[] = [];
      if (freePictures) {
        setBusy('Finding free pictures for the lesson (Wikimedia Commons and Openverse): the AI looks at each one first. About a minute…');
        try {
          const found = await fetch('/api/editor/open-pictures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: made.lesson.id, sections: outline.sections }), signal: AbortSignal.timeout(125_000) })
            .then((r) => r.json());
          pictureNotes.push(...(found.notes ?? []), ...(found.error ? [`Free pictures couldn’t be added (${found.error}).`] : []));
        } catch {
          pictureNotes.push('Free pictures couldn’t be added this time: add some in the Pictures tab (Find free).');
        }
      }
      setBusy(`Writing the slides for “${made.lesson.title}”: each section in turn, then the pictures, the story order and the recap. A minute or two…`);
      const res2 = await fetch('/api/editor/ai-deck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: made.lesson.id, sections: outline.sections, material: material.trim() || undefined, draft: true }),
      });
      const drafted = await res2.json().catch(() => ({}));
      // Then what makes it a lesson to play: the professor's voice for every part, the simpler versions, the helpers and
      // the classmates' questions (the editor's save-time AI, here for the new lesson so it's ready when it opens).
      // (was: left for the first Save, and learners got a lesson with no recorded voice or class questions meanwhile)
      const voiceNotes: string[] = [];
      if (res2.ok && !drafted.error) {
        try {
          const until = Date.now() + 9 * 60_000;
          for (let round = 0; round < 30 && Date.now() < until; round++) {
            const r = await fetch('/api/editor/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: made.lesson.id, kind: 'ai' }) }).then((x) => x.json()).catch(() => null);
            if (!r || r.error) { voiceNotes.push('The voice and the class questions aren’t all made yet: press Save in the editor to finish them.'); break; }
            setBusy(`Recording the professor’s voice and writing the classmates’ questions${r.remaining ? `: ${r.remaining} left` : ''}…`);
            if (!r.remaining || (!r.patches?.length && !r.more)) break;
          }
          await fetch('/api/editor/ai-deck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: made.lesson.id, syncDraft: true }) }).catch(() => null);
        } catch {
          voiceNotes.push('The voice and the class questions aren’t all made yet: press Save in the editor to finish them.');
        }
      }
      const notes: string[] = [...(made.notes ?? []), ...pictureNotes, ...(drafted.notes ?? []), ...voiceNotes];
      if (!res2.ok || drafted.error) notes.unshift(`The slides couldn’t be drafted (${drafted.error ?? res2.status}): the lesson is made, with its outline in Lesson. Try More ▾ → Start from AI… in it.`);
      onCreated(made.lesson, notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('outline');
    } finally {
      setBusy('');
    }
  };

  const set = <K extends keyof Outline>(k: K, v: Outline[K]) => outline && setOutline({ ...outline, [k]: v });
  const move = (i: number, by: number) => {
    if (!outline) return;
    const s = [...outline.sections];
    const [x] = s.splice(i, 1);
    s.splice(i + by, 0, x);
    set('sections', s);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-label="New lesson" data-new-lesson>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-6 text-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900">New lesson · {{ what: '1 of 3: what to teach', who: '2 of 3: who it’s for', outline: '3 of 3: the outline', making: 'making it' }[step]}</p>
            <h2 className="text-xl font-bold mt-1">{{ what: 'What do you want to teach?', who: 'Who is it for?', outline: outline?.title || 'The outline', making: 'Making the lesson' }[step]}</h2>
          </div>
          {step !== 'making' && <button className="text-slate-400 hover:text-slate-800 text-xl" aria-label="Close" onClick={onClose}>✕</button>}
        </div>

        {step === 'what' && (
          <>
            <label className={lbl}>The topic</label>
            <input className={box} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="e.g. Adding fractions, How volcanoes work, Redstone circuits in Minecraft" autoFocus />
            <label className={lbl}>Your own material (optional)</label>
            <textarea className={`${box} min-h-40`} value={material} onChange={(e) => setMaterial(e.target.value)} maxLength={60000}
              placeholder="Paste notes, an article or a chapter: the lesson is built from it, and it goes in the lesson’s own knowledge base (for the professor’s answers and the fact checks). Leave it empty to plan from general knowledge." />
            <div className="mt-2 flex flex-wrap items-center gap-3" data-wizard-file>
              <label className={`${secondary} cursor-pointer flex items-center gap-2`}>
                <Icon name="upload" size={16} /> Add a PDF or Word file
                <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addFile(f); }} />
              </label>
              <span className="text-xs text-slate-500" role="status">{reading || (material.length ? `${material.length.toLocaleString()} characters` : 'Up to 4 MB. Its words are put in the box above, to look over before you go on.')}</span>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button className="text-sm text-slate-500 underline hover:text-slate-800" onClick={onBlank}>Just an empty lesson</button>
              <button className={primary} disabled={!topic.trim() && !material.trim()} onClick={() => setStep('who')}>Next</button>
            </div>
          </>
        )}

        {step === 'who' && (
          <>
            <p className="text-sm text-slate-500 mt-1">Leave any of these to the AI: it picks what suits the topic, and you can change it in the outline.</p>
            <div className="grid grid-cols-2 gap-x-4">
              <div>
                <label className={lbl}>Ages</label>
                <select className={box} value={ages} onChange={(e) => setAges(e.target.value)}>
                  <option value={AI}>AI picks</option>
                  {['6-8', '8-10', '10-12', '10-14', '12-14', '14-16', '16-18'].map((a) => <option key={a} value={a}>{a.replace('-', ' to ')}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>About how long</label>
                <select className={box} value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                  <option value={AI}>AI picks</option>
                  {[5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Subject</label>
                <input className={box} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={60} placeholder="AI picks (science, math, history…)" />
              </div>
              <div>
                <label className={lbl}>Language</label>
                <input className={box} value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={40} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4" data-wizard-teacher>
              <div>
                <label className={lbl}>The teacher’s name</label>
                <input className={box} value={teacherName} onChange={(e) => setTeacherName(e.target.value)} maxLength={60} placeholder="The usual one (Professor Marine)" />
              </div>
              <div>
                <label className={lbl}>The teacher’s voice</label>
                <div className="flex gap-2">
                  <select className={box} value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="The teacher’s voice">
                    <option value="">The usual one</option>
                    {TEACHER_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                  <button type="button" className={`${secondary} whitespace-nowrap flex items-center gap-1.5`} onClick={hear} disabled={hearing}><Icon name="speaker" size={16} /> {hearing ? '…' : 'Hear it'}</button>
                </div>
              </div>
            </div>
            <label className={lbl}>Facts come from</label>
            <select className={box} value={sourceMode} onChange={(e) => setSourceMode(e.target.value)}>
              <option value={AI}>AI picks ({material.trim() ? 'your material' : 'general knowledge'})</option>
              <option value="sources">Only my material and the lesson’s sources</option>
              <option value="sources-first">My material first, general knowledge for the rest</option>
              <option value="general">General knowledge (math, skills, well-known topics)</option>
            </select>
            <label className={lbl}>The sections come from</label>
            <select className={box} value={structure} onChange={(e) => setStructure(e.target.value)}>
              <option value={AI}>AI picks ({material.trim() ? 'your material’s order' : 'the goals'})</option>
              <option value="sources">My material’s own order and headings</option>
              <option value="goals">The goals: about one section each</option>
            </select>
            <div className="mt-6 flex items-center justify-between">
              <button className={secondary} onClick={() => setStep('what')} disabled={!!busy}>Back</button>
              <button className={primary} onClick={() => propose()} disabled={!!busy}>{busy || 'Propose an outline'}</button>
            </div>
          </>
        )}

        {step === 'outline' && outline && (
          <>
            <label className={lbl}>Title</label>
            <input className={box} value={outline.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
            <label className={lbl}>In one line</label>
            <input className={box} value={outline.pitch} maxLength={300} onChange={(e) => set('pitch', e.target.value)} />
            <p className={hint}>{outline.subject} · ages {outline.ageMin} to {outline.ageMax} · about {outline.minutes} minutes · facts from {outline.sourceMode === 'general' ? 'general knowledge' : outline.sourceMode === 'sources-first' ? 'the material first' : 'the material'} · all of it in Lesson later</p>

            <label className={lbl}>Goals: by the end, they can…</label>
            {outline.goals.map((g, i) => (
              <div key={i} className="flex gap-1 mb-1.5">
                <input className={box} value={g} maxLength={240} onChange={(e) => set('goals', outline.goals.map((x, j) => (j === i ? e.target.value : x)))} />
                <button className={tiny} aria-label="Take this goal out" onClick={() => set('goals', outline.goals.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {outline.goals.length < 8 && <button className="text-xs text-slate-900 underline" onClick={() => set('goals', [...outline.goals, ''])}>＋ Add a goal</button>}

            <label className={lbl}>Sections, in order</label>
            <ol className="flex flex-col gap-2">
              {outline.sections.map((sec, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-2.5" data-outline-section>
                  <div className="flex gap-1 items-center">
                    <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                    <input className={`${box} font-semibold`} value={sec.title} maxLength={80}
                      onChange={(e) => set('sections', outline.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <button className={tiny} title="Up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className={tiny} title="Down" aria-label="Move down" disabled={i === outline.sections.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className={tiny} aria-label="Take this section out" disabled={outline.sections.length < 2} onClick={() => set('sections', outline.sections.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <textarea className={`${box} mt-1.5 text-xs`} rows={Math.max(2, sec.covers.length)} value={sec.covers.join('\n')}
                    placeholder="What it teaches: one idea per line"
                    onChange={(e) => set('sections', outline.sections.map((x, j) => (j === i ? { ...x, covers: e.target.value.split('\n').slice(0, 6) } : x)))} />
                </li>
              ))}
            </ol>
            {outline.sections.length < 8 && <button className="mt-2 text-xs text-slate-900 underline" onClick={() => set('sections', [...outline.sections, { title: 'New section', covers: [] }])}>＋ Add a section</button>}

            <label className="mt-5 flex items-start gap-2 text-sm text-slate-700" data-free-pictures-choice>
              <input type="checkbox" className="mt-0.5" checked={freePictures} onChange={(e) => setFreePictures(e.target.checked)} />
              <span>Find free pictures for it
                <span className="block text-xs text-slate-400">From Wikimedia Commons and Openverse, free to use with credit (shown on the slide and the sources page). The AI looks at each one and leaves out any that don’t fit or aren’t right for children. You can change them afterwards.</span>
              </span>
            </label>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button className={secondary} onClick={() => setStep('who')} disabled={!!busy}>Back</button>
              <div className="flex gap-2">
                <button className={secondary} disabled={!!busy} onClick={() => propose(outline.sections.map((s) => s.title).join('; '))}>{busy || 'Try another'}</button>
                <button className={primary} disabled={!!busy || !outline.title.trim() || !outline.sections.some((s) => s.title.trim())} onClick={make}>Make the lesson</button>
              </div>
            </div>
          </>
        )}

        {step === 'making' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-full border-4 border-slate-300 border-t-slate-900 animate-spin" aria-hidden />
            <p className="text-sm text-slate-600 max-w-md">{busy}</p>
            <p className="text-xs text-slate-400">Keep this tab open. The editor opens the lesson when it’s ready.</p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
