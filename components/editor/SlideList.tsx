'use client';

import { useMemo, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Slide } from '@/lib/canvas/types';
import { topicIndexes } from '@/lib/canvas/queue';
import { formatLength, lessonLength, TOPIC_LONG_SEC } from '@/lib/canvas/lessonLength';
import type { SlideStats } from '@/lib/canvas/slideStats';
import { heatTitle, heatTone } from './LearnerStats';

// Left column: every slide as a thumbnail. Click to open, drag to reorder.
// A line with the topic name marks where a new topic starts.
export default function SlideList({
  slides,
  current,
  warnCounts,
  heat,
  onOpen,
  onMove,
  onAdd,
  onDuplicate,
  onDelete,
}: {
  slides: Slide[];
  current: number;
  warnCounts: number[];
  /** Learner stats by slide id (the 📊 Learners heatmap), or undefined when it's off. */
  heat?: Record<string, SlideStats>;
  onOpen: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const topics = topicIndexes(slides);
  // How long each topic takes (talk + hands-on), and the whole lesson
  const length = useMemo(() => lessonLength(slides), [slides]);
  const btn = 'flex-1 px-1 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-xs text-slate-700';

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex gap-1">
        <button className={btn} onClick={onAdd} title="New slide after this one">+ New</button>
        <button className={btn} onClick={onDuplicate}>Duplicate</button>
        <button className={`${btn} text-red-600`} onClick={onDelete} disabled={slides.length <= 1}>Delete</button>
      </div>
      <div className="text-[11px] text-slate-500 px-0.5" title="The professor's words at the reading pace, plus about 45 seconds for each hands-on box">
        Lesson ≈ <b className="text-slate-700">{formatLength(length.total)}</b>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-1 pb-8">
        {slides.map((s, i) => (
          <div key={s.id}>
            {(i === 0 || topics[i] !== topics[i - 1]) && (
              <div className="flex items-baseline gap-1 mt-2 mb-1">
                <div className="flex-1 min-w-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 truncate" title={s.topic}>
                  {s.topicByAI && <span className="text-violet-600" title="Topic named by the AI">✨ </span>}
                  {s.topic || 'No topic yet'}
                </div>
                {(() => {
                  const t = length.topics[topics[i]];
                  if (!t) return null;
                  const how = `About ${formatLength(t.talk)} of talking${t.handsOn ? ` + ${formatLength(t.handsOn)} hands-on` : ''}`;
                  return t.long
                    ? <span className="shrink-0 text-[10px] font-semibold text-amber-700" title={`${how}. Topics over ${TOPIC_LONG_SEC / 60} minutes can lose learners: split it into two topics, or trim the words.`}>⏱ {formatLength(t.total)} · long</span>
                    : <span className="shrink-0 text-[10px] text-slate-400" title={how}>{formatLength(t.total)}</span>;
                })()}
              </div>
            )}
            <div
              draggable
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDropAt(i); } }}
              onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); setDropAt(null); }}
              onClick={() => onOpen(i)}
              className={`relative flex gap-1.5 items-start cursor-pointer rounded-md p-1 ${i === current ? 'bg-cyan-100 ring-2 ring-cyan-500' : 'hover:bg-slate-200'} ${dropAt === i && dragFrom !== i ? 'ring-2 ring-pink-400' : ''}`}
            >
              <span className="text-[10px] text-slate-500 w-4 text-right pt-0.5">{i + 1}</span>
              <div className="flex-1 pointer-events-none">
                <SlideCanvas slide={s} width="100%" shadow={false} />
              </div>
              {warnCounts[i] > 0 && (
                <span className="absolute top-1 right-1 px-1 rounded bg-amber-400 text-[10px] font-bold text-slate-900" title="This slide has warnings">
                  ⚠ {warnCounts[i]}
                </span>
              )}
              {!!s.helper?.elements.length && (
                <span className="absolute bottom-1 left-6 px-1 rounded bg-violet-500 text-[10px] font-bold text-white"
                  title={s.helper.byAI ? 'Has a helper drafted by the AI (what it morphs into when a learner is lost)' : 'Has a helper (what it morphs into when a learner is lost)'}>
                  ⇄{s.helper.byAI ? ' ✨' : ''}
                </span>
              )}
              {heat && (() => {
                const tone = heatTone(heat[s.id]);
                return tone && (
                  <span className={`absolute bottom-1 right-1 px-1 rounded text-[10px] font-bold ${tone.cls}`} title={heatTitle(heat[s.id])}>
                    {tone.label}
                  </span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
