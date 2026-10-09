'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A toolbar button with a small menu under it: opens toward the side with
 * room (the toolbar wraps), closes on a click outside or Escape.
 */
export default function Menu({ label, title, className, width = 'w-64', disabled, children }: {
  label: ReactNode;
  title?: string;
  className: string;
  width?: string;
  disabled?: boolean;
  /** The menu's content; `close` closes it (after a choice) */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [right, setRight] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button className={className} title={title} disabled={disabled} aria-expanded={open} aria-haspopup="menu"
        onClick={(e) => { setRight(e.currentTarget.getBoundingClientRect().left + 300 > window.innerWidth); setOpen((v) => !v); }}>
        {label}
      </button>
      {open && (
        <div className={`absolute ${right ? 'right-0' : 'left-0'} top-full mt-1 z-50 ${width} max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl p-1.5 flex flex-col text-sm`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** One choice in a Menu. */
export function MenuItem({ onClick, children, hint, danger, disabled }: { onClick: () => void; children: ReactNode; hint?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button role="menuitem" disabled={disabled} onClick={onClick}
      className={`text-left px-2.5 py-1.5 rounded-md hover:bg-slate-100 disabled:opacity-40 ${danger ? 'text-red-600' : 'text-slate-800'}`}>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </button>
  );
}

export const MenuHeading = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>
);
