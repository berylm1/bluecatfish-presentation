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
}: {
  onAdd: (img: Img) => void;
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
    } catch (e) {
      setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Free pictures from outside: Wikimedia Commons and Openverse, openly licensed, each added with its credit
  const [freeOpen, setFreeOpen] = useState(false);
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
    <div className="flex flex-col gap-3 h-full">
      <form onSubmit={(e) => { e.preventDefault(); load(q.trim()); }} className="flex gap-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: crab, fishing boat…"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-slate-300 text-sm text-slate-900 outline-none focus:border-cyan-500"
        />
        <button className="px-2 py-1.5 rounded-md bg-slate-800 text-white text-sm">Search</button>
      </form>
      <button onClick={() => fileRef.current?.click()} className="px-2 py-1.5 rounded-md border border-dashed border-slate-400 text-sm text-slate-700 hover:bg-slate-50">
        ⬆ Upload an image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
      />
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
      {lesson && (
        <div className="rounded-md border border-slate-200" data-free-pictures>
          <button onClick={() => setFreeOpen((v) => !v)} className="w-full px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
            🌍 Find free pictures {freeOpen ? '▴' : '▾'}
          </button>
          {freeOpen && (
            <div className="p-2 pt-0 flex flex-col gap-2">
              <p className="text-[11px] text-slate-400 leading-snug">From Wikimedia Commons and Openverse: free to use with credit. A picture you pick is copied into this lesson’s library, and its credit is shown on the slide and the sources page.</p>
              <form onSubmit={(e) => { e.preventDefault(); void searchFree(); }} className="flex gap-1">
                <input value={freeQ} onChange={(e) => setFreeQ(e.target.value)} placeholder="What it shows: pizza slices…" aria-label="Find free pictures"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-slate-300 text-sm text-slate-900 outline-none focus:border-cyan-500" />
                <button className="px-2 py-1.5 rounded-md bg-slate-800 text-white text-sm">Find</button>
              </form>
              {freeStatus && <p className="text-xs text-slate-500">{freeStatus}</p>}
              {found && found.length > 0 && (
                <div className="grid grid-cols-3 gap-1 max-h-64 overflow-y-auto">
                  {found.map((p) => (
                    <button key={`${p.source}|${p.id}`} disabled={!!adding} onClick={() => void addFree(p)} title={`${p.title}\n${p.author || 'Unknown author'} · ${p.license}`}
                      className={`relative aspect-square rounded overflow-hidden border bg-slate-100 ${adding === p.id ? 'border-cyan-500 opacity-60' : 'border-slate-200 hover:border-cyan-500'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                      <span className="absolute left-0 bottom-0 px-1 bg-black/65 text-[9px] text-white">{p.license}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {mode === 'background' && <p className="text-xs text-cyan-700">Click an image to use it as this slide’s background.</p>}
      {status && <p className="text-xs text-slate-500">{status}</p>}
      {/* Each picture whole, at its own shape (was: cropped to squares to save space); two columns, like a wall of photos */}
      <div className="columns-2 gap-2 overflow-y-auto pr-1" data-image-library>
        {images.map((img) => (
          <button
            key={img.url}
            draggable={mode === 'add'}
            onDragStart={(e) => e.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(img))}
            onClick={() => onAdd(img)}
            title={img.description}
            className="group relative block w-full mb-2 break-inside-avoid rounded-md overflow-hidden bg-slate-100 border border-slate-200 hover:border-cyan-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.description} loading="lazy" className="block w-full h-auto" />
            <span className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-[10px] leading-tight text-white text-left line-clamp-3 opacity-0 group-hover:opacity-100">
              {img.description}{img.credit ? ` (${img.credit})` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
