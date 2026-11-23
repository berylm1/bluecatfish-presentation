'use client';

import type { Deck } from '@/lib/canvas/types';
import { profileOf, type LessonProfile } from '@/lib/canvas/profile';

/*
 * The editor's "Lesson" tab: the lesson's profile (lib/canvas/profile.ts), as type-ins. Each shows what the lesson
 * goes by now (for the blue catfish lesson: what it always had); a change is saved with the deck. The AI's
 * instructions use it when you save (who the teacher is, what it's about, the ages…), and the lesson uses it
 * (the teacher's name, the family card, the sources page).
 */

const label = 'block text-xs font-semibold text-slate-600 mt-3 mb-1';
const input = 'w-full px-2 py-1.5 rounded border border-slate-200 text-sm text-slate-900 focus:border-cyan-500 outline-none';
const small = 'px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50';
const hint = 'text-[11px] text-slate-400 mt-0.5 leading-snug';

/** A list of short texts (goals, family things): one box each, add and take out */
function TextList({ items, onChange, add, max, placeholder }: { items: string[]; onChange: (v: string[]) => void; add: string; max: number; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex gap-1 items-start">
          <span className="text-xs text-slate-400 w-4 pt-2 text-right">{i + 1}</span>
          <textarea className={`${input} resize-y min-h-[2.25rem]`} rows={2} value={t} placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="text-slate-400 hover:text-red-600 pt-1.5" title="Take this out" aria-label="Take this out" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {items.length < max && <button className={`${small} self-start`} onClick={() => onChange([...items, ''])}>＋ {add}</button>}
    </div>
  );
}

