'use client';

import type { DiagramElement } from '@/lib/canvas/types';
import { typeset } from '@/lib/mathText';

/*
 * More drawn visuals (DiagramElement kinds, lib/canvas/types.ts), for early math and everyday numbers:
 *   area   an array or area model: `from` rows by `to` columns, `parts` of them shaded (none given: all)
 *   clock  clock faces: each item's label is a time ("3:45"), detail = how it's said
 *   money  coins and notes: label = what's printed on it ("25¢", "$5"), value = how many of them
 *   shape  flat shapes and angles: label = its name ("triangle", "angle"), value = an angle's degrees
 *   table  a small table: each item is a row, its cells split by " | "; the first row is the header
 * Like the other visuals they draw themselves in, and sizes are in slide units (cqh).
 */

const PALETTE = ['#2563eb', '#f97316', '#16a34a', '#a855f7', '#e11d48', '#0891b2', '#ca8a04', '#475569'];
const INK = '#0f172a';
const SOFT = '#334155';
const pop = (i: number, base = 150) => `pop-in 500ms cubic-bezier(0.34, 1.4, 0.64, 1) ${base + i * 220}ms both`;
const math = (t: string | undefined) => typeset(t, true);
const wrap = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;

/* ---------------------------------------------------------------- area */

export function AreaModel({ el }: { el: DiagramElement }) {
  const rows = Math.max(1, Math.min(30, Math.round(el.from ?? 3)));
  const cols = Math.max(1, Math.min(30, Math.round(el.to ?? 4)));
  const shaded = el.parts === undefined ? rows * cols : Math.max(0, Math.min(rows * cols, el.parts));
  const caption = el.items[0]?.label;
  const color = el.items[0]?.color ?? PALETTE[0];
  // (each square the same size, as big as the box allows: the grid keeps its shape)
  return (
    <div style={{ ...wrap, flexDirection: 'column', gap: '2cqh' }} data-math="area">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.6cqh', flex: 1, minHeight: 0, width: '100%', justifyContent: 'center' }}>
        <div style={{ fontSize: '4.4cqh', fontWeight: 900, color: SOFT }}>{rows}</div>
        <div style={{ height: '100%', aspectRatio: `${cols} / ${rows}`, maxWidth: '82%', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`,
          border: `0.45cqh solid ${INK}`, borderRadius: '0.8cqh', overflow: 'hidden', background: '#fff' }}>
          {Array.from({ length: rows * cols }, (_, i) => (
            <span key={i} data-cell={i < shaded ? 'on' : 'off'} style={{ borderRight: (i + 1) % cols ? `0.2cqh solid ${INK}55` : 'none', borderBottom: i < (rows - 1) * cols ? `0.2cqh solid ${INK}55` : 'none',
              background: i < shaded ? color : 'transparent', opacity: i < shaded ? 0.85 : 1, animation: i < shaded ? `fade-in 300ms ease ${200 + Math.floor(i / cols) * 160}ms both` : undefined }} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: '4.4cqh', fontWeight: 900, color: SOFT, lineHeight: 1 }}>{cols} across</div>
      {caption && <div style={{ fontSize: '5cqh', fontWeight: 900, color: INK, lineHeight: 1.1, textAlign: 'center' }}>{math(caption)}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- clock */

function clockTime(label: string): { h: number; m: number } | null {
  const t = label.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!t) { const o = label.match(/^\s*(\d{1,2})\s*(?:o.?clock)?\s*$/i); return o ? { h: Number(o[1]) % 12, m: 0 } : null; }
  return { h: Number(t[1]) % 12, m: Math.min(59, Number(t[2])) };
}

export function Clocks({ el }: { el: DiagramElement }) {
  const faces = el.items.slice(0, 4);
  return (
    <div style={{ ...wrap, gap: '4%' }} data-math="clock">
      {faces.map((it, i) => {
        const t = clockTime(it.label) ?? { h: 0, m: 0 };
        const minute = t.m * 6, hour = t.h * 30 + t.m / 2;
        const color = it.color ?? PALETTE[i % PALETTE.length];
        return (
          <div key={i} style={{ flex: '1 1 0', maxWidth: '30%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.6cqh', animation: pop(i) }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', maxHeight: '70%', minHeight: 0 }} aria-hidden>
              <circle cx="50" cy="50" r="46" fill="#fff" stroke={INK} strokeWidth="3.5" />
              {Array.from({ length: 60 }, (_, k) => {
                const a = (k * 6 * Math.PI) / 180, big = k % 5 === 0;
                return <line key={k} x1={50 + Math.sin(a) * (big ? 38 : 42)} y1={50 - Math.cos(a) * (big ? 38 : 42)} x2={50 + Math.sin(a) * 44} y2={50 - Math.cos(a) * 44} stroke={INK} strokeWidth={big ? 1.8 : 0.6} />;
              })}
              {Array.from({ length: 12 }, (_, k) => {
                const n = k + 1, a = (n * 30 * Math.PI) / 180;
                return <text key={n} x={50 + Math.sin(a) * 31} y={50 - Math.cos(a) * 31} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="800" fill={INK}>{n}</text>;
              })}
              <line x1="50" y1="50" x2={50 + Math.sin((hour * Math.PI) / 180) * 22} y2={50 - Math.cos((hour * Math.PI) / 180) * 22} stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
              <line x1="50" y1="50" x2={50 + Math.sin((minute * Math.PI) / 180) * 34} y2={50 - Math.cos((minute * Math.PI) / 180) * 34} stroke={color} strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="50" r="3" fill={INK} />
            </svg>
            <div style={{ fontSize: '5cqh', fontWeight: 900, color, lineHeight: 1 }}>{it.label}</div>
            {it.detail && <div style={{ fontSize: '2.8cqh', color: SOFT, textAlign: 'center', lineHeight: 1.15 }}>{it.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- money */

const isNote = (label: string) => !/[¢cp]\s*$/i.test(label.trim()) && Number(label.replace(/[^\d.]/g, '')) >= 5;

export function Money({ el }: { el: DiagramElement }) {
  const kinds = el.items.slice(0, 6);
  return (
    <div style={{ ...wrap, flexDirection: 'column', gap: '3cqh', containerType: 'size' }} data-math="money">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center', gap: '5cqmin 5%', width: '100%' }}>
        {kinds.map((it, i) => {
          const n = Math.max(1, Math.min(12, Math.round(it.value ?? 1)));
          const note = isNote(it.label);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2cqmin', animation: pop(i) }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.6cqmin', maxWidth: note ? '110cqmin' : '86cqmin' }}>
                {Array.from({ length: n }, (_, k) => (
                  note
                    ? <span key={k} data-note style={{ width: '52cqmin', height: '25cqmin', borderRadius: '2cqmin', background: '#dcfce7', border: '0.8cqmin solid #15803d', color: '#14532d', fontSize: '11cqmin', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.label}</span>
                    : <span key={k} data-coin style={{ width: '26cqmin', height: '26cqmin', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fef9c3, #eab308)', border: '0.8cqmin solid #a16207', color: '#713f12', fontSize: '8.4cqmin', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.label}</span>
                ))}
              </div>
              {(it.detail || n > 1) && <div style={{ fontSize: '6cqmin', color: SOFT, fontWeight: 700 }}>{it.detail ?? `${n} × ${it.label}`}</div>}
            </div>
          );
        })}
      </div>
      {el.unit && <div style={{ fontSize: '12cqmin', fontWeight: 900, color: INK }}>{el.unit}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- shape */

const SIDES: Record<string, number> = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, decagon: 10 };

function shapePath(name: string): { d?: string; circle?: boolean; rect?: [number, number]; right?: boolean } {
  const n = name.toLowerCase();
  if (/circle/.test(n)) return { circle: true };
  if (/right/.test(n) && /triangle/.test(n)) return { d: 'M14 84 L86 84 L14 22 Z', right: true };
  if (/rectangle|oblong/.test(n)) return { rect: [84, 52] };
  if (/square/.test(n)) return { rect: [66, 66] };
  const sides = Object.entries(SIDES).find(([k]) => n.includes(k))?.[1];
  if (!sides) return {};
  const pts = Array.from({ length: sides }, (_, k) => {
    const a = ((k * 360) / sides - 90 + (sides % 2 ? 0 : 180 / sides)) * (Math.PI / 180);
    return `${(50 + Math.cos(a) * 40).toFixed(1)} ${(52 + Math.sin(a) * 40).toFixed(1)}`;
  });
  return { d: `M${pts.join(' L')} Z` };
}

export function Shapes({ el }: { el: DiagramElement }) {
  const list = el.items.slice(0, 4);
  return (
    <div style={{ ...wrap, gap: '4%' }} data-math="shape">
      {list.map((it, i) => {
        const color = it.color ?? PALETTE[i % PALETTE.length];
        const isAngle = /angle/i.test(it.label) && !/triangle|rectangle/i.test(it.label);
        const deg = Math.max(1, Math.min(180, it.value ?? 90));
        const s = shapePath(it.label);
        const a = (deg * Math.PI) / 180;
        const vx = deg > 90 ? 50 : 20, arm = deg > 180 ? 30 : deg > 90 ? 42 : 68;
        return (
          <div key={i} style={{ flex: '1 1 0', maxWidth: '32%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.4cqh', animation: pop(i) }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', maxHeight: '68%', minHeight: 0 }} aria-hidden>
              {isAngle ? (
                <>
                  {/* two arms from one corner, and the turn between them (a wide angle: its corner in the middle, so both arms fit) */}
                  <line x1={vx} y1="76" x2={vx + arm} y2="76" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
                  <line x1={vx} y1="76" x2={vx + Math.cos(a) * arm} y2={76 - Math.sin(a) * arm} stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
                  {Math.abs(deg - 90) < 0.5
                    ? <path d={`M${vx + 12} 76 L${vx + 12} 64 L${vx} 64`} fill="none" stroke={color} strokeWidth="2.5" />
                    : <path d={`M${vx + 18} 76 A18 18 0 ${deg > 180 ? 1 : 0} 0 ${(vx + Math.cos(a) * 18).toFixed(1)} ${(76 - Math.sin(a) * 18).toFixed(1)}`} fill="none" stroke={color} strokeWidth="3" />}
                  <text x={vx + Math.cos(a / 2) * 31} y={76 - Math.sin(a / 2) * 31} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="900" fill={color}>{Math.round(deg)}°</text>
                </>
              ) : s.circle ? <circle cx="50" cy="52" r="40" fill={`${color}33`} stroke={color} strokeWidth="3.5" />
                : s.rect ? <rect x={50 - s.rect[0] / 2} y={52 - s.rect[1] / 2} width={s.rect[0]} height={s.rect[1]} fill={`${color}33`} stroke={color} strokeWidth="3.5" strokeLinejoin="round" />
                : s.d ? <><path d={s.d} fill={`${color}33`} stroke={color} strokeWidth="3.5" strokeLinejoin="round" />{s.right && <path d="M14 74 L24 74 L24 84" fill="none" stroke={color} strokeWidth="2" />}</>
                : <text x="50" y="55" textAnchor="middle" fontSize="12" fill={SOFT}>?</text>}
            </svg>
            <div style={{ fontSize: '4cqh', fontWeight: 900, color: INK, lineHeight: 1.05, textAlign: 'center' }}>{it.label}</div>
            {it.detail && <div style={{ fontSize: '2.8cqh', color: SOFT, textAlign: 'center', lineHeight: 1.15 }}>{math(it.detail)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- table */

export function Table({ el }: { el: DiagramElement }) {
  const rows = el.items.slice(0, 8).map((it) => it.label.split('|').map((c) => c.trim()).slice(0, 6));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const size = Math.max(2.6, Math.min(5, 34 / rows.length));
  return (
    <div style={wrap} data-math="table">
      <table style={{ width: '100%', maxHeight: '100%', borderCollapse: 'separate', borderSpacing: 0, border: `0.4cqh solid ${INK}`, borderRadius: '1.4cqh', overflow: 'hidden', background: '#fff', tableLayout: 'fixed' }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ animation: `fade-in 400ms ease ${150 + i * 200}ms both` }}>
              {Array.from({ length: cols }, (_, c) => {
                const Cell = i === 0 ? 'th' : 'td';
                return (
                  <Cell key={c} style={{ padding: `${size * 0.28}cqh 1.2cqh`, fontSize: `${size}cqh`, fontWeight: i === 0 ? 900 : 600, color: i === 0 ? '#fff' : INK, background: i === 0 ? PALETTE[0] : i % 2 ? '#fff' : '#f1f5f9',
                    borderTop: i ? `0.2cqh solid ${INK}33` : 'none', borderLeft: c ? `0.2cqh solid ${INK}33` : 'none', textAlign: 'center', lineHeight: 1.15 }}>{math(r[c] ?? '')}</Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
