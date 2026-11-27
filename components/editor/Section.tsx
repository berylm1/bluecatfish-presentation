'use client';

import { useEffect, useState, type ReactNode } from 'react';

/*
 * A part of a side panel that folds: its name (and what's in it, in a few words) is always there, its fields only
 * when it's open. So a long panel reads as a short list of parts, not one long scroll. Open or shut is remembered
 * per part in this browser (so the editor comes back the way each person left it).
 */
export default function Section({ id, title, hint, icon, open: openAtFirst = false, count, children }: {
  /** Its name for remembering open/shut ("el-says") */
  id: string;
  title: string;
  /** A few words on what's inside, beside the title */
  hint?: string;
  icon?: string;
  open?: boolean;
  /** A number to show on it (things to look at) */
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(openAtFirst);
  useEffect(() => {
    try { const v = localStorage.getItem(`editor:section:${id}`); if (v === '1' || v === '0') setOpen(v === '1'); } catch { /* fine */ }
  }, [id]);
  const toggle = () => setOpen((v) => { try { localStorage.setItem(`editor:section:${id}`, v ? '0' : '1'); } catch { /* fine */ } return !v; });
  return (
    <section className={`rounded-lg border ${open ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50'}`} data-section={id} data-open={open || undefined}>
      <button type="button" onClick={toggle} aria-expanded={open}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg ${open ? 'rounded-b-none border-b border-slate-200 bg-slate-100' : 'hover:bg-slate-100'}`}>
        {icon && <span aria-hidden className="text-base leading-none">{icon}</span>}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-900">{title}</span>
          {hint && !open && <span className="block text-[11px] text-slate-500 truncate">{hint}</span>}
        </span>
        {!!count && <span className="min-w-5 px-1.5 rounded-full bg-amber-400 text-[11px] font-bold text-slate-900 text-center leading-5">{count}</span>}
        <span aria-hidden className={`text-slate-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="p-3 flex flex-col gap-3">{children}</div>}
    </section>
  );
}
