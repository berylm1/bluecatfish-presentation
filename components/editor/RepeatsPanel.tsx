'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deck } from '@/lib/canvas/types';
import { deckSections, factSlide, findCrossSectionRepeats } from '@/lib/lessonOverlap';
import type { RepeatSuggestion } from '@/lib/canvas/repeats';

/*
 * "Check for repeats" in the editor's side panel:
 *   - at once (free): shown text that looks the same in two topics (the
 *     word match /lessonReview uses)
 *   - with the AI: everything the lesson says or shows that repeats an
 *     earlier slide, each with a rewrite to Accept (an undoable edit, then
 *     yours: the AI won't rewrite it) or Skip
 * Works on the lesson as it is in the editor, unsaved changes too.
 */

const btn = 'px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs disabled:opacity-40';

export default function RepeatsPanel({ deck, active, runSignal = 0, onAccept, onGoTo }: {
  deck: Deck;
  /** Changes when something else (Publish) asks for the AI check */
  runSignal?: number;
  /** The panel is showing (it stays mounted to keep its results; the free check only runs while it shows) */
  active: boolean;
  /** Apply a suggestion; false when that part has changed since the check */
  onAccept: (s: RepeatSuggestion) => boolean;
  onGoTo: (slideIndex: number, elId?: string) => void;
}) {
  const [state, setState] = useState<{ busy: boolean; error?: string; list?: RepeatSuggestion[]; at?: number; partial?: number }>({ busy: false });
  const [done, setDone] = useState<Record<number, 'accepted' | 'skipped' | 'changed'>>({});

  // The free word match: updates as you edit, while the panel shows (it compares every pair of lines:
  // not on every keystroke while you're working in another tab)
  const quick = useMemo(() => (active ? findCrossSectionRepeats(deckSections(deck)) : []), [deck, active]);

  const check = async () => {
    setState({ busy: true });
    setDone({});
    try {
      const res = await fetch('/api/editor/repeats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `The check failed (${res.status})`);
      setState({ busy: false, list: d.suggestions ?? [], at: Date.now(), partial: d.partial });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  // Publish's "check with the AI first"
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => { if (runSignal > 0) checkRef.current(); }, [runSignal]);

  const open = state.list?.filter((_, i) => !done[i]).length ?? 0;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <h3 className="font-bold text-slate-900">Check for repeats</h3>
        <p className="text-xs text-slate-500 mt-1">Finds where the lesson says or shows the same thing twice. The first time stays; you choose what to do with the later ones.</p>
      </div>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Same words on screen {quick.length ? <span className="text-red-600">({quick.length})</span> : <span className="text-green-700">(none)</span>}
        </h4>
        {quick.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {quick.map((r, k) => (
              <li key={k} className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs">
                <button className="underline" onClick={() => onGoTo(factSlide(deck, r.a))}>Slide {factSlide(deck, r.a) + 1}</button> “{r.a.text}” ↔{' '}
                <button className="underline" onClick={() => onGoTo(factSlide(deck, r.b))}>Slide {factSlide(deck, r.b) + 1}</button> “{r.b.text}”
                <span className="text-slate-500"> — {r.why}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-slate-200 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Everything, with the AI</h4>
        <button className="w-full px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50" onClick={check} disabled={state.busy}>
          {state.busy ? '✨ Reading the whole lesson…' : state.list ? '✨ Check again' : '✨ Check the whole lesson'}
        </button>
        <p className="text-xs text-slate-500 mt-1">Reads what&apos;s shown and what&apos;s said on every slide (not the hands-on boxes). Takes up to a minute.</p>
        {state.error && <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{state.error}</p>}
        {state.list && (
          <p className="mt-2 text-xs text-slate-600" role="status">
            {state.list.length === 0 ? '✓ No repeats found.' : `${state.list.length} repeat${state.list.length === 1 ? '' : 's'} found${open < state.list.length ? `, ${open} left` : ''}.`}
          </p>
        )}
        {state.partial && <p className="mt-1 text-xs text-amber-800">The lesson is long: only slides 1–{state.partial} were read this time.</p>}
        <ul className="flex flex-col gap-2 mt-2">
          {state.list?.map((s, i) => (
            <li key={i} className={`rounded-md border px-2.5 py-2 ${done[i] ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <button className="text-xs font-semibold underline" onClick={() => onGoTo(s.slideIndex, s.elId)}>Slide {s.slideIndex + 1}</button>
                {done[i] && <span className="text-xs text-slate-500">{done[i] === 'accepted' ? '✓ Accepted' : done[i] === 'skipped' ? 'Skipped' : 'Changed since the check: not applied'}</span>}
              </div>
              <p className="text-xs text-amber-900 mt-0.5">{s.why}</p>
              {s.text && (
                <p className="text-xs mt-1"><span className="text-slate-500">Shown:</span> <s className="text-slate-500">{s.beforeText}</s> → <b>{s.text}</b></p>
              )}
              {s.say && (
                <div className="text-xs mt-1 flex flex-col gap-0.5">
                  <span className="text-slate-500">Said now:</span> <span className="text-slate-500 line-through decoration-slate-400">{s.beforeSay}</span>
                  <span className="text-slate-500 mt-0.5">Suggested:</span> <span className="text-slate-900">{s.say}</span>
                </div>
              )}
              {!done[i] && (
                <div className="flex gap-1.5 mt-2">
                  <button className={`${btn} border-cyan-600 text-cyan-800`} onClick={() => {
                    // (not inside the state updater: React may run that twice, which made two undo steps)
                    const ok = onAccept(s);
                    setDone((d) => ({ ...d, [i]: ok ? 'accepted' : 'changed' }));
                  }}>Accept</button>
                  <button className={btn} onClick={() => setDone((d) => ({ ...d, [i]: 'skipped' }))}>Skip</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {state.list && state.list.length > 0 && <p className="text-xs text-slate-500 mt-2">Accepted changes are your edits: Ctrl+Z undoes them, and their audio is remade when you save.</p>}
      </section>
    </div>
  );
}
