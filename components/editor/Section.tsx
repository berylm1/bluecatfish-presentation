'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/Icon';

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
  icon?: IconName;
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
    <section className={`border-b border-slate-200 ${open ? 'pb-3' : ''}`} data-section={id} data-open={open || undefined}>
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center gap-2 py-2.5 text-left group">
        {icon && <span className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${open ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'}`}><Icon name={icon} size={16} /></span>}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          {hint && !open && <span className="block text-xs text-slate-500 truncate">{hint}</span>}
        </span>
        {!!count && <span className="min-w-5 px-1.5 rounded-full bg-amber-400 text-xs font-bold text-slate-900 text-center leading-5">{count}</span>}
        <Icon name="chevron-down" size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pt-1 flex flex-col gap-3">{children}</div>}
    </section>
  );
}
