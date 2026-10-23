'use client';

/**
 * /studyResults: the confusion meter through the lesson (lib/confusion.ts), one line per group. Each point is
 * the average topic score of the people who finished; the band around it, the middle half of them (25th to 75th
 * percentile), so one person can't make a group look different. A person picked in the table below: their own
 * line, with a mark where a classmate spoke (filled: because the meter said they were struggling).
 */

import { useMemo, useState } from 'react';
import { THRESHOLDS } from '@/lib/confusion';

export type Curve = { id: string; group: string | null; finished: boolean; scores: (number | null)[]; mates: { topic: number; byMeter: boolean; action: string }[] };

const SERIES = [
  { group: 'classmates', name: 'With classmates', color: '#2a78d6' },
  { group: 'no_classmates', name: 'Without classmates', color: '#eb6834' },
] as const;
const W = 720, H = 300, PAD = { l: 40, r: 120, t: 16, b: 44 };

function quantile(xs: number[], q: number) {
  const v = [...xs].sort((a, b) => a - b);
  const i = (v.length - 1) * q;
  const lo = Math.floor(i);
  return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo);
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function ConfusionGraph({ topics, curves, person, onClearPerson }: { topics: string[]; curves: Curve[]; person: string | null; onClearPerson: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const stats = useMemo(() => SERIES.map((s) => {
    const mine = curves.filter((c) => c.group === s.group && c.finished);
    return {
      ...s, people: mine.length,
      at: topics.map((_, t) => {
        const xs = mine.map((c) => c.scores[t]).filter((x): x is number => typeof x === 'number');
        return xs.length ? { avg: xs.reduce((a, b) => a + b, 0) / xs.length, lo: quantile(xs, 0.25), hi: quantile(xs, 0.75), n: xs.length } : null;
      }),
    };
  }), [curves, topics]);
  const picked = person ? curves.find((c) => c.id === person) ?? null : null;
  if (!topics.length) return <p className="text-sm text-slate-500">No confusion meter data yet (it fills in as people finish topics; migration 012 needs to be run).</p>;

  const top = Math.max(THRESHOLDS.topic[1] + 2, ...stats.flatMap((s) => s.at.map((a) => (a ? a.hi : 0))), ...(picked?.scores.map((x) => x ?? 0) ?? []));
  const yMax = Math.ceil(top / 2) * 2;
  const x = (t: number) => PAD.l + (topics.length === 1 ? (W - PAD.l - PAD.r) / 2 : (t * (W - PAD.l - PAD.r)) / (topics.length - 1));
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const path = (pts: ([number, number] | null)[]) => pts.reduce((d, p, i) => (p ? `${d}${d && pts[i - 1] ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}` : d), '');
  const band = (at: (typeof stats)[number]['at']) => {
    const pts = at.map((a, t) => (a ? { t, ...a } : null)).filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length < 2) return '';
    return `M${pts.map((p) => `${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join('L')}L${pts.reverse().map((p) => `${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join('L')}Z`;
  };
  const ticks = Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2);
  // direct labels at each line's last point, nudged apart when they'd overlap
  const ends = stats.map((s) => { const last = s.at.map((a, t) => (a ? { t, v: a.avg } : null)).filter(Boolean).pop(); return last ? { s, ...last, ly: y(last.v) } : null; }).filter((e): e is NonNullable<typeof e> => !!e);
  if (ends.length === 2 && Math.abs(ends[0].ly - ends[1].ly) < 16) { const mid = (ends[0].ly + ends[1].ly) / 2; const up = ends[0].ly <= ends[1].ly ? 0 : 1; ends[up].ly = mid - 8; ends[1 - up].ly = mid + 8; }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm" aria-label="Legend">
        {stats.map((s) => (
          <span key={s.group} className="flex items-center gap-2 text-slate-700">
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: s.color }} /> {s.name} <span className="text-slate-400">({s.people})</span>
          </span>
        ))}
        {picked && (
          <span className="flex items-center gap-2 text-slate-700">
            <span className="inline-block w-4 border-t-2 border-dashed border-slate-700" /> This person
            <span className="text-slate-400">· ● a classmate helped (the meter) ○ a classmate spoke</span>
            <button className="underline text-cyan-700" onClick={onClearPerson}>clear</button>
          </span>
        )}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
          aria-label="Average confusion per topic for each group"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            let best = 0;
            topics.forEach((_, t) => { if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t; });
            setHover(best);
          }}>
          {/* grid and the levels' thresholds */}
          {ticks.map((v) => <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} /><text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{v}</text></g>)}
          {([['unsure', THRESHOLDS.topic[0]], ['confused', THRESHOLDS.topic[1]]] as const).map(([name, v]) => v <= yMax && (
            <g key={name}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} /><text x={W - PAD.r + 6} y={y(v) + 4} fontSize={11} fill="#64748b">{name}</text></g>
          ))}
          {topics.map((name, t) => <text key={t} x={x(t)} y={H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="#475569">{name.length > 16 ? `${name.slice(0, 15)}…` : name}</text>)}
          <text x={PAD.l} y={H - 6} fontSize={11} fill="#64748b">Topic score (0 = clear). Lines: average of people who finished; bands: the middle half.</text>
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeWidth={1} />}
          {stats.map((s) => <path key={`b${s.group}`} d={band(s.at)} fill={s.color} opacity={0.14} />)}
          {stats.map((s) => <path key={`l${s.group}`} d={path(s.at.map((a, t) => (a ? [t, a.avg] : null)))} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {stats.map((s) => s.at.map((a, t) => a && <circle key={`${s.group}${t}`} cx={x(t)} cy={y(a.avg)} r={hover === t ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth={2} />))}
          {ends.map((e) => <text key={`e${e.s.group}`} x={W - PAD.r + 6} y={e.ly + 4} fontSize={12} fill="#334155">{e.s.name}</text>)}
          {picked && (
            <g>
              <path d={path(picked.scores.map((v, t) => (v === null ? null : [t, v])))} fill="none" stroke="#334155" strokeWidth={2} strokeDasharray="6 4" />
              {picked.scores.map((v, t) => v !== null && <circle key={t} cx={x(t)} cy={y(v)} r={4} fill="#334155" stroke="#fff" strokeWidth={2} />)}
              {picked.mates.filter((m) => m.topic < topics.length).map((m, i) => {
                const v = picked.scores[m.topic] ?? 0;
                return <circle key={`m${i}`} cx={x(m.topic) + 10 + (i % 3) * 7} cy={y(v) - 12} r={4} fill={m.byMeter ? '#334155' : '#fff'} stroke="#334155" strokeWidth={1.5}><title>{m.byMeter ? 'A classmate helped (the meter said they were struggling)' : 'A classmate spoke'}</title></circle>;
              })}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="absolute top-2 pointer-events-none rounded-lg border bg-white shadow px-3 py-2 text-xs"
            style={{ left: `${Math.min(70, (x(hover) / W) * 100 + 2)}%` }}>
            <div className="font-semibold text-slate-800 mb-1">{topics[hover]}</div>
            {stats.map((s) => {
              const a = s.at[hover];
              return <div key={s.group} className="flex items-center gap-2 text-slate-700"><span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} /><b>{a ? r1(a.avg) : '–'}</b> {s.name}{a && <span className="text-slate-400">· middle half {r1(a.lo)}–{r1(a.hi)} · {a.n}</span>}</div>;
            })}
            {picked && <div className="text-slate-700"><b>{picked.scores[hover] ?? '–'}</b> this person</div>}
          </div>
        )}
      </div>
      {/* the same numbers as a table */}
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">As a table</summary>
        <table className="mt-2 text-sm">
          <thead><tr className="text-left text-slate-500"><th className="pr-4 font-medium">Topic</th>{stats.map((s) => <th key={s.group} className="pr-4 font-medium">{s.name}</th>)}</tr></thead>
          <tbody>
            {topics.map((name, t) => (
              <tr key={t} className="border-t">
                <td className="pr-4 py-1">{name}</td>
                {stats.map((s) => { const a = s.at[t]; return <td key={s.group} className="pr-4">{a ? `${r1(a.avg)} (${r1(a.lo)}–${r1(a.hi)}, ${a.n})` : '–'}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
