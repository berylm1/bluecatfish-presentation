'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IMAGE_DRAG_TYPE } from './EditCanvas';

type Img = { url: string; description: string };

// Images already in Supabase, with search. Click to add to the slide, drag to
// place it where you drop it. Upload runs the normal image pipeline, which
// writes a description automatically.
export default function ImageLibrary({
  onAdd,
  mode = 'add',
}: {
  onAdd: (img: Img) => void;
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
      const res = await fetch(`/api/editor/images${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setImages(data.images ?? []);
      setStatus(data.images?.length ? null : 'No images found.');
    } catch (e) {
      setStatus(`Could not load images: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const upload = async (file: File) => {
    setStatus(`Uploading ${file.name} and writing its description…`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/image-Ingest', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Upload failed (${res.status})`);
      setImages((list) => [{ url: data.url, description: data.description ?? '' }, ...list]);
      setStatus(null);
    } catch (e) {
      setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
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
      {mode === 'background' && <p className="text-xs text-cyan-700">Click an image to use it as this slide’s background.</p>}
      {status && <p className="text-xs text-slate-500">{status}</p>}
      <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
        {images.map((img) => (
          <button
            key={img.url}
            draggable={mode === 'add'}
            onDragStart={(e) => e.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(img))}
            onClick={() => onAdd(img)}
            title={img.description}
            className="group relative aspect-square rounded-md overflow-hidden bg-slate-100 border border-slate-200 hover:border-cyan-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.description} loading="lazy" className="w-full h-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-[10px] leading-tight text-white text-left line-clamp-3 opacity-0 group-hover:opacity-100">
              {img.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
