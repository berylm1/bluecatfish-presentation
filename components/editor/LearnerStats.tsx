'use client';

import type { SlideStats } from '@/lib/canvas/slideStats';

// The slide editor's learner heatmap: a badge per slide in the list, and the
// details for the open slide (from /api/editor/slide-stats).

const MIN_LEARNERS = 3;   // fewer than this and a percentage means little

/** Badge colour: green = went fine, amber = some struggled, red = rework this slide. */
export function heatTone(s: SlideStats | undefined): { cls: string; label: string } | null {
  if (!s || s.learners === 0) return null;
  const pct = Math.round(s.share * 100);
  if (s.learners < MIN_LEARNERS) return { cls: 'bg-slate-300 text-slate-800', label: `${s.learners}👤` };
  if (s.share >= 0.35) return { cls: 'bg-red-500 text-white', label: `😕 ${pct}%` };
  if (s.share >= 0.15) return { cls: 'bg-amber-400 text-slate-900', label: `😕 ${pct}%` };
  return { cls: 'bg-emerald-500 text-white', label: `✓ ${pct}%` };
}

export function heatTitle(s: SlideStats): string {
  return `${s.struggled} of ${s.learners} learner${s.learners === 1 ? '' : 's'} struggled on this slide`;
}

export function SlideStatsPanel({ stats, days, onClose }: { stats: SlideStats | undefined; days: number; onClose: () => void }) {
  const row = (label: string, n: number | string | null, hint?: string) =>
    n === 0 || n === null ? null : (
      <span className="whitespace-nowrap" title={hint}>{label} <b>{n}</b></span>
    );
  return (
    <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-slate-900">📊 Learners on this slide · last {days} days</span>
        <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Hide learner data">✕</button>
      </div>
      {!stats || stats.learners === 0 ? (
        <p className="text-slate-500">No learner data for this slide yet. (A slide gets data once it&apos;s published and played.)</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="whitespace-nowrap">
            <b>{stats.struggled}</b> of <b>{stats.learners}</b> struggled ({Math.round(stats.share * 100)}%)
            {stats.learners < MIN_LEARNERS && <span className="text-slate-400"> · too few to judge</span>}
          </span>
          {row('😕 puzzled face', stats.puzzledFace, 'The camera saw a puzzled look')}
          {row('“I’m lost”', stats.lostClicks)}
          {row('“simpler please”', stats.simpler)}
          {row('⟲ repeats', stats.repeats)}
          {row('✋ questions', stats.questions)}
          {row('😐 gone quiet', stats.boredFace, 'The camera saw a flat, bored face')}
          {row('🚫 looked away', stats.away)}
          {stats.helpOffered > 0 && (
            <span className="whitespace-nowrap" title="“You look puzzled — want me to go over that a different way?”">
              help offered <b>{stats.helpOffered}</b>, taken <b>{stats.helpAccepted}</b>
            </span>
          )}
          {stats.selfCheck.got + stats.selfCheck.kind + stats.selfCheck.lost > 0 && (
            <span className="whitespace-nowrap">self-check 😀 <b>{stats.selfCheck.got}</b> 😐 <b>{stats.selfCheck.kind}</b> 😕 <b>{stats.selfCheck.lost}</b></span>
          )}
          {row('⏱ avg seconds here', stats.avgSeconds)}
        </div>
      )}
    </div>
  );
}
