'use client';

import type { ChartElement, DiagramElement } from '@/lib/canvas/types';

/*
 * The drawn visuals: charts (bars, a line, a pie) and diagrams (steps, a
 * cycle, a timeline, a two-column comparison, sizes side by side). They draw
 * themselves in, one part after another, like a teacher at the board. Sizes
 * are in slide units (cqh), so they look the same at any size.
 */

export const PALETTE = ['#2563eb', '#f97316', '#16a34a', '#a855f7', '#e11d48', '#0891b2', '#ca8a04', '#475569'];
const INK = '#0f172a';
const SOFT = '#334155';
const pop = (i: number, base = 150) => `pop-in 500ms cubic-bezier(0.34, 1.4, 0.64, 1) ${base + i * 220}ms both`;
const fmt = (v: number, unit?: string) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;

/* -------------------------------------------------------------- charts */

export function ChartView({ el }: { el: ChartElement }) {
  const label = el.alt ?? el.bars.map((b) => `${b.label}: ${fmt(b.value, el.unit)}`).join(', ');
  return (
    <div role="img" aria-label={label} data-visual="chart" style={{ position: 'absolute', inset: 0 }}>
      {el.kind === 'line' ? <LineChart el={el} /> : el.kind === 'pie' ? <PieChart el={el} /> : <BarChart el={el} />}
    </div>
  );
}

