'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { DiagramElement } from '@/lib/canvas/types';
import { parseFraction, typeset } from '@/lib/mathText';

/*
 * The drawn visuals for math (DiagramElement kinds, lib/canvas/types.ts): a number line, fraction bars, a graph, and
 * a worked example that's shown one line at a time. Like the other visuals (Visuals.tsx) they draw themselves in,
 * and sizes are in slide units (cqh). What's written on them is typeset as math whatever the lesson (a "3/4" here is
 * always a fraction).
 */

const PALETTE = ['#2563eb', '#f97316', '#16a34a', '#a855f7', '#e11d48', '#0891b2', '#ca8a04', '#475569'];
const INK = '#0f172a';
const SOFT = '#334155';
const LINE = '#64748b';
const pop = (i: number, base = 150) => `pop-in 500ms cubic-bezier(0.34, 1.4, 0.64, 1) ${base + i * 220}ms both`;
const math = (t: string | undefined) => typeset(t, true);
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * The clip being said (the lesson's player): a worked example shows its lines as the professor gets to them.
 * Not given (the editor, a thumbnail, a board): everything is shown.
 */
export const ClipAudio = createContext<(() => HTMLAudioElement | null) | null>(null);

/** Steps along an axis that read well: 1, 2, 5 × a power of ten, about `about` of them */
function niceStep(span: number, about: number): number {
  const raw = span / Math.max(1, about);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/* --------------------------------------------------------- number line */

export function NumberLine({ el }: { el: DiagramElement }) {
  const vals = el.items.map((it) => it.value ?? 0);
  let from = el.from ?? Math.floor(Math.min(0, ...vals));
  let to = el.to ?? Math.ceil(Math.max(1, ...vals));
  if (to <= from) to = from + 1;
  from = Math.min(from, ...vals); to = Math.max(to, ...vals);
  const span = to - from;
  // whole-number marks (or wider apart on a long line), and the equal parts between them
  const major = span <= 12 ? 1 : niceStep(span, 8);
  const parts = major === 1 && span <= 4 ? Math.max(1, el.parts ?? 1) : 1;
  const x = (v: number) => 6 + ((v - from) / span) * 88;
  const majors: number[] = [];
  for (let v = Math.ceil(from / major) * major; v <= to + 1e-9; v += major) majors.push(round(v));
  const minors: number[] = [];
  if (parts > 1) for (let v = Math.ceil(from * parts) / parts; v <= to + 1e-9; v += 1 / parts) if (!Number.isInteger(round(v))) minors.push(round(v));
  // points close together take turns higher up, so what's written by them doesn't collide
  const order = el.items.map((it, i) => ({ it, i, px: x(it.value ?? 0) })).sort((a, b) => a.px - b.px);
  const level = new Map<number, number>();
  order.forEach((p, k) => level.set(p.i, k > 0 && p.px - order[k - 1].px < 12 ? ((level.get(order[k - 1].i) ?? 0) + 1) % 2 : 0));
  const Y = 62;   // the line, % from the top
  return (
    <div style={{ position: 'absolute', inset: 0 }} data-math="numberline">
      <div aria-hidden style={{ position: 'absolute', left: '3%', right: '3%', top: `${Y}%`, height: '0.7cqh', marginTop: '-0.35cqh', background: LINE, borderRadius: '1cqh',
        transformOrigin: 'left', animation: 'bar-grow-x 800ms ease-out both' }} />
      {minors.map((v) => (
        <span key={`m${v}`} aria-hidden style={{ position: 'absolute', left: `${x(v)}%`, top: `${Y}%`, width: '0.35cqh', height: '2.6cqh', margin: '-1.3cqh 0 0 -0.17cqh', background: '#94a3b8',
          animation: 'fade-in 400ms ease 500ms both' }} />
      ))}
      {majors.map((v) => (
        <div key={`M${v}`}>
          <span aria-hidden style={{ position: 'absolute', left: `${x(v)}%`, top: `${Y}%`, width: '0.55cqh', height: '4.6cqh', margin: '-2.3cqh 0 0 -0.27cqh', background: LINE, borderRadius: '1cqh',
            animation: 'fade-in 400ms ease 400ms both' }} />
          <span style={{ position: 'absolute', left: `${x(v)}%`, top: `${Y + 6}%`, transform: 'translateX(-50%)', fontSize: '3.6cqh', fontWeight: 700, color: SOFT, animation: 'fade-in 400ms ease 500ms both' }}>
            {String(v).replace('-', '−')}
          </span>
        </div>
      ))}
      {el.items.map((it, i) => {
        const color = it.color ?? PALETTE[i % PALETTE.length];
        const up = level.get(i) ?? 0;
        return (
          <div key={i} data-point={it.value}>
            <span aria-hidden style={{ position: 'absolute', left: `${x(it.value ?? 0)}%`, top: `${Y}%`, width: '3.2cqh', height: '3.2cqh', margin: '-1.6cqh 0 0 -1.6cqh', borderRadius: '50%',
              background: color, border: '0.5cqh solid #fff', boxShadow: `0 0 0 0.3cqh ${color}`, animation: pop(i, 700) }} />
            <div style={{ position: 'absolute', left: `${x(it.value ?? 0)}%`, bottom: `${100 - Y + 6 + up * 17}%`, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap', animation: pop(i, 800) }}>
              <div style={{ fontSize: '5cqh', fontWeight: 900, color, lineHeight: 1.1 }}>{math(it.label)}</div>
              {it.detail && <div style={{ fontSize: '2.7cqh', color: SOFT, lineHeight: 1.15 }}>{math(it.detail)}</div>}
            </div>
            {up > 0 && <span aria-hidden style={{ position: 'absolute', left: `${x(it.value ?? 0)}%`, top: `${Y - 6 - up * 17}%`, height: `${up * 17}%`, width: '0.3cqh', marginLeft: '-0.15cqh', background: color, opacity: 0.5 }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- fraction bars */

export function FractionBars({ el }: { el: DiagramElement }) {
  const rows = el.items.slice(0, 5).map((it) => {
    const f = parseFraction(it.label);
    // "3/4": 3 of 4 shaded; "1 1/2": a whole bar and a half; no fraction in the label: the value out of `parts`
    const bottom = f?.bottom ?? Math.max(1, el.parts ?? 1);
    const top = f ? f.whole * f.bottom + f.top : Math.max(0, Math.round(it.value ?? 0));
    return { it, top, bottom: Math.min(24, bottom), wholes: Math.min(3, Math.max(1, Math.ceil(top / Math.max(1, bottom)))) };
  });
  const most = Math.max(...rows.map((r) => r.wholes));
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.2cqh', padding: '0 1%' }} data-math="fraction">
      {rows.map((r, i) => {
        const color = r.it.color ?? PALETTE[i % PALETTE.length];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '2%', minHeight: 0, flex: `0 1 ${Math.min(22, 70 / rows.length)}cqh`, animation: pop(i, 100) }}>
            <div style={{ width: '13%', textAlign: 'right', fontSize: '5.4cqh', fontWeight: 900, color, flexShrink: 0, lineHeight: 1 }}>{math(r.it.label)}</div>
            <div style={{ flex: 1, display: 'flex', gap: '2.5%', height: '100%', minHeight: '6cqh' }}>
              {Array.from({ length: most }, (_, w) => (
                <div key={w} style={{ flex: 1, display: 'flex', border: w < r.wholes ? `0.45cqh solid ${INK}` : 'none', borderRadius: '1cqh', overflow: 'hidden', background: w < r.wholes ? '#fff' : 'transparent' }}>
                  {w < r.wholes && Array.from({ length: r.bottom }, (_, c) => {
                    const filled = w * r.bottom + c < r.top;
                    return (
                      <span key={c} data-part={filled ? 'on' : 'off'} style={{ flex: 1, borderLeft: c ? `0.3cqh solid ${INK}` : 'none', background: filled ? color : 'transparent', opacity: filled ? 0.88 : 1,
                        animation: filled ? `fade-in 350ms ease ${500 + i * 300 + (w * r.bottom + c) * 120}ms both` : undefined }} />
                    );
                  })}
                </div>
              ))}
            </div>
            {rows.some((x) => x.it.detail) && (
              <div style={{ width: '22%', fontSize: '3cqh', color: SOFT, lineHeight: 1.2, flexShrink: 0 }}>{math(r.it.detail)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- graph */

export function Graph({ el }: { el: DiagramElement }) {
  const pts = el.items.filter((it) => it.x !== undefined && it.value !== undefined).map((it) => ({ ...it, x: it.x!, y: it.value! }));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  // the axes always show zero, and end on round numbers
  const range = (vals: number[]) => {
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const step = niceStep(hi - lo || 1, 6);
    return { lo: Math.floor(lo / step) * step, hi: Math.max(Math.ceil(hi / step) * step, Math.floor(lo / step) * step + step), step };
  };
  const X = range(xs), Y = range(ys);
  const L = 12, R = 96, T = 8, B = 84;   // the plot, % of the box
  const px = (v: number) => L + ((v - X.lo) / (X.hi - X.lo)) * (R - L);
  const py = (v: number) => B - ((v - Y.lo) / (Y.hi - Y.lo)) * (B - T);
  const ticks = (r: { lo: number; hi: number; step: number }) => { const out: number[] = []; for (let v = r.lo; v <= r.hi + 1e-9; v += r.step) out.push(round(v)); return out; };
  const line = [...pts].sort((a, b) => a.x - b.x);
  const [xName, yName] = el.columns ?? ['', ''];
  return (
    <div style={{ position: 'absolute', inset: 0 }} data-math="graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden>
        {ticks(X).map((v) => <line key={`x${v}`} x1={px(v)} y1={T} x2={px(v)} y2={B} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {ticks(Y).map((v) => <line key={`y${v}`} x1={L} y1={py(v)} x2={R} y2={py(v)} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <line x1={L} y1={py(0)} x2={R} y2={py(0)} stroke={LINE} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        <line x1={px(0)} y1={T} x2={px(0)} y2={B} stroke={LINE} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {el.connect && line.length > 1 && (
          <g style={{ animation: 'reveal-x 1100ms ease-out 300ms both' }}>
            <path d={line.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke={PALETTE[0]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {ticks(X).map((v) => <span key={`tx${v}`} style={{ position: 'absolute', left: `${px(v)}%`, top: `${B + 1.5}%`, transform: 'translateX(-50%)', fontSize: '2.6cqh', fontWeight: 600, color: SOFT }}>{String(v).replace('-', '−')}</span>)}
      {ticks(Y).filter((v) => v !== 0 || X.lo === 0).map((v) => <span key={`ty${v}`} style={{ position: 'absolute', right: `${100 - L + 1.2}%`, top: `${py(v)}%`, transform: 'translateY(-50%)', fontSize: '2.6cqh', fontWeight: 600, color: SOFT }}>{String(v).replace('-', '−')}</span>)}
      {xName && <span style={{ position: 'absolute', left: `${(L + R) / 2}%`, bottom: 0, transform: 'translateX(-50%)', fontSize: '2.9cqh', fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{xName}</span>}
      {yName && <span style={{ position: 'absolute', left: 0, top: `${(T + B) / 2}%`, transform: 'translate(-40%, -50%) rotate(-90deg)', fontSize: '2.9cqh', fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{yName}</span>}
      {pts.map((p, i) => {
        const color = p.color ?? (el.connect ? PALETTE[0] : PALETTE[i % PALETTE.length]);
        const named = p.label && p.label !== `(${p.x}, ${p.y})`;
        return (
          <div key={i} data-point={`${p.x},${p.y}`}>
            <span aria-hidden style={{ position: 'absolute', left: `${px(p.x)}%`, top: `${py(p.y)}%`, width: '2.8cqh', height: '2.8cqh', margin: '-1.4cqh 0 0 -1.4cqh', borderRadius: '50%',
              background: color, border: '0.45cqh solid #fff', boxShadow: `0 0 0 0.25cqh ${color}`, animation: pop(i, 400) }} />
            {(named || pts.length <= 6) && (
              <span style={{ position: 'absolute', left: `${px(p.x)}%`, top: `${py(p.y)}%`, transform: `translate(${px(p.x) > 82 ? '-110%' : '14%'}, -130%)`, fontSize: '2.8cqh', fontWeight: 800, color: INK, whiteSpace: 'nowrap',
                background: 'rgba(255,255,255,0.8)', borderRadius: '0.6cqh', padding: '0 0.6cqh', animation: pop(i, 500) }}>{math(p.label)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------ worked example */

/**
 * One line of working after another. In the lesson, while it's being said: the lines come as the professor goes
 * through them (each gets an equal share of the clip); before its turn only the first line (the problem) is up, and
 * after it, all of them. Anywhere else (the editor, a thumbnail, a box that isn't spoken): all of them at once.
 */
export function Worked({ el, active }: { el: DiagramElement; active: boolean }) {
  const n = el.items.length;
  const getAudio = useContext(ClipAudio);
  const timed = !!getAudio && !el.silent && n > 1;
  const [shown, setShown] = useState(timed ? 1 : n);
  const said = useRef(false);
  useEffect(() => {
    if (!timed) { setShown(n); return; }
    if (!active) { if (said.current) setShown(n); return; }
    said.current = true;
    const began = Date.now();
    const t = setInterval(() => {
      const a = getAudio?.();
      // (no clip, the voice failed and the words are shown instead: a line every few seconds)
      const part = a && a.duration && Number.isFinite(a.duration) ? a.currentTime / a.duration : Math.min(1, (Date.now() - began) / (n * 3000));
      setShown((s) => Math.max(s, Math.min(n, 1 + Math.floor(part * n))));
    }, 150);
    return () => clearInterval(t);
  }, [timed, active, n, getAudio]);
  const size = n <= 3 ? 5.6 : n === 4 ? 4.8 : 4.2;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.6cqh', padding: '0 1%' }} data-math="worked" data-shown={shown}>
      {el.items.map((it, i) => {
        const last = i === n - 1;
        const visible = i < shown;
        return (
          <div key={i} data-step={i + 1} aria-hidden={!visible || undefined}
            style={{ display: 'flex', alignItems: 'center', gap: '2%', opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(1.2cqh)',
              transition: 'opacity 450ms ease, transform 450ms ease', animation: timed ? undefined : pop(i),
              background: last ? '#f0fdf4' : '#fff', border: `0.45cqh solid ${last ? '#16a34a' : '#cbd5e1'}`, borderRadius: '1.4cqh', padding: '1.1cqh 1.8cqh', boxShadow: '0 0.4cqh 1.2cqh rgba(15,23,42,0.08)' }}>
            <span aria-hidden style={{ width: '5cqh', height: '5cqh', borderRadius: '50%', background: last ? '#16a34a' : PALETTE[0], color: '#fff', fontSize: '2.8cqh', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{last ? '✓' : i + 1}</span>
            <span style={{ fontSize: `${size}cqh`, fontWeight: 800, color: INK, lineHeight: 1.25, flex: '1 1 auto', minWidth: 0 }}>{math(it.label)}</span>
            {it.detail && <span style={{ fontSize: `${Math.max(2.6, size * 0.56)}cqh`, color: SOFT, lineHeight: 1.2, flex: '0 1 34%', textAlign: 'right' }}>{math(it.detail)}</span>}
          </div>
        );
      })}
    </div>
  );
}
