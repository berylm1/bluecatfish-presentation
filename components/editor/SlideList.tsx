'use client';

import { useMemo, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Slide } from '@/lib/canvas/types';
import { topicIndexes } from '@/lib/canvas/queue';
import { formatLength, lessonLength, TOPIC_LONG_SEC } from '@/lib/canvas/lessonLength';
import type { SlideStats } from '@/lib/canvas/slideStats';
import { heatTitle, heatTone } from './LearnerStats';
import Icon from '@/components/Icon';

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
  onSplitTopic,
  onOverview,
}: {
  /** Every slide at once, to reorder (the overview grid) */
  onOverview?: () => void;
  /** "Split this topic" for a long one (its first slide's index) */
  onSplitTopic?: (start: number) => void;
  slides: Slide[];
  current: number;
  warnCounts: number[];
  /** Learner stats by slide id (the Learners heatmap), or undefined when it's off. */
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
  const tool = 'w-8 h-8 shrink-0 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 flex items-center justify-center disabled:opacity-40';
  // Topics folded shut (by their first slide's id): a long lesson reads as its list of topics. The topic of the
  // slide being edited is always open.
  const [shut, setShut] = useState<Set<string>>(new Set());
  const starts = slides.map((_, i) => i === 0 || topics[i] !== topics[i - 1]);
  const startOf = (i: number) => { let k = i; while (k > 0 && !starts[k]) k--; return k; };
  const hidden = (i: number) => shut.has(slides[startOf(i)].id) && startOf(i) !== startOf(current);
  const fold = (i: number) => setShut((was) => { const next = new Set(was); const id = slides[i].id; if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const count = (i: number) => { let n = 1; while (i + n < slides.length && !starts[i + n]) n++; return n; };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-1" data-help="new-slide">
        <button className="flex-1 px-2 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-1" onClick={onAdd} title="New slide after this one"><Icon name="plus" size={15} /> New</button>
        <button className={tool} onClick={onDuplicate} title="Duplicate this slide" aria-label="Duplicate this slide"><Icon name="copy" size={16} /></button>
        {onOverview && <button className={tool} onClick={onOverview} title="All the slides at once: drag to reorder" aria-label="Slide overview" data-help="overview"><Icon name="grid" size={16} /></button>}
        <span className="w-px h-6 bg-slate-300 mx-0.5" />
        <button className={`${tool} hover:!bg-red-50 hover:!text-red-700 hover:!border-red-300`} onClick={onDelete} disabled={slides.length <= 1} title="Delete this slide" aria-label="Delete this slide"><Icon name="trash" size={16} /></button>
      </div>
      <div className="text-xs text-slate-600 px-0.5" title="The professor's words at the reading pace, plus about 45 seconds for each hands-on box">
        {slides.length} slides · <b className="text-slate-900">{formatLength(length.total)}</b>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-1 pb-8">
        {slides.map((s, i) => (
          <div key={s.id}>
            {(i === 0 || topics[i] !== topics[i - 1]) && (
              <div className="flex items-baseline gap-1 mt-3 mb-1 px-1" data-topic-head>
                <button className="flex-1 min-w-0 text-left text-xs font-bold text-slate-700 truncate hover:text-slate-950" title={`${s.topic ?? ''} (click to fold or unfold)`}
                  onClick={(e) => { e.stopPropagation(); fold(i); }} aria-expanded={!hidden(i)}>
                  <span aria-hidden className="inline-block w-3 text-slate-500">{hidden(i) ? '▸' : '▾'}</span>
                  {s.topic || 'No topic yet'}
                  {hidden(i) && <span className="normal-case font-medium text-slate-500"> · {count(i)} slide{count(i) === 1 ? '' : 's'}</span>}
                </button>
                {(() => {
                  const t = length.topics[topics[i]];
                  if (!t) return null;
                  const how = `About ${formatLength(t.talk)} of talking${t.handsOn ? ` + ${formatLength(t.handsOn)} hands-on` : ''}`;
                  return t.long
                    ? (t.slides > 1 && onSplitTopic
                      ? <button className="shrink-0 text-xs font-semibold text-amber-700 hover:underline" onClick={(e) => { e.stopPropagation(); onSplitTopic(t.start); }}
                          title={`${how}. Topics over ${TOPIC_LONG_SEC / 60} minutes can lose learners. Click: the AI suggests where to split it in two.`}>{formatLength(t.total)} · split?</button>
                      : <span className="shrink-0 text-xs font-semibold text-amber-700" title={`${how}. Topics over ${TOPIC_LONG_SEC / 60} minutes can lose learners: trim the words.`}>{formatLength(t.total)} · long</span>)
                    : <span className="shrink-0 text-xs text-slate-400" title={how}>{formatLength(t.total)}</span>;
                })()}
              </div>
            )}
            {!hidden(i) && <div
              draggable
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDropAt(i); } }}
              onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); setDropAt(null); }}
              onClick={() => onOpen(i)}
              className={`relative flex gap-1.5 items-start cursor-pointer rounded-md p-1 ${i === current ? 'bg-white ring-2 ring-slate-900 shadow-sm' : 'hover:bg-slate-200'} ${dropAt === i && dragFrom !== i ? 'ring-2 ring-pink-400' : ''}`}
            >
              <span className="text-xs font-semibold text-slate-600 w-4 text-right pt-0.5">{i + 1}</span>
              <div className="flex-1 pointer-events-none">
                <SlideCanvas slide={s} width="100%" shadow={false} />
              </div>
              {warnCounts[i] > 0 && (
                <span className="absolute top-1 right-1 px-1 rounded bg-amber-400 text-xs font-bold text-slate-900" title="This slide has warnings">
                  {warnCounts[i]} to check
                </span>
              )}
              {heat && (() => {
                const tone = heatTone(heat[s.id]);
                return tone && (
                  <span className={`absolute bottom-1 right-1 px-1 rounded text-xs font-bold ${tone.cls}`} title={heatTitle(heat[s.id])}>
                    {tone.label}
                  </span>
                );
              })()}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
