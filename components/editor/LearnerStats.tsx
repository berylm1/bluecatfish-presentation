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

/** The slide's hands-on box: how often it's done or skipped, how long it takes, which items trip learners up. */
function HandsOnRow({ h }: { h: NonNullable<SlideStats['handsOn']> }) {
  const doneShare = h.started ? Math.round((h.done / h.started) * 100) : null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
      <span className="font-semibold text-slate-900">🖐 Hands-on</span>
      <span className="whitespace-nowrap">done <b>{h.done}</b> of <b>{h.started}</b>{doneShare !== null && ` (${doneShare}%)`}</span>
      {h.skipped > 0 && <span className="whitespace-nowrap" title="Learners who pressed Skip">skipped <b>{h.skipped}</b></span>}
      {h.avgSeconds !== null && <span className="whitespace-nowrap">⏱ avg <b>{h.avgSeconds}</b>s to finish</span>}
      {h.wrong > 0 && <span className="whitespace-nowrap" title="Drops in the wrong group, steps tapped out of order">✗ wrong moves <b>{h.wrong}</b></span>}
      {h.steppedIn > 0 && <span className="whitespace-nowrap" title="The same item wrong twice: the professor explained it">🧑‍🏫 professor stepped in <b>{h.steppedIn}</b></span>}
      {h.finn > 0 && <span className="whitespace-nowrap" title="Finn put an item in the wrong group (or guessed wrong) for the learner to catch">🙋 caught Finn&apos;s mistake <b>{h.finnCaught}</b> of <b>{h.finn}</b></span>}
      {h.hints > 0 && <span className="whitespace-nowrap" title="“I’m lost” or a puzzled face while doing it: the hand showed again">👆 needed the hint <b>{h.hints}</b></span>}
      {h.hardest.length > 0 && (
        <span className="whitespace-nowrap" title="What went wrong most often">
          trickiest: {h.hardest.map(([item, n], i) => <span key={item}>{i ? ', ' : ''}<b>{item}</b> ({n})</span>)}
        </span>
      )}
    </div>
  );
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
      {stats?.handsOn && <HandsOnRow h={stats.handsOn} />}
    </div>
  );
}
