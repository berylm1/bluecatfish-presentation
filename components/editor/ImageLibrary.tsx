'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IMAGE_DRAG_TYPE } from './EditCanvas';

type Img = { url: string; description: string; credit?: string; creditUrl?: string };
/** A free picture found outside (lib/canvas/openPictures.ts), before it's in the library */
type Found = { source: string; id: string; title: string; thumb: string; page: string; author: string; license: string };

// Images already in Supabase, with search. Click to add to the slide, drag to
// place it where you drop it. Upload runs the normal image pipeline, which
// writes a description automatically.
export default function ImageLibrary({
  onAdd,
  mode = 'add',
  lesson,
  kb,
  onSuggestPlaces,
}: {
  onAdd: (img: Img) => void;
  /** "Suggest where they go": the AI looks at every slide again for a picture from the library (on the next save) */
  onSuggestPlaces?: () => void;
  /** The knowledge base an upload goes in (the lesson's own; not given: the blue catfish lesson's) */
  kb?: string;
  /** The lesson being edited: its knowledge bases' pictures (and the shared ones) */
  lesson?: string;
  /** 'background': picking a slide background instead of adding an element */
  mode?: 'add' | 'background';
}) {
  const [q, setQ] = useState('');
  const [images, setImages] = useState<Img[]>([]);
  const [status, setStatus] = useState<string | null>('Loading…');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (query: string) => {
    setStatus(query ? 'Searching…' : 'Loading…');
    try {
      const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(lesson ? { lesson } : {}) });
      const res = await fetch(`/api/editor/images${params.size ? `?${params}` : ''}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setImages(data.images ?? []);
      setStatus(data.images?.length ? null : 'No images found.');
    } catch (e) {
      setStatus(`Could not load images: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [lesson]);

  useEffect(() => { load(''); }, [load]);

  const upload = async (file: File) => {
    setStatus(`Uploading ${file.name} and writing its description…`);
    try {
      const form = new FormData();
      form.append('file', file);
      if (kb) form.append('kb', kb);
      if (lesson) form.append('lesson', lesson);   // (was: every upload went into the blue catfish lesson's library, whatever the lesson)
      const res = await fetch('/api/image-Ingest', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Upload failed (${res.status})`);
      setImages((list) => [{ url: data.url, description: data.description ?? '' }, ...list]);
      setStatus(null);
      setTab('mine');   // (there it is, first in the lesson's pictures)
    } catch (e) {
      setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Free pictures from outside: Wikimedia Commons and Openverse, openly licensed, each added with its credit
  const [tab, setTab] = useState<'mine' | 'free' | 'upload'>('mine');
  const [freeQ, setFreeQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [freeStatus, setFreeStatus] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const searchFree = async () => {
    if (!freeQ.trim()) return;
    setFreeStatus('Searching Wikimedia Commons and Openverse…'); setFound(null);
    try {
      const d = await fetch(`/api/editor/open-pictures?q=${encodeURIComponent(freeQ.trim())}`).then((r) => r.json());
      if (d.error && !d.pictures?.length) throw new Error(d.error);
      setFound(d.pictures ?? []);
      setFreeStatus(d.pictures?.length ? null : 'Nothing found: try other words (what the picture shows: “pizza slices”, “measuring cup”).');
    } catch (e) {
      setFreeStatus(`Couldn't search: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const addFree = async (p: Found) => {
    if (!lesson || adding) return;
    setAdding(p.id); setFreeStatus(`Adding “${p.title}” (the AI looks at it first)…`);
    try {
      const d = await fetch('/api/editor/open-pictures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson, picks: [{ source: p.source, id: p.id }] }) }).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      const got: Img | undefined = d.added?.[0];
      if (!got) throw new Error(d.notes?.[0] ?? 'It wasn’t added');
      setImages((list) => [got, ...list.filter((x) => x.url !== got.url)]);
      onAdd(got);
      setFreeStatus(`Added, with its credit (${got.credit}).`);
    } catch (e) {
      setFreeStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full" data-images-panel>
      {/* Three places a picture comes from, one at a time (was: all of them stacked in one long panel) */}
      <div className="flex rounded-md border border-slate-400 overflow-hidden text-xs font-semibold shadow-sm" role="tablist" aria-label="Where the picture comes from">
        {([['mine', 'This lesson’s'], ...(lesson ? [['free', '🌍 Find free'] as const] : []), ['upload', 'Upload']] as const).map(([id, name], n) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-images-tab={id}
            className={`flex-1 py-2 ${n ? 'border-l border-slate-400' : ''} ${tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-800 hover:bg-slate-100'}`}>{name}</button>
        ))}
      </div>
      {mode === 'background' && <p className="text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-md px-2 py-1.5">Click a picture to use it as this slide’s background.</p>}

      {tab === 'mine' && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); load(q.trim()); }} className="flex gap-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this lesson’s pictures…" aria-label="Search this lesson’s pictures" className="w-full min-w-0 px-2 py-1.5 rounded-md border border-slate-400 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-cyan-600" />
            <button className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold">Search</button>
          </form>
          <p className="text-xs text-slate-500 -mt-1">Click a picture to add it to the slide, or drag it where you want it.</p>
          {onSuggestPlaces && mode === 'add' && images.length > 0 && (
            <button onClick={onSuggestPlaces} data-suggest-places title="The AI looks at every slide again and suggests pictures from this library for the ones they fit. You say yes or no to each, in the Check tab."
              className="px-2 py-1.5 rounded-md border border-violet-400 bg-violet-50 hover:bg-violet-100 text-xs font-semibold text-violet-900 text-left">
              Suggest where these pictures go
              <span className="block font-normal text-violet-800/80">The AI checks every slide when you save. You pick which to keep.</span>
            </button>
          )}
          {status && <p className="text-xs text-slate-600">{status}{!images.length && lesson && status.startsWith('No images') ? ' Try 🌍 Find free, or Upload.' : ''}</p>}
      {/* Each picture whole, at its own shape (was: cropped to squares to save space); two columns, like a wall of photos */}
      <div className="columns-2 gap-2 overflow-y-auto pr-1" data-image-library>
        {images.map((img) => (
          <button
            key={img.url}
            draggable={mode === 'add'}
            onDragStart={(e) => e.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(img))}
            onClick={() => onAdd(img)}
            title={img.description}
            className="group relative block w-full mb-2 break-inside-avoid rounded-md overflow-hidden bg-slate-100 border border-slate-200 hover:border-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.description} loading="lazy" className="block w-full h-auto" />
            <span className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-xs leading-tight text-white text-left line-clamp-3 opacity-0 group-hover:opacity-100">
              {img.description}{img.credit ? ` (${img.credit})` : ''}
            </span>
          </button>
        ))}
      </div>
        </>
      )}

      {tab === 'free' && lesson && (
        <div className="flex flex-col gap-2" data-free-pictures>
          <p className="text-xs text-slate-600 leading-snug">From Wikimedia Commons and Openverse: free to use with credit. A picture you pick is copied into this lesson’s library and added to the slide. Its credit shows on the slide and on the sources page.</p>
          <form onSubmit={(e) => { e.preventDefault(); void searchFree(); }} className="flex gap-1">
                <input value={freeQ} onChange={(e) => setFreeQ(e.target.value)} placeholder="What it shows: pizza slices…" aria-label="Find free pictures"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-slate-400 text-sm text-slate-900 outline-none focus:border-cyan-500" />
                <button className="px-2 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold">Find</button>
              </form>
              {freeStatus && <p className="text-xs text-slate-500">{freeStatus}</p>}
              {found && found.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 overflow-y-auto">
                  {found.map((p) => (
                    <button key={`${p.source}|${p.id}`} disabled={!!adding} onClick={() => void addFree(p)} title={`${p.title}\n${p.author || 'Unknown author'} · ${p.license}`}
                      className={`relative aspect-square rounded overflow-hidden border bg-slate-100 ${adding === p.id ? 'border-cyan-500 opacity-60' : 'border-slate-200 hover:border-slate-900'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                      <span className="absolute left-0 bottom-0 px-1 bg-black/65 text-[9px] text-white">{p.license}</span>
                    </button>
                  ))}
                </div>
              )}
        </div>
      )}

      {tab === 'upload' && (
        <div className="flex flex-col gap-2">
          <button onClick={() => fileRef.current?.click()} className="px-3 py-6 rounded-lg border-2 border-dashed border-slate-400 text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-400" data-upload>
            Choose a picture to upload
            <span className="block text-xs font-normal text-slate-500 mt-1">JPG, PNG, WebP or GIF, up to 10 MB. The AI writes its description.</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          {status && <p className="text-xs text-slate-600">{status}</p>}
          {/* (the blue catfish lesson's own authored deck: a one-time import) */}
          {(!lesson || /^blue-catfish/.test(lesson)) && (
      <button
        onClick={async () => {
          if (!window.confirm('Add the 18 slides from the authored PDF deck (public/deck) to the image library? Already-added ones are skipped.')) return;
          setStatus('Adding the PDF deck slides (this takes a minute)…');
          try {
            const d = await fetch('/api/editor/import-deck-images', { method: 'POST' }).then((r) => r.json());
            if (d.error) throw new Error(d.error);
            const fails = (d.results ?? []).filter((r: { status: string }) => r.status.startsWith('failed'));
            setStatus(`Added ${d.added} slide(s).${fails.length ? ` ${fails.length} failed: ${fails[0].status}` : ''}`);
            load('');
          } catch (e) {
            setStatus(`Couldn't add them: ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
        className="px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-50 border border-slate-200"
        title="One-time import of the authored slide images"
      >
        ＋ Add the PDF deck slides to the library
      </button>
          )}
        </div>
      )}
    </div>
  );
}
