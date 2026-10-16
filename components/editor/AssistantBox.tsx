'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * The ✨ helper box at the top of the slide editor (/api/editor/assistant): ask where something is or
 * whether the editor can do something ("Show me" points at it), find a picture in the library
 * (the closest one and a few more, each with "Add to slide"), or find a sentence in the sources
 * (the closest one and a few more, each with "Add as a text box"). Only about the editor and the lesson.
 */

type Img = { url: string; description: string };
type Sentence = { text: string; source: string | null };
type Reply =
  | { kind: 'help'; answer: string; show?: string }
  | { kind: 'images'; query: string; images: Img[] }
  | { kind: 'text'; query: string; best: Sentence | null; more: Sentence[] }
  | { kind: 'other'; answer: string };

const EXAMPLES = ['Where do I make a PDF?', 'Find a picture of a blue crab', 'A sentence about blue catfish scales', 'Can I go back to an older version?'];

export default function AssistantBox({ onShow, onAddImage, onAddText }: {
  /** Point at a part of the editor ([data-help="…"]) */
  onShow: (where: string) => void;
  onAddImage: (img: Img) => void;
  onAddText: (text: string) => void;
}) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  // closes on a click outside, or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const ask = async (question = q) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setError(null); setReply(null); setAsked(text); setOpen(true); setAdded(new Set());
    try {
      const res = await fetch('/api/editor/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(d.error || `The helper couldn’t answer (${res.status})`);
      setReply(d as Reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addedOnce = (key: string, run: () => void) => { run(); setAdded((s) => new Set(s).add(key)); };

  return (
    <div className="relative w-full max-w-[24rem]" ref={box} data-help="helper">
      <form onSubmit={(e) => { e.preventDefault(); ask(); }}
        className="flex items-center gap-1.5 w-full h-9 pl-2.5 pr-1 rounded-md border-2 border-violet-300 bg-violet-50/60 focus-within:border-violet-500 focus-within:bg-white">
        <span aria-hidden>✨</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} onFocus={() => (reply || error) && setOpen(true)}
          placeholder="Ask the helper: where is…, find a picture…" aria-label="Ask the editor helper"
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-500" />
        <button className="px-2.5 h-7 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50" disabled={busy || !q.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[60] w-[30rem] max-w-[90vw] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl p-3 text-sm" role="dialog" aria-label="The helper's answer" data-assistant-panel>
          <div className="flex items-start gap-2 mb-2">
            <p className="flex-1 text-xs text-slate-500">You asked: <span className="text-slate-800">{asked}</span></p>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          {busy && <p className="text-slate-500" role="status">✨ Looking…</p>}
          {error && <p className="text-red-700" role="alert">{error}</p>}
          {reply?.kind === 'help' && (
            <div className="flex flex-col gap-2">
              <p className="text-slate-800">{reply.answer}</p>
              {reply.show && <button className="self-start px-2.5 py-1 rounded-md border border-violet-500 text-violet-800 hover:bg-violet-50 text-xs font-semibold" onClick={() => { setOpen(false); onShow(reply.show!); }}>👉 Show me</button>}
            </div>
          )}
          {reply?.kind === 'other' && <p className="text-slate-700">{reply.answer}</p>}
          {reply?.kind === 'images' && (
            reply.images.length === 0 ? <p className="text-slate-600">No pictures in the library match “{reply.query}”. Upload one in Image upload (top bar).</p> : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-600">The closest picture to “{reply.query}”:</p>
                <ImageChoice img={reply.images[0]} big done={added.has(reply.images[0].url)} onAdd={() => addedOnce(reply.images[0].url, () => onAddImage(reply.images[0]))} />
                {reply.images.length > 1 && (
                  <>
                    <p className="text-xs font-semibold text-slate-600 mt-1">A few more:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {reply.images.slice(1).map((img) => <ImageChoice key={img.url} img={img} done={added.has(img.url)} onAdd={() => addedOnce(img.url, () => onAddImage(img))} />)}
                    </div>
                  </>
                )}
              </div>
            ))}
          {reply?.kind === 'text' && (
            !reply.best ? <p className="text-slate-600">Nothing in the sources says that, about “{reply.query}”. Add a source in Text upload (top bar).</p> : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-600">The closest sentence in the sources:</p>
                <SentenceChoice s={reply.best} done={added.has(reply.best.text)} onAdd={() => addedOnce(reply.best!.text, () => onAddText(reply.best!.text))} />
                {reply.more.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-600 mt-1">A few more:</p>
                    {reply.more.map((s) => <SentenceChoice key={s.text} s={s} done={added.has(s.text)} onAdd={() => addedOnce(s.text, () => onAddText(s.text))} />)}
                  </>
                )}
              </div>
            ))}
          {(reply || error) && (
            <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
              <span className="text-[11px] text-slate-400 w-full">Try:</span>
              {EXAMPLES.filter((x) => x !== asked).slice(0, 3).map((x) => (
                <button key={x} className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-700" onClick={() => { setQ(x); ask(x); }}>{x}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageChoice({ img, big, done, onAdd }: { img: Img; big?: boolean; done: boolean; onAdd: () => void }) {
  return (
    <div className={`flex ${big ? 'gap-3 items-start' : 'flex-col gap-1'}`} data-helper-image>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.url} alt={img.description} className={`${big ? 'w-40' : 'w-full'} h-auto rounded border border-slate-200 bg-slate-50`} />
      <div className={`flex flex-col gap-1 ${big ? 'flex-1' : ''}`}>
        {big && <p className="text-xs text-slate-600 line-clamp-4">{img.description}</p>}
        <button className="self-start px-2 py-0.5 rounded border border-cyan-600 text-cyan-800 bg-white hover:bg-cyan-50 text-xs disabled:opacity-60" onClick={onAdd} disabled={done} title={img.description}>
          {done ? '✓ Added' : 'Add to slide'}
        </button>
      </div>
    </div>
  );
}

function SentenceChoice({ s, done, onAdd }: { s: Sentence; done: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2" data-helper-sentence>
      <p className="text-slate-800">“{s.text}”</p>
      <div className="mt-1 flex items-center gap-2">
        {s.source && <span className="text-[11px] text-slate-500 flex-1 truncate">📄 {s.source}</span>}
        <button className="ml-auto px-2 py-0.5 rounded border border-cyan-600 text-cyan-800 bg-white hover:bg-cyan-50 text-xs disabled:opacity-60" onClick={onAdd} disabled={done}>
          {done ? '✓ Added' : 'Add as a text box'}
        </button>
      </div>
    </div>
  );
}
