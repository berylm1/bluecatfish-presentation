'use client';

import type { SlideStats } from '@/lib/canvas/slideStats';
import type { SlideElement } from '@/lib/canvas/types';
import { shownWords } from '@/lib/canvas/queue';

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
      <span className="font-semibold text-slate-900">Hands-on</span>
      <span className="whitespace-nowrap">done <b>{h.done}</b> of <b>{h.started}</b>{doneShare !== null && ` (${doneShare}%)`}</span>
      {h.skipped > 0 && <span className="whitespace-nowrap" title="Learners who pressed Skip">skipped <b>{h.skipped}</b></span>}
      {h.avgSeconds !== null && <span className="whitespace-nowrap">avg <b>{h.avgSeconds}</b>s to finish</span>}
      {h.wrong > 0 && <span className="whitespace-nowrap" title="Drops in the wrong group, steps tapped out of order">✗ wrong moves <b>{h.wrong}</b></span>}
      {h.steppedIn > 0 && <span className="whitespace-nowrap" title="The same item wrong twice: the professor explained it">professor stepped in <b>{h.steppedIn}</b></span>}
      {h.finn > 0 && <span className="whitespace-nowrap" title="Finn put an item in the wrong group (or guessed wrong) for the learner to catch">caught Finn&apos;s mistake <b>{h.finnCaught}</b> of <b>{h.finn}</b></span>}
      {h.hints > 0 && <span className="whitespace-nowrap" title="“I’m lost” or a puzzled face while doing it: the hand showed again">👆 needed the hint <b>{h.hints}</b></span>}
      {h.hardest.length > 0 && !(h.wrongAnswers ?? []).length && (
        <span className="whitespace-nowrap" title="What went wrong most often">
          trickiest: {h.hardest.map(([item, n], i) => <span key={item}>{i ? ', ' : ''}<b>{item}</b> ({n})</span>)}
        </span>
      )}
      {/* What learners answered wrong, by question: the answers that keep coming back show what was misunderstood */}
      {(h.wrongAnswers ?? []).length > 0 && (
        <div className="w-full mt-1" data-wrong-answers>
          <span className="font-semibold text-slate-900">What learners answered wrong</span>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {h.wrongAnswers.map((w) => (
              <li key={w.question} className="flex flex-wrap gap-x-2">
                <span className="text-slate-900">{w.question}</span>
                <span className="text-slate-600">{w.answers.map(([a, n], i) => <span key={a}>{i ? ' · ' : ''}<b className="text-red-700">{a}</b>{n > 1 ? ` ×${n}` : ''}</span>)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The confusion meter on this slide: which of its boxes learners got stuck on (their points, averaged), most first */
function MeterRow({ m, elements }: { m: NonNullable<SlideStats['meter']>; elements?: SlideElement[] }) {
  const words = (box: string | null) => {
    const el = box ? elements?.find((e) => e.id === box) : null;
    const w = el ? shownWords(el).replace(/\s+/g, ' ').trim() : '';
    return box === null ? 'the slide itself' : w ? (w.length > 60 ? `${w.slice(0, 58)}…` : w) : 'a box no longer on the slide';
  };
  const top = Math.max(1, ...m.boxes.map((b) => b.avg));
  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-100" data-meter-row>
      <span className="font-semibold text-slate-900">🧭 Where learners got stuck</span>
      <span className="text-slate-400" title="The confusion meter's points: “I’m lost” 3, “simpler please” 2, a hands-on mistake 1… averaged over the learners"> · confusion points, average of {m.learners} · whole slide <b className="text-slate-700">{m.avgPoints}</b></span>
      {m.boxes.length ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {m.boxes.map((b) => (
            <li key={b.box ?? ''} className="flex items-center gap-2">
              <span className="shrink-0 w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
                <span className="block h-full rounded-full bg-amber-500" style={{ width: `${Math.round((b.avg / top) * 100)}%` }} />
              </span>
              <b className="shrink-0 w-8 text-right">{b.avg}</b>
              <span className="truncate">{words(b.box)}</span>
              {b.stuck > 0 && <span className="ml-auto shrink-0 text-slate-500 whitespace-nowrap">{b.stuck} stuck</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-slate-500">Nobody got stuck here.</p>}
    </div>
  );
}

/** Share of learners who skipped or needed help with a hands-on box: what puts a box at the top of the list. */
const trouble = (h: NonNullable<SlideStats['handsOn']>) => (h.started ? Math.min(1, (h.skipped + h.hints + h.steppedIn) / h.started) : 0);

/**
 * Every hands-on box in the lesson, the ones learners skip or need help with most first:
 * which boxes to look at again (a confusing instruction, a wrong or tricky answer).
 */
function HandsOnOverview({ all, slides, current, onGo }: {
  all: Record<string, SlideStats>;
  slides: { id: string; topic?: string }[];
  current: string;
  onGo: (index: number) => void;
}) {
  const boxes = slides
    .map((s, i) => ({ i, s, h: all[s.id]?.handsOn }))
    .filter((b): b is { i: number; s: { id: string; topic?: string }; h: NonNullable<SlideStats['handsOn']> } => !!b.h && b.h.started > 0)
    .sort((a, b) => trouble(b.h) - trouble(a.h) || b.h.skipped - a.h.skipped);
  if (!boxes.length) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-100" data-handson-overview>
      <span className="font-semibold text-slate-900">Hands-on boxes in this lesson</span>
      <span className="text-slate-400"> · most skipped or needing help first</span>
      <ul className="mt-1 flex flex-col">
        {boxes.slice(0, 6).map(({ i, s, h }) => {
          const pct = Math.round(trouble(h) * 100);
          const tone = h.started < MIN_LEARNERS ? 'bg-slate-300 text-slate-800' : pct >= 35 ? 'bg-red-500 text-white' : pct >= 15 ? 'bg-amber-400 text-slate-900' : 'bg-emerald-500 text-white';
          return (
            <li key={s.id}>
              <button onClick={() => onGo(i)} disabled={s.id === current}
                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 disabled:bg-slate-100 text-left">
                <span className={`shrink-0 w-11 text-center rounded px-1 text-xs font-semibold ${tone}`} title="Skipped or needed help">{pct}%</span>
                <span className="shrink-0 font-medium text-slate-900">Slide {i + 1}</span>
                <span className="truncate text-slate-500">{s.topic}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap">
                  skipped <b>{h.skipped}</b> · help <b>{h.hints + h.steppedIn}</b> · done <b>{h.done}</b>/<b>{h.started}</b>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** How long learners spend on each slide (the average), as bars: a slide far longer or shorter than its neighbours stands out. */
function TimeOverview({ all, slides, current, onGo }: { all: Record<string, SlideStats>; slides: { id: string; topic?: string }[]; current: string; onGo: (index: number) => void }) {
  const times = slides.map((s) => all[s.id]?.avgSeconds ?? null);
  const known = times.filter((t): t is number => t !== null);
  if (known.length < 2) return null;
  const top = Math.max(...known);
  const total = known.reduce((a, b) => a + b, 0);
  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-100" data-time-overview>
      <span className="font-semibold text-slate-900">Time on each slide</span>
      <span className="text-slate-400"> · average seconds · about {Math.round(total / 60)} min for the whole lesson</span>
      <div className="mt-1 flex items-end gap-0.5 h-12" role="list">
        {slides.map((s, i) => {
          const t = times[i];
          return (
            <button key={s.id} role="listitem" onClick={() => onGo(i)} title={`Slide ${i + 1}${s.topic ? ` · ${s.topic}` : ''}: ${t === null ? 'no data yet' : `${t} s on average`}`}
              className="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch group">
              <span className={`block rounded-t ${s.id === current ? 'bg-slate-900' : 'bg-slate-400 group-hover:bg-slate-600'}`} style={{ height: t === null ? '2px' : `${Math.max(6, Math.round((t / top) * 100))}%` }} />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-slate-400"><span>slide 1</span><span>slide {slides.length}</span></div>
    </div>
  );
}

/** Every slide's numbers as a CSV file (opens in any spreadsheet). */
function downloadCsv(all: Record<string, SlideStats>, slides: { id: string; topic?: string }[], days: number) {
  const cell = (v: string | number | null | undefined) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ['Slide', 'Topic', 'Learners', 'Struggled', 'Struggled %', 'Average seconds', 'I am lost', 'Simpler please', 'Repeats', 'Questions', 'Puzzled faces', 'Looked away',
    'Self-check got it', 'Self-check kind of', 'Self-check lost', 'Hands-on started', 'Hands-on done', 'Hands-on skipped', 'Hands-on wrong moves', 'Hands-on average seconds', 'Wrong answers'];
  const rows = slides.map((s, i) => {
    const st = all[s.id], h = st?.handsOn;
    return [i + 1, s.topic ?? '', st?.learners ?? 0, st?.struggled ?? 0, st ? Math.round(st.share * 100) : 0, st?.avgSeconds, st?.lostClicks ?? 0, st?.simpler ?? 0, st?.repeats ?? 0, st?.questions ?? 0, st?.puzzledFace ?? 0, st?.away ?? 0,
      st?.selfCheck.got ?? 0, st?.selfCheck.kind ?? 0, st?.selfCheck.lost ?? 0, h?.started ?? '', h?.done ?? '', h?.skipped ?? '', h?.wrong ?? '', h?.avgSeconds ?? '',
      (h?.wrongAnswers ?? []).map((w) => `${w.question}: ${w.answers.map(([a, n]) => `${a} (${n})`).join(', ')}`).join(' | ')];
  });
  const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `lesson-results-last-${days}-days.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function SlideStatsPanel({ stats, days, onClose, all, slides, current, onGo }: {
  stats: SlideStats | undefined; days: number; onClose: () => void;
  /** The whole lesson's stats, for the hands-on overview */
  all?: Record<string, SlideStats>; slides?: { id: string; topic?: string; elements?: SlideElement[] }[]; current?: string; onGo?: (index: number) => void;
}) {
  const row = (label: string, n: number | string | null, hint?: string) =>
    n === 0 || n === null ? null : (
      <span className="whitespace-nowrap" title={hint}>{label} <b>{n}</b></span>
    );
  return (
    <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
      <div className="flex items-center gap-3 mb-1">
        <span className="font-semibold text-slate-900 mr-auto">Learners on this slide · last {days} days</span>
        {all && slides && <button className="underline text-slate-700 hover:text-slate-950" onClick={() => downloadCsv(all, slides, days)} data-stats-csv title="Every slide’s numbers as a file that opens in Excel, Numbers or Google Sheets">Download as a spreadsheet</button>}
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
          {row('avg seconds here', stats.avgSeconds)}
        </div>
      )}
      {stats?.meter && <MeterRow m={stats.meter} elements={slides?.find((s) => s.id === current)?.elements} />}
      {stats?.handsOn && <HandsOnRow h={stats.handsOn} />}
      {all && slides && onGo && <TimeOverview all={all} slides={slides} current={current ?? ''} onGo={onGo} />}
      {all && slides && onGo && <HandsOnOverview all={all} slides={slides} current={current ?? ''} onGo={onGo} />}
    </div>
  );
}
