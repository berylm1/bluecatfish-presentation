'use client';

/**
 * More ▾ → "Pull from the original…" (only on the study's lesson, lib/study/content.ts STUDY_LESSON): the original's
 * slides that changed since they were copied, or are new there, side by side with the study's, to bring across one by
 * one (lib/canvas/studyLesson.ts). Into the draft, like any edit: Undo works until it's saved; saving writes the pulled
 * slides' helpers again, from the study's slides only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Deck, Slide } from '@/lib/canvas/types';
import { shownWords, spokenText } from '@/lib/canvas/queue';
import { slideDiff } from '@/lib/canvas/studyLesson';

/** A slide in a few words: what it shows, then what's said */
const gist = (s: Slide | undefined) => {
  if (!s) return '';
  const shown = s.elements.map(shownWords).filter(Boolean).join(' · ');
  const said = s.elements.map(spokenText).filter(Boolean).join(' ');
  return `${shown}${said && said !== shown ? ` — “${said}”` : ''}`.replace(/\s+/g, ' ').slice(0, 320);
};

export default function PullFromOriginal({ source, sourceTitle, deck, onPull, onClose }: {
  source: string; sourceTitle: string; deck: Deck;
  onPull: (original: Deck, ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [original, setOriginal] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    // the original as learners see it (its live lesson), else its draft
    (async () => {
      try {
        for (const kind of ['live', 'draft']) {
          const d = await fetch(`/api/editor/deck?lesson=${encodeURIComponent(source)}&kind=${kind}`).then((r) => r.json());
          if (d.deck?.slides?.length) { setOriginal(d.deck); return; }
        }
        setError('The original lesson has no slides.');
      } catch (e) { setError(String(e)); }
    })();
  }, [source]);
  const diff = useMemo(() => (original ? slideDiff(original, deck) : null), [original, deck]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = diff ? [
    ...diff.changed.map((c) => ({ ...c, kind: 'changed' as const })),
    ...diff.added.map((a) => ({ ...a, kind: 'added' as const })),
  ].sort((a, b) => a.from - b.from) : [];

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="pull-title" data-pull-original>
        <div className="p-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1">
            <h2 id="pull-title" className="font-bold text-lg">Pull from “{sourceTitle}”</h2>
            <p className="text-sm text-slate-600">
              Slides that changed in the original, or are new there. Tick the ones to bring into this lesson. Their helper slides and the
              classmates’ questions are written again when you save, from this lesson’s slides only. Undo works until you save.
            </p>
          </div>
          <button className="text-slate-400 hover:text-slate-700 text-lg" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto p-3 flex flex-col gap-2">
          {error ? <p className="text-sm text-red-700">{error}</p>
            : !diff ? <p className="text-sm text-slate-500">Loading the original…</p>
            : rows.length === 0 ? <p className="text-sm text-slate-600">Nothing to pull: every slide of the original is the same here.</p>
            : rows.map((r) => (
              <label key={r.id} className={`rounded-lg border p-3 flex gap-3 cursor-pointer ${picked.has(r.id) ? 'border-cyan-600 bg-cyan-50/50' : 'border-slate-200 hover:border-slate-400'}`} data-pull-row>
                <input type="checkbox" className="mt-1 w-4 h-4 accent-cyan-600 shrink-0" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">
                    {r.kind === 'changed' ? `Slide ${r.at + 1}: changed in the original` : `New in the original (its slide ${r.from + 1}): goes in as slide ${r.at + 1}`}
                    {r.topic && <span className="font-normal text-slate-500"> · {r.topic}</span>}
                  </span>
                  <span className="mt-1.5 grid sm:grid-cols-2 gap-2 text-xs">
                    <span className="rounded-md bg-slate-50 border border-slate-200 p-2">
                      <span className="block font-semibold text-slate-500 mb-0.5">The original</span>{gist(original!.slides[r.from])}
                    </span>
                    {r.kind === 'changed' && (
                      <span className="rounded-md bg-slate-50 border border-slate-200 p-2">
                        <span className="block font-semibold text-slate-500 mb-0.5">This lesson now</span>{gist(deck.slides[r.at])}
                      </span>
                    )}
                  </span>
                </span>
              </label>
            ))}
          {diff && diff.onlyHere.length > 0 && (
            <p className="text-xs text-slate-500 px-1">
              Only in this lesson (kept): slide{diff.onlyHere.length === 1 ? '' : 's'} {diff.onlyHere.map((o) => o.at + 1).join(', ')}.
            </p>
          )}
        </div>
        <div className="p-3 border-t border-slate-200 flex items-center gap-2">
          {rows.length > 1 && <button className="text-sm underline text-slate-600" onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>{picked.size === rows.length ? 'Untick all' : 'Tick all'}</button>}
          <span className="flex-1" />
          <button className="px-3 py-1.5 rounded-md border border-slate-300 text-sm" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white text-sm font-semibold" disabled={!picked.size || !original}
            onClick={() => onPull(original!, picked)}>Pull {picked.size || ''} slide{picked.size === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