export default function LessonPanel({ deck, onChange }: {
  deck: Deck;
  /** The profile's new values (the whole profile is saved with the deck) */
  onChange: (p: LessonProfile, group: string) => void;
}) {
  const p = profileOf(deck);
  const set = <K extends keyof LessonProfile>(k: K, v: LessonProfile[K]) => onChange({ ...p, [k]: v }, `profile:${String(k)}`);
  const setTeacher = (k: keyof LessonProfile['teacher'], v: string) => onChange({ ...p, teacher: { ...p.teacher, [k]: v } }, `profile:teacher:${k}`);
  return (
    <div className="text-sm text-slate-700" data-lesson-panel>
      <p className="text-xs text-slate-500">
        What this lesson is about and who it’s for. The AI goes by it when you save, and the lesson shows the teacher’s name, the family card and the sources from it.
        {!deck.profile && <> Shown: this lesson’s defaults (nothing changed yet).</>}
      </p>

      <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">The lesson</h3>
      <label className={label}>Title</label>
      <input className={input} value={p.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
      <label className={label}>In one line</label>
      <textarea className={input} rows={2} value={p.pitch} maxLength={300} placeholder="A short, hands-on lesson about…" onChange={(e) => set('pitch', e.target.value)} />
      <label className={label}>Subject</label>
      <input className={input} value={p.subject} maxLength={60} placeholder="science, math, history…" onChange={(e) => set('subject', e.target.value)} />
      <p className={hint}>The teacher is “a fun {p.subject || '…'} teacher”.</p>
      <label className={label}>What it’s about</label>
      <input className={input} value={p.about} maxLength={200} onChange={(e) => set('about', e.target.value)} />
      <p className={hint}>As it reads in “a class about {p.about || '…'}”.</p>

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Who it’s for</h3>
      <label className={label}>Ages</label>
      <div className="flex items-center gap-2">
        <input className={`${input} w-20`} type="number" min={4} max={99} value={p.ageMin} onChange={(e) => set('ageMin', Number(e.target.value) || p.ageMin)} aria-label="Youngest" />
        <span className="text-xs text-slate-500">to</span>
        <input className={`${input} w-20`} type="number" min={4} max={99} value={p.ageMax} onChange={(e) => set('ageMax', Number(e.target.value) || p.ageMax)} aria-label="Oldest" />
      </div>
      <label className={label}>Language</label>
      <input className={input} value={p.language} maxLength={40} onChange={(e) => set('language', e.target.value)} />
      <label className={label}>What they already know</label>
      <textarea className={input} rows={2} value={p.priorKnowledge} maxLength={400} onChange={(e) => set('priorKnowledge', e.target.value)} />
      <label className={label}>Goals: by the end, they can…</label>
      <TextList items={p.goals} onChange={(v) => set('goals', v)} add="Add a goal" max={8} placeholder="Explain why…" />

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">How it’s made</h3>
      <label className={label}>Facts come from</label>
      <select className={input} value={p.sourceMode} onChange={(e) => set('sourceMode', e.target.value as LessonProfile['sourceMode'])}>
        <option value="sources">Only the lesson’s sources</option>
        <option value="sources-first">The sources first, general knowledge for the rest</option>
        <option value="general">General knowledge (math, skills…)</option>
      </select>
      <label className={label}>The sections come from</label>
      <select className={input} value={p.structure} onChange={(e) => set('structure', e.target.value as LessonProfile['structure'])}>
        <option value="sources">The source material</option>
        <option value="goals">The goals</option>
        <option value="mine">I write them</option>
      </select>
      <label className={label}>About how long (minutes)</label>
      <input className={`${input} w-24`} type="number" min={3} max={120} value={p.targetMinutes} onChange={(e) => set('targetMinutes', Number(e.target.value) || p.targetMinutes)} />

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">The teacher and the class</h3>
      <label className={label}>Teacher’s name</label>
      <input className={input} value={p.teacher.name} maxLength={60} onChange={(e) => setTeacher('name', e.target.value)} />
      <label className={label}>Sign-off at the end</label>
      <input className={input} value={p.teacher.signOff} maxLength={60} placeholder="Marine out!" onChange={(e) => setTeacher('signOff', e.target.value)} />
      <label className={label}>Leo’s practical questions are about</label>
      <input className={input} value={p.practical} maxLength={200} onChange={(e) => set('practical', e.target.value)} />
      <label className={label}>The teacher’s jokes are aimed at</label>
      <input className={input} value={p.jokesAt} maxLength={80} onChange={(e) => set('jokesAt', e.target.value)} />
      <p className={hint}>Never at the learner. The teacher’s tone stays the same for every lesson.</p>

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">The end of the lesson</h3>
      <label className={label}>3 things to tell your family</label>
      <TextList items={p.familyThings} onChange={(v) => set('familyThings', v)} add="Add one" max={5} placeholder="One thing worth telling at home…" />
      <label className={label}>Learn more (a link)</label>
      <input className={input} value={p.learnMore?.label ?? ''} maxLength={120} placeholder="Its name" onChange={(e) => set('learnMore', { label: e.target.value, url: p.learnMore?.url ?? '' })} />
      <input className={`${input} mt-1`} value={p.learnMore?.url ?? ''} maxLength={500} placeholder="https://…" onChange={(e) => set('learnMore', e.target.value || p.learnMore?.label ? { label: p.learnMore?.label ?? '', url: e.target.value } : null)} />

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Sources</h3>
      <p className={hint}>Shown on the sources page and in the PDF.</p>
      <div className="flex flex-col gap-2 mt-2">
        {p.sources.map((s, i) => (
          <div key={i} className="rounded border border-slate-200 p-2 flex flex-col gap-1">
            <div className="flex gap-1">
              <input className={input} value={s.title} placeholder="Title" onChange={(e) => set('sources', p.sources.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <button className="text-slate-400 hover:text-red-600 px-1" title="Take this out" aria-label="Take this source out" onClick={() => set('sources', p.sources.filter((_, j) => j !== i))}>✕</button>
            </div>
            <input className={input} value={s.org} placeholder="Who published it" onChange={(e) => set('sources', p.sources.map((x, j) => (j === i ? { ...x, org: e.target.value } : x)))} />
            <input className={input} value={s.url} placeholder="https://…" onChange={(e) => set('sources', p.sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
        <button className={`${small} self-start`} onClick={() => set('sources', [...p.sources, { title: '', org: '', url: '' }])}>＋ Add a source</button>
      </div>
    </div>
  );
}
