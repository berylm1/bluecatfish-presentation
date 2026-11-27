'use client';

import { useEffect, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Slide } from '@/lib/canvas/types';
import { topicIndexes } from '@/lib/canvas/queue';
import Icon from '@/components/Icon';

/*
 * Every slide at once (the slide list's grid button): the lesson as a wall of slides, to see its shape and to move
 * slides around by dragging. A mark only where something needs a look. Click a slide to open it.
 */
export default function SlideGrid({ slides, current, warnCounts, onOpen, onMove, onClose }: {
  slides: Slide[];
  current: number;
  warnCounts: number[];
  onOpen: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onClose: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const topics = topicIndexes(slides);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[900] bg-slate-100 flex flex-col" role="dialog" aria-label="Slide overview" data-slide-grid>
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-300">
        <Icon name="grid" size={18} />
        <h2 className="font-bold text-base text-slate-900">All {slides.length} slides</h2>
        <span className="text-sm text-slate-500">Drag a slide to move it · click to open it</span>
        <button className="ml-auto px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold" onClick={onClose}>Done</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {slides.map((s, i) => {
            const starts = i === 0 || topics[i] !== topics[i - 1];
            return (
              <div key={s.id} draggable data-grid-slide={i}
                onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDropAt(i); } }}
                onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); setDropAt(null); }}
                onClick={() => { onOpen(i); onClose(); }}
                className={`relative flex flex-col gap-1 cursor-pointer rounded-lg p-2 bg-white border ${i === current ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-400'} ${dropAt === i && dragFrom !== null && dragFrom !== i ? 'ring-2 ring-pink-400' : ''} ${dragFrom === i ? 'opacity-40' : ''}`}>
                <div className="h-4 text-xs font-bold text-slate-700 truncate">{starts ? (s.topic || 'No topic yet') : ''}</div>
                <div className="pointer-events-none"><SlideCanvas slide={s} width="100%" shadow={false} /></div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{i + 1}</span>
                  {warnCounts[i] > 0 && <span className="px-1.5 rounded bg-amber-400 font-bold text-slate-900">{warnCounts[i]} to check</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
