'use client';

import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';

/*
 * "Share with learners…" (the editor's menu): the lesson's link, to copy, and the same link as a QR code to put on a
 * board or a handout (learners point a phone's camera at it). The link opens the lesson's start page; what they get
 * is the published lesson (or the AI-made one while nothing is published).
 */
export default function ShareLesson({ lessonId, title, published, onClose }: { lessonId: string; title: string; published: boolean; onClose: () => void }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [plain, setPlain] = useState(false);   // the version with no classmates or questions (static)
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const link = origin ? `${origin}/presentation?lesson=${encodeURIComponent(lessonId)}${plain ? '&mode=static' : ''}` : '';
  const cells = useMemo(() => {
    if (!link) return null;
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const n = qr.getModuleCount();
    return { n, on: Array.from({ length: n * n }, (_, i) => qr.isDark(Math.floor(i / n), i % n)) };
  }, [link]);
  const svg = cells ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells.n + 8} ${cells.n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${cells.on.map((d, i) => (d ? `<rect x="${(i % cells.n) + 4}" y="${Math.floor(i / cells.n) + 4}" width="1" height="1"/>` : '')).join('')}</svg>` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select it by hand */ } };
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${lessonId}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-label="Share with learners" onPointerDown={onClose} data-share-lesson>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 text-slate-800 flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Share “{title}” with learners</h2>
        {!published && <p className="text-sm rounded-md bg-amber-50 border border-amber-300 text-amber-950 px-3 py-2">This lesson isn’t published yet. Until you press Publish, the link plays the AI-made version if the lesson has one, and says it isn’t open yet if it doesn’t.</p>}
        <div className="flex gap-2">
          <input readOnly value={link} aria-label="The lesson’s link" onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 bg-slate-50" />
          <button className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold whitespace-nowrap" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={plain} onChange={(e) => setPlain(e.target.checked)} />
          <span>The plain version<span className="block text-xs text-slate-500">Just the slides and the professor: no classmates, no questions, no camera.</span></span>
        </label>
        {svg && (
          <div className="flex items-center gap-4">
            <div className="w-40 h-40 shrink-0 rounded-lg border border-slate-300 overflow-hidden" data-qr dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="text-sm text-slate-600 flex flex-col gap-2">
              <p>Learners point a phone’s camera at this to open the lesson.</p>
              <button className="self-start px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold" onClick={save}>Download the code</button>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
