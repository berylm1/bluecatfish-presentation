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
  onSplitTopic,
}: {
  /** "Split this topic" for a long one (its first slide's index) */
  onSplitTopic?: (start: number) => void;
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
  const btn = 'flex-1 px-1 py-1.5 rounded-md bg-white border border-slate-400 hover:bg-slate-100 text-xs font-semibold text-slate-800 shadow-sm';
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
      <div className="flex gap-1" data-help="new-slide">
        <button className={`${btn} !bg-cyan-600 !text-white !border-cyan-700 hover:!bg-cyan-700`} onClick={onAdd} title="New slide after this one">＋ New</button>
        <button className={btn} onClick={onDuplicate}>Duplicate</button>
        <button className={`${btn} !text-red-700`} onClick={onDelete} disabled={slides.length <= 1}>Delete</button>
      </div>
      <div className="text-[11px] text-slate-600 px-0.5 flex items-center justify-between" title="The professor's words at the reading pace, plus about 45 seconds for each hands-on box">
        <span className="whitespace-nowrap">{slides.length} slides · <b className="text-slate-900">{formatLength(length.total)}</b></span>
        {/* What the little marks on the slides mean */}
        <span className="relative group cursor-help underline decoration-dotted whitespace-nowrap" data-badge-key>ⓘ Marks
          <span className="hidden group-hover:block absolute right-0 top-full mt-1 z-30 w-56 whitespace-normal rounded-md border border-slate-300 bg-white shadow-xl p-2 text-[11px] leading-snug text-slate-700 no-underline">
            <b className="px-1 rounded bg-amber-400 text-slate-900">⚠ 2</b> things to check on the slide<br />
            <b className="px-1 rounded bg-violet-500 text-white">⇄</b> has a helper (what it turns into when a learner is lost); <b>✨</b> the AI drafted it<br />
            <b className="text-violet-600">✨</b> by a topic: the AI named it<br />
            <b className="text-amber-700">⏱</b> a topic that runs long
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-1 pb-8">
        {slides.map((s, i) => (
          <div key={s.id}>
            {(i === 0 || topics[i] !== topics[i - 1]) && (
              <div className="flex items-baseline gap-1 mt-2 mb-1 px-1 py-1 rounded-md bg-slate-200/80" data-topic-head>
                <button className="flex-1 min-w-0 text-left text-[11px] font-bold uppercase tracking-wide text-slate-800 truncate hover:text-cyan-800" title={`${s.topic ?? ''} (click to fold or unfold)`}
                  onClick={(e) => { e.stopPropagation(); fold(i); }} aria-expanded={!hidden(i)}>
                  <span aria-hidden className="inline-block w-3 text-slate-500">{hidden(i) ? '▸' : '▾'}</span>
                  {s.topicByAI && <span className="text-violet-600" title="Topic named by the AI">✨ </span>}
                  {s.topic || 'No topic yet'}
                  {hidden(i) && <span className="normal-case font-medium text-slate-500"> · {count(i)} slide{count(i) === 1 ? '' : 's'}</span>}
                </button>
                {(() => {
                  const t = length.topics[topics[i]];
                  if (!t) return null;
                  const how = `About ${formatLength(t.talk)} of talking${t.handsOn ? ` + ${formatLength(t.handsOn)} hands-on` : ''}`;
                  return t.long
                    ? (t.slides > 1 && onSplitTopic
                      ? <button className="shrink-0 text-[10px] font-semibold text-amber-700 hover:underline" onClick={(e) => { e.stopPropagation(); onSplitTopic(t.start); }}
                          title={`${how}. Topics over ${TOPIC_LONG_SEC / 60} minutes can lose learners. Click: the AI suggests where to split it in two.`}>⏱ {formatLength(t.total)} · split?</button>
                      : <span className="shrink-0 text-[10px] font-semibold text-amber-700" title={`${how}. Topics over ${TOPIC_LONG_SEC / 60} minutes can lose learners: trim the words.`}>⏱ {formatLength(t.total)} · long</span>)
                    : <span className="shrink-0 text-[10px] text-slate-400" title={how}>{formatLength(t.total)}</span>;
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
              className={`relative flex gap-1.5 items-start cursor-pointer rounded-md p-1 ${i === current ? 'bg-cyan-100 ring-2 ring-cyan-500' : 'hover:bg-slate-200'} ${dropAt === i && dragFrom !== i ? 'ring-2 ring-pink-400' : ''}`}
            >
              <span className="text-[11px] font-semibold text-slate-600 w-4 text-right pt-0.5">{i + 1}</span>
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
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
