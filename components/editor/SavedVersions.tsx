'use client';

import { useEffect, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Deck, Slide } from '@/lib/canvas/types';

type Saved = { lesson: string; slug: string; name: string; savedAt: string; by: string; slides: number };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * "Saved versions…": the versions saved under a name when they were published. Open one to see
 * its slides: copy one slide into the draft, or replace the whole draft with it (undo works until you save).
 */
export default function SavedVersions({ lessonId, slideNumber, onReplace, onCopySlide, onClose }: {
  lessonId: string;
  /** The slide being edited (a copied slide goes after it) */
  slideNumber: number;
  onReplace: (deck: Deck, name: string) => void;
  onCopySlide: (slide: Slide, name: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Saved[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ v: Saved; deck: Deck | null; error?: string } | null>(null);

  const load = () => fetch(`/api/editor/saved?lesson=${encodeURIComponent(lessonId)}`)
    .then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setList(d.versions ?? []))).catch(() => setError('Couldn’t load the saved versions'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lessonId]);

  const openVersion = async (v: Saved) => {
    if (open?.v.slug === v.slug) { setOpen(null); return; }
    setOpen({ v, deck: null });
    const d = await fetch(`/api/editor/saved?lesson=${encodeURIComponent(lessonId)}&slug=${encodeURIComponent(v.slug)}`).then((r) => r.json()).catch(() => ({ error: 'Couldn’t load it' }));
    setOpen({ v, deck: d.deck ?? null, error: d.error });
  };
  const remove = async (v: Saved) => {
    if (!window.confirm(`Delete the saved version “${v.name}”? Its name can be used again. The live lesson isn’t changed.`)) return;
    await fetch('/api/editor/saved', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: lessonId, slug: v.slug }) });
    if (open?.v.slug === v.slug) setOpen(null);
    load();
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="saved-title" data-saved-versions>
        <div className="p-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1">
            <h2 id="saved-title" className="font-bold text-lg">Saved versions</h2>
            <p className="text-sm text-slate-600">Every publish is saved under the name you gave it. Open one to copy a slide from it, or to go back to it. Undo works until you save.</p>
          </div>
          <button className="text-slate-400 hover:text-slate-700 text-lg" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto p-2">
          {error ? <p className="p-4 text-sm text-red-700">{error}</p>
            : !list ? <p className="p-4 text-sm text-slate-500">Loading…</p>
            : list.length === 0 ? <p className="p-4 text-sm text-slate-500">Nothing saved yet. Publishing saves a version under a name you choose.</p>
            : list.map((v) => (
              <div key={v.slug} className="rounded-lg border border-slate-200 mb-2" data-saved-version>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button className="flex-1 text-left" onClick={() => openVersion(v)} aria-expanded={open?.v.slug === v.slug}>
                    <span className="font-semibold text-slate-900">{open?.v.slug === v.slug ? '▾' : '▸'} {v.name}</span>
                    <span className="block text-xs text-slate-500">{when(v.savedAt)}{v.by ? ` · ${v.by}` : ''} · {v.slides} slide{v.slides === 1 ? '' : 's'}</span>
                  </button>
                  <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => remove(v)} title="Delete this saved version">Delete</button>
                </div>
                {open?.v.slug === v.slug && (
                  <div className="border-t border-slate-200 p-3 bg-slate-50">
                    {open.error ? <p className="text-sm text-red-700">{open.error}</p> : !open.deck ? <p className="text-sm text-slate-500">Loading…</p> : (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-slate-600 flex-1">Copy a slide in (it goes after slide {slideNumber}), or go back to the whole version:</span>
                          <button className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold"
                            onClick={() => { if (window.confirm(`Replace the draft with “${v.name}” (${open.deck!.slides.length} slides)? Undo works until you save.`)) onReplace(open.deck!, v.name); }}>
                            Replace the draft with it
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {open.deck.slides.map((s, i) => (
                            <div key={s.id} className="flex flex-col gap-1" data-saved-slide>
                              <div className="rounded-md overflow-hidden border border-slate-200 bg-white pointer-events-none">
                                <SlideCanvas slide={s} width="100%" />
                              </div>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="flex-1 text-slate-500 truncate">{i + 1}. {s.topic ?? ''}</span>
                                <button className="px-2 py-0.5 rounded border border-cyan-600 text-cyan-800 bg-white hover:bg-cyan-50" onClick={() => onCopySlide(s, v.name)}>Copy in</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