function BarChart({ el }: { el: ChartElement }) {
  const max = Math.max(...el.bars.map((b) => b.value), 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '3%', padding: '1cqh 2% 0' }}>
      {el.bars.map((b, i) => (
        <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
          <div style={{ fontSize: '3.4cqh', fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{fmt(b.value, el.unit)}</div>
          <div style={{
            width: '78%', height: `${Math.max(2, (b.value / max) * 62)}%`, background: b.color ?? PALETTE[i % PALETTE.length],
            borderRadius: '0.8cqh 0.8cqh 0 0', transformOrigin: 'bottom',
            animation: `bar-grow 700ms cubic-bezier(0.34, 1.3, 0.64, 1) ${200 + i * 220}ms both`,
          }} />
          <div style={{ fontSize: '2.8cqh', fontWeight: 600, color: SOFT, textAlign: 'center', lineHeight: 1.15, marginTop: '0.6cqh', overflowWrap: 'anywhere' }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A change over time: the line draws itself left to right, values on the points, "when" underneath. */
function LineChart({ el }: { el: ChartElement }) {
  const vals = el.bars.map((b) => b.value);
  const max = Math.max(...vals, 1), min = Math.min(0, ...vals);
  const n = el.bars.length;
  // Plot area inside the box (in %): room for values above and labels below
  const L = 6, R = 94, T = 16, B = 78;
  const px = (i: number) => (n === 1 ? 50 : L + (i / (n - 1)) * (R - L));
  const py = (v: number) => B - ((v - min) / (max - min || 1)) * (B - T);
  const d = el.bars.map((b, i) => `${i ? 'L' : 'M'}${px(i)},${py(b.value)}`).join(' ');
  const color = el.bars[0]?.color ?? PALETTE[0];
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden>
        <line x1={L} y1={B} x2={R} y2={B} stroke="#cbd5e1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {/* drawn left to right by uncovering it (dashes don't work with a stretched, non-scaling line) */}
        <g style={{ animation: 'reveal-x 1200ms ease-out 200ms both' }}>
          <path d={`${d} L${px(n - 1)},${B} L${px(0)},${B} Z`} fill={color} fillOpacity={0.12} />
          <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {el.bars.map((b, i) => (
        <div key={i}>
          <span style={{ position: 'absolute', left: `${px(i)}%`, top: `${py(b.value)}%`, width: '2.2cqh', height: '2.2cqh', margin: '-1.1cqh 0 0 -1.1cqh',
            borderRadius: '50%', background: '#fff', border: `0.5cqh solid ${b.color ?? color}`, animation: pop(i, 200 + (1000 * i) / Math.max(1, n - 1) * 0.8) }} />
          <span style={{ position: 'absolute', left: `${px(i)}%`, top: `${py(b.value)}%`, transform: 'translate(-50%, -150%)', fontSize: '3cqh', fontWeight: 800, color: INK, whiteSpace: 'nowrap',
            animation: pop(i, 300 + (1000 * i) / Math.max(1, n - 1) * 0.8) }}>{fmt(b.value, el.unit)}</span>
          <span style={{ position: 'absolute', left: `${px(i)}%`, top: `${B + 3}%`, transform: 'translateX(-50%)', fontSize: '2.7cqh', fontWeight: 600, color: SOFT, whiteSpace: 'nowrap' }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Parts of a whole: a pie that turns in, with a legend of shares. */
function PieChart({ el }: { el: ChartElement }) {
  const total = el.bars.reduce((s, b) => s + b.value, 0) || 1;
  let at = 0;
  const stops = el.bars.map((b, i) => {
    const from = at;
    at += (b.value / total) * 360;
    return `${b.color ?? PALETTE[i % PALETTE.length]} ${from}deg ${at}deg`;
  });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '5%', padding: '0 3%' }}>
      <div style={{ height: '86%', aspectRatio: '1', borderRadius: '50%', background: `conic-gradient(${stops.join(', ')})`, flexShrink: 0,
        boxShadow: '0 0.6cqh 2cqh rgba(15,23,42,0.15)', animation: 'pie-in 900ms cubic-bezier(0.34, 1.2, 0.64, 1) 150ms both' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4cqh', minWidth: 0 }}>
        {el.bars.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1cqh', animation: pop(i, 500) }}>
            <span style={{ width: '3cqh', height: '3cqh', borderRadius: '0.5cqh', background: b.color ?? PALETTE[i % PALETTE.length], flexShrink: 0 }} />
            <span style={{ fontSize: '3.8cqh', color: INK, lineHeight: 1.15 }}>
              <b>{Math.round((b.value / total) * 100)}%</b> {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ diagrams */

export function DiagramView({ el }: { el: DiagramElement }) {
  const label = el.alt ?? el.items.map((it) => [it.label, it.detail].filter(Boolean).join(': ')).join(el.kind === 'steps' ? ' → ' : ', ');
  return (
    <div role="img" aria-label={label} data-visual="diagram" style={{ position: 'absolute', inset: 0 }}>
      {el.kind === 'cycle' ? <Cycle el={el} />
        : el.kind === 'timeline' ? <Timeline el={el} />
          : el.kind === 'compare' ? <Compare el={el} />
            : el.kind === 'sizes' ? <Sizes el={el} />
              : <Steps el={el} />}
    </div>
  );
}

const card = (i: number, color?: string): React.CSSProperties => ({
  background: '#fff', border: `0.45cqh solid ${color ?? PALETTE[i % PALETTE.length]}`, borderRadius: '1.4cqh',
  padding: '1cqh 1.2cqh', boxShadow: '0 0.5cqh 1.5cqh rgba(15,23,42,0.10)', textAlign: 'center', minWidth: 0,
});

/** Boxes joined by arrows, one after another. */
function Steps({ el }: { el: DiagramElement }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '1%', padding: '0 1%' }}>
      {el.items.map((it, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {i > 0 && <span aria-hidden style={{ fontSize: '6cqh', color: '#94a3b8', fontWeight: 900, animation: pop(i, 50) }}>→</span>}
          <div style={{ ...card(i, it.color), flex: 1, maxHeight: '100%', minHeight: '45%', display: 'flex', flexDirection: 'column', justifyContent: 'center', animation: pop(i) }}>
            <div style={{ fontSize: '4cqh', fontWeight: 800, color: INK, lineHeight: 1.15 }}>{it.label}</div>
            {it.detail && <div style={{ fontSize: '3cqh', color: SOFT, marginTop: '0.6cqh', lineHeight: 1.2 }}>{it.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Items round a circle, with arrows going round. */
function Cycle({ el }: { el: DiagramElement }) {
  const n = el.items.length;
  const at = (k: number) => {
    const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
    return { x: 50 + 36 * Math.cos(a), y: 50 + 36 * Math.sin(a), a };
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <ellipse cx={50} cy={50} rx={36} ry={36} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeDasharray="6 6" vectorEffect="non-scaling-stroke"
          style={{ animation: 'fade-in 600ms ease both' }} />
      </svg>
      {el.items.map((_, k) => {
        // an arrow halfway to the next item, pointing round the circle
        const a = -Math.PI / 2 + ((k + 0.5) / n) * Math.PI * 2;
        return (
          <span key={`arrow-${k}`} aria-hidden style={{ position: 'absolute', left: `${50 + 36 * Math.cos(a)}%`, top: `${50 + 36 * Math.sin(a)}%`,
            transform: `translate(-50%, -50%) rotate(${a + Math.PI / 2}rad)`, fontSize: '4cqh', color: '#64748b', fontWeight: 900, lineHeight: 1,
            animation: `fade-in 400ms ease ${300 + k * 220}ms both` }}>➜</span>
        );
      })}
      {el.items.map((it, k) => {
        const p = at(k);
        return (
          <div key={k} style={{ ...card(k, it.color), position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)',
            maxWidth: `${Math.max(18, 70 / n)}%`, animation: pop(k) }}>
            <div style={{ fontSize: '3.6cqh', fontWeight: 800, color: INK, lineHeight: 1.15 }}>{it.label}</div>
            {it.detail && <div style={{ fontSize: '2.7cqh', color: SOFT, marginTop: '0.3cqh', lineHeight: 1.2 }}>{it.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** A line with dated events, labels taking turns above and below. */
function Timeline({ el }: { el: DiagramElement }) {
  const n = el.items.length;
  const x = (i: number) => (n === 1 ? 50 : 8 + (i / (n - 1)) * 84);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div aria-hidden style={{ position: 'absolute', left: '4%', right: '4%', top: '50%', height: '0.7cqh', marginTop: '-0.35cqh', background: '#94a3b8', borderRadius: '1cqh',
        transformOrigin: 'left', animation: 'bar-grow-x 900ms ease-out both' }} />
      {el.items.map((it, i) => {
        const up = i % 2 === 0;
        return (
          <div key={i}>
            <span aria-hidden style={{ position: 'absolute', left: `${x(i)}%`, top: '50%', width: '2.6cqh', height: '2.6cqh', margin: '-1.3cqh 0 0 -1.3cqh', borderRadius: '50%',
              background: it.color ?? PALETTE[i % PALETTE.length], border: '0.5cqh solid #fff', boxShadow: '0 0 0 0.3cqh #94a3b8', animation: pop(i, 400) }} />
            <div style={{ position: 'absolute', left: `${x(i)}%`, [up ? 'bottom' : 'top']: '57%', transform: 'translateX(-50%)', width: `${Math.min(30, 90 / n)}%`,
              textAlign: 'center', animation: pop(i, 500) }}>
              <div style={{ fontSize: '4.4cqh', fontWeight: 900, color: it.color ?? PALETTE[i % PALETTE.length], lineHeight: 1.1 }}>{it.label}</div>
              {it.detail && <div style={{ fontSize: '3cqh', color: SOFT, lineHeight: 1.2, marginTop: '0.4cqh' }}>{it.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A two-column table: what's on each side, row by row. */
function Compare({ el }: { el: DiagramElement }) {
  const [a, b] = el.columns ?? ['', ''];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'center', gap: '1.2cqh 1.5%', padding: '0 1%' }}>
      {(a || b) && [a, b].map((h, i) => (
        <div key={`h${i}`} style={{ fontSize: '4cqh', fontWeight: 900, color: '#fff', background: PALETTE[i], borderRadius: '1cqh', padding: '1.2cqh 1.4cqh', textAlign: 'center', animation: pop(i, 100) }}>{h}</div>
      ))}
      {el.items.map((it, i) => [it.label, it.detail ?? ''].map((t, j) => (
        <div key={`${i}-${j}`} style={{ fontSize: '3.6cqh', color: INK, background: j ? '#f1f5f9' : '#eff6ff', borderRadius: '1cqh', padding: '1.4cqh 1.6cqh',
          lineHeight: 1.2, fontWeight: j ? 500 : 700, animation: pop(i + j * 0.5, 350) }}>{t}</div>
      )))}
    </div>
  );
}

/** Circles sized by value (area), side by side on one line, so sizes compare at a glance. */
function Sizes({ el }: { el: DiagramElement }) {
  const max = Math.max(...el.items.map((it) => it.value ?? 1), 1);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '0 2% 1cqh' }}>
      {el.items.map((it, i) => {
        const share = Math.sqrt((it.value ?? 1) / max);   // by area, as eyes compare circles
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0, flex: 1 }}>
            <div style={{ height: `${Math.max(8, share * 66)}%`, aspectRatio: '1', borderRadius: '50%', background: it.color ?? PALETTE[i % PALETTE.length],
              opacity: 0.9, transformOrigin: 'bottom', animation: pop(i, 200) }} />
            <div style={{ fontSize: '3cqh', fontWeight: 800, color: INK, marginTop: '0.6cqh', textAlign: 'center', lineHeight: 1.1 }}>{it.label}</div>
            {(it.value !== undefined || it.detail) && (
              <div style={{ fontSize: '2.5cqh', color: SOFT, textAlign: 'center', lineHeight: 1.15 }}>{it.detail ?? fmt(it.value!, el.unit)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
