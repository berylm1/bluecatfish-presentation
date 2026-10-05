'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ActivityElement } from '@/lib/canvas/types';
import { contentRect } from '@/lib/canvas/laser';
import { PALETTE } from './Visuals';
import { activityReady } from '@/lib/canvas/queue';
import { playSound, type HandsOnSound } from '@/lib/canvas/sounds';

/*
 * A hands-on box (see ActivityElement): sort into groups, tap in order, flip
 * cards, explore spots on a picture, or move a slider. Until the learner
 * touches it, what can be touched glows and an example hand shows how (drags
 * the first item to its group, taps the next step, slides the slider); the
 * hand comes back if they stop for a while before finishing. onDone fires
 * once, when it's all done. Without `interactive` (thumbnails, the editor,
 * a morph) it's drawn as it starts, without the hint.
 */

const IDLE_HINT_MS = 9000;   // stopped this long before finishing: the hand shows again
const INK = '#0f172a';

export default function ActivityView({ el, interactive, onDone, hintNonce = 0, solved = false, quiet = false, sounds = false, onMistake, finnMove, onFinn, guide }: {
  el: ActivityElement; interactive: boolean; onDone?: () => void;
  /** A wrong move: what it was about ("Blue catfish → Native"), for the learner stats and for stepping in when it repeats */
  onMistake?: (m: ActivityMistake) => void;
  /** Finn takes a turn (a new nonce = a new move): a sort item in the wrong group, or a wrong guess on a card */
  finnMove?: FinnMove | null;
  /** What happened with Finn's move (to say something about it) */
  onFinn?: (e: FinnEvent) => void;
  /** The item the professor just explained: the hand shows that one */
  guide?: string;
  /** Pops, bonks and a chime (lib/canvas/sounds.ts) */
  sounds?: boolean;
  /** Done or skipped: no hand or glow (it can still be played with) */
  quiet?: boolean;
  /**
   * Already done this lesson: drawn finished (sorted, flipped, slid), no hand.
   * (The box is drawn again after the slide turns into a board or a helper and back.)
   */
  solved?: boolean;
  /** Changes when the learner seems stuck ("I'm lost", a puzzled face): the hand shows again */
  hintNonce?: number;
}) {
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(solved);
  const [justDone, setJustDone] = useState(false);   // the "✓ Nice!" badge: only when finished now, not when drawn finished
  const doneRef = useRef(solved);
  const alive = useRef(true);   // a delayed finish (the last card, the last spot) after the box is gone doesn't count
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // state, not a ref: the hand measures it in its own layout effect, which runs before a parent's ref is set
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const sound = useCallback((k: HandsOnSound) => { if (soundsRef.current) playSound(k); }, []);
  const onMistakeRef = useRef(onMistake);
  onMistakeRef.current = onMistake;
  const mistake = useCallback((m: ActivityMistake) => { onMistakeRef.current?.(m); }, []);
  const onFinnRef = useRef(onFinn);
  onFinnRef.current = onFinn;
  const finnEvent = useCallback((e: FinnEvent) => { onFinnRef.current?.(e); }, []);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (idle.current) clearTimeout(idle.current); };
  }, []);
  useEffect(() => { if (hintNonce) setTouched(false); }, [hintNonce]);
  const touch = useCallback(() => {
    setTouched(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setTouched(false), IDLE_HINT_MS);
  }, []);
  const finish = useCallback(() => {
    // was: the side effect inside a setDone updater, which React may run twice (dev): onDone twice
    if (doneRef.current || !alive.current) return;
    doneRef.current = true;
    if (idle.current) clearTimeout(idle.current);
    setDone(true);
    setJustDone(true);
    if (soundsRef.current) playSound('done');
    onDoneRef.current?.();
  }, []);

  const ready = activityReady(el);
  const hint = interactive && ready && !touched && !done && !quiet;
  const kit: Kit = { interactive: interactive && ready && !done, hint, touch, finish, solved, sound, mistake, finnMove: interactive ? finnMove : null, finnEvent, guide };
  // A half-made box: the editor shows what's missing; learners see nothing (it isn't waited on either)
  if (!ready && interactive) return null;
  return (
    <div data-activity={el.kind} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: '1cqh' }}>
      {el.prompt && (
        <div style={{ fontSize: '3.8cqh', fontWeight: 800, color: INK, textAlign: 'center', lineHeight: 1.15 }}>
          <span aria-hidden>🖐 </span>{el.prompt}
        </div>
      )}
      <div ref={setArea} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {!ready ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.4cqh dashed #94a3b8',
            borderRadius: '1.6cqh', color: '#64748b', fontSize: '2.8cqh', textAlign: 'center', padding: '2cqh' }}>
            🖐 Hands-on box: not finished yet (fill it in on the right)
          </div>
        ) : el.kind === 'sort' ? <Sort el={el} kit={kit} />
          : el.kind === 'order' ? <Order el={el} kit={kit} />
            : el.kind === 'cards' ? <Cards el={el} kit={kit} />
              : el.kind === 'hotspots' ? <Hotspots el={el} kit={kit} />
                : <Slider el={el} kit={kit} />}
        {hint && area && <HintHand area={area} mode={el.kind === 'sort' || el.kind === 'slider' ? 'drag' : 'tap'} />}
      </div>
      {justDone && (
        <div role="status" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 6, padding: '1.2cqh 2.6cqh', borderRadius: '99cqh', background: '#16a34a',
          color: '#fff', fontSize: '4cqh', fontWeight: 900, boxShadow: '0 1cqh 3cqh rgba(22,163,74,0.45)', animation: 'done-pop 600ms ease both, fade-in 400ms ease 2400ms reverse forwards',
          pointerEvents: 'none' }}>✓ Nice!</div>
      )}
    </div>
  );
}

type Kit = {
  interactive: boolean; hint: boolean; touch: () => void; finish: () => void; solved: boolean;
  sound: (k: HandsOnSound) => void; mistake: (m: ActivityMistake) => void;
  finnMove?: FinnMove | null; finnEvent: (e: FinnEvent) => void; guide?: string;
};

/** A wrong move: the item, where it went (or what was tapped instead), and where it belongs (or what comes next) */
export type ActivityMistake = { label: string; item: string; chosen: string; correct: string };
/** Finn's turn in a hands-on box. item/group: a sort item and the (wrong) group; guess: his guess on card `item`. */
export type FinnMove = { nonce: number; item: number; group?: number; guess?: string };
export type FinnEvent =
  | { type: 'applied'; item: string; group?: string; correct?: string; guess?: string }   // his move is on the board
  | { type: 'fixed'; item: string; group: string }                                       // the learner moved his item to the right group
  | { type: 'revealed'; item: string; guess: string }                                    // the learner flipped the card he guessed on
  | { type: 'stuck'; item: string };                                                     // everything placed but his mistake is still there

/* ---------------------------------------------------------------- hint */

/**
 * The example hand. It looks for [data-hint-from] (and [data-hint-to], for a
 * drag) inside the area and moves between their centres, measured again
 * whenever the layout changes.
 */
function HintHand({ area, mode }: { area: HTMLDivElement; mode: 'drag' | 'tap' }) {
  const [pts, setPts] = useState<{ fx: number; fy: number; tx: number; ty: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const a = area.getBoundingClientRect();
      const from = area.querySelector('[data-hint-from]')?.getBoundingClientRect();
      const to = area.querySelector('[data-hint-to]')?.getBoundingClientRect() ?? from;
      if (!from || !to) { setPts(null); return; }
      setPts({ fx: from.left + from.width / 2 - a.left, fy: from.top + from.height / 2 - a.top, tx: to.left + to.width / 2 - a.left, ty: to.top + to.height / 2 - a.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    const mo = new MutationObserver(measure);   // the next item / step changed
    mo.observe(area, { subtree: true, attributes: true, attributeFilter: ['data-hint-from', 'data-hint-to'], childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [area, mode]);
  if (!pts) return null;
  const vars = { '--fx': `${pts.fx}px`, '--fy': `${pts.fy}px`, '--tx': `${pts.tx}px`, '--ty': `${pts.ty}px` } as CSSProperties;
  return (
    <span data-hint-hand aria-hidden style={{
      ...vars, position: 'absolute', left: 0, top: 0, zIndex: 7, pointerEvents: 'none',
      transform: `translate(${pts.fx}px, ${pts.fy}px)`,
      animation: mode === 'drag' ? 'hint-drag 2.4s ease-in-out 600ms infinite both' : 'hint-tap 1.4s ease-in-out 400ms infinite',
    }}>
      {/* the fingertip sits on the point */}
      <span style={{ display: 'block', fontSize: '6cqh', lineHeight: 1, transform: 'translate(-35%, -8%)', filter: 'drop-shadow(0 0.4cqh 0.6cqh rgba(0,0,0,0.35))' }}>👆</span>
    </span>
  );
}

const glow = (on: boolean): CSSProperties => (on ? { animation: 'hint-pulse 1.4s ease-in-out infinite' } : {});

const chip = (color: string, extra: CSSProperties = {}): CSSProperties => ({
  fontSize: '3.6cqh', fontWeight: 700, color: INK, background: '#fff', border: `0.4cqh solid ${color}`, borderRadius: '1.2cqh',
  padding: '1.1cqh 1.8cqh', lineHeight: 1.15, textAlign: 'center', userSelect: 'none', touchAction: 'none', ...extra,
});

/* ---------------------------------------------------------------- sort */

function Sort({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const items = el.items ?? [];
  const groups = el.groups ?? [];
  const correct = (i: number) => items[i]?.group ?? 0;
  const [placed, setPlaced] = useState<Record<number, number>>(() => (kit.solved ? Object.fromEntries(items.map((it, i) => [i, it.group ?? 0])) : {}));
  // Finn's move: the item he dropped in the wrong group (the learner has to move it to the right one)
  const [finn, setFinn] = useState<{ item: number; group: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ item: number; bin: number } | null>(null);
  const [drag, setDrag] = useState<{ i: number; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null);
  const left = items.map((_, i) => i).filter((i) => placed[i] === undefined);
  // The hand shows the item the professor just explained, else the next one in the tray, else Finn's mistake
  const guided = kit.guide !== undefined ? items.findIndex((it, i) => it.text === kit.guide && placed[i] !== correct(i)) : -1;
  const hintItem = guided >= 0 ? guided : left.length ? left[0] : finn ? finn.item : undefined;

  // Finn's turn: he puts one item (still in the tray) in a wrong group
  const finnNonce = kit.finnMove?.nonce;
  useEffect(() => {
    const m = kit.finnMove;
    if (!m || kit.solved || groups.length < 2) return;
    const free = items.map((_, i) => i).filter((i) => placed[i] === undefined);
    if (!free.length) return;
    const item = free.includes(m.item) ? m.item : free[0];
    const group = m.group !== undefined && m.group !== correct(item) && m.group < groups.length ? m.group : (correct(item) + 1) % groups.length;
    setPlaced((p) => ({ ...p, [item]: group }));
    setFinn({ item, group });
    kit.finnEvent({ type: 'applied', item: items[item].text, group: groups[group], correct: groups[correct(item)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finnNonce]);

  const attempt = (i: number, bin: number) => {
    kit.touch();
    setSelected(null);
    if (correct(i) === bin) {
      const next = { ...placed, [i]: bin };
      setPlaced(next);
      const fixedFinn = finn?.item === i;
      if (fixedFinn) { setFinn(null); kit.finnEvent({ type: 'fixed', item: items[i].text, group: groups[bin] }); }
      // done = every item in its right group (Finn's mistake included)
      if (items.every((_, j) => next[j] === correct(j))) kit.finish();
      else kit.sound('good');
    } else if (placed[i] === bin) {
      // dropped back where it already was: nothing happens
    } else {
      kit.sound('bad');
      kit.mistake({ label: `${items[i].text} → ${groups[bin] ?? ''}`, item: items[i].text, chosen: groups[bin] ?? '', correct: groups[correct(i)] ?? '' });
      setWrong({ item: i, bin });
      setTimeout(() => setWrong((w) => (w?.item === i ? null : w)), 600);
    }
  };
  // Everything placed but Finn's mistake is still there: the learner gets a nudge (once)
  const stuckSaid = useRef(false);
  useEffect(() => {
    if (finn && !left.length && !stuckSaid.current) { stuckSaid.current = true; kit.finnEvent({ type: 'stuck', item: items[finn.item].text }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finn, left.length]);

  const down = (e: React.PointerEvent, i: number) => {
    if (!kit.interactive) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ i, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false });
    kit.touch();
  };
  const move = (e: React.PointerEvent) => {
    setDrag((d) => d && { ...d, dx: e.clientX - d.x0, dy: e.clientY - d.y0, moved: d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6 });
  };
  const up = (e: React.PointerEvent) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) { setSelected((s) => (s === d.i ? null : d.i)); return; }   // a tap: pick it, then tap a group
    // the group under the pointer (not the dragged chip itself: Finn's chip carries its group's mark)
    const bin = document.elementsFromPoint(e.clientX, e.clientY)
      .filter((n) => !(n as HTMLElement).closest?.('[data-dragging]'))
      .map((n) => (n as HTMLElement).dataset?.bin).find((b) => b !== undefined);
    if (bin !== undefined) attempt(d.i, Number(bin));
  };
  /** A chip the learner can move: one in the tray, or Finn's in a group */
  const movable = (i: number, color: string, extra: CSSProperties = {}) => {
    const dragging = drag?.i === i && drag.moved;
    return {
      'data-dragging': dragging ? '' : undefined,
      onPointerDown: (e: React.PointerEvent) => down(e, i),
      onPointerMove: drag?.i === i ? move : undefined,
      onPointerUp: drag?.i === i ? up : undefined,
      onPointerCancel: () => setDrag(null),
      style: chip(selected === i ? '#facc15' : color, {
        cursor: kit.interactive ? 'grab' : 'default', position: 'relative', zIndex: dragging ? 8 : 1,
        transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px) scale(1.06)` : undefined,
        boxShadow: dragging ? '0 1.2cqh 2.4cqh rgba(15,23,42,0.3)' : undefined,
        animation: wrong?.item === i ? 'shake 450ms ease' : kit.hint && i === hintItem ? 'hint-pulse 1.4s ease-in-out infinite' : undefined,
        ...extra,
      }),
    };
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: '1.5cqh' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1cqh', justifyContent: 'center', alignContent: 'center', minHeight: '26%' }}>
        {left.map((i) => (
          <button key={i} type="button" disabled={!kit.interactive} data-hint-from={i === hintItem ? '' : undefined} {...movable(i, '#64748b')}>
            {items[i].text}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', gap: '2%', minHeight: 0 }}>
        {groups.map((g, b) => (
          <div key={b} data-bin={b} role="button" tabIndex={kit.interactive ? 0 : -1}
            data-hint-to={hintItem !== undefined && correct(hintItem) === b ? '' : undefined}
            onClick={() => { if (kit.interactive && selected !== null) attempt(selected, b); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && kit.interactive && selected !== null) attempt(selected, b); }}
            style={{
              flex: 1, borderRadius: '1.6cqh', border: `0.45cqh dashed ${wrong?.bin === b ? '#e11d48' : PALETTE[b % PALETTE.length]}`,
              background: wrong?.bin === b ? 'rgba(225,29,72,0.08)' : `${PALETTE[b % PALETTE.length]}12`, padding: '1cqh', display: 'flex', flexDirection: 'column',
              gap: '0.8cqh', alignItems: 'center', cursor: kit.interactive && selected !== null ? 'pointer' : 'default', transition: 'background 200ms',
            }}>
            <div data-bin={b} style={{ fontSize: '3.8cqh', fontWeight: 900, color: PALETTE[b % PALETTE.length] }}>{g}</div>
            {items.map((it, i) => placed[i] !== b ? null : finn?.item === i ? (
              // Finn's pick: his badge, and the learner can drag it out to where it really goes
              <button key={i} type="button" disabled={!kit.interactive} data-bin={b} data-finn-pick=""
                data-hint-from={i === hintItem ? '' : undefined} title={`Finn put this here. Is he right?`}
                {...movable(i, '#f59e0b', { borderStyle: 'dashed', background: '#fffbeb', fontSize: '3.2cqh', animation: wrong?.item === i ? 'shake 450ms ease' : 'pop-in 450ms ease both' })}>
                🙋 {it.text}
              </button>
            ) : (
              <div key={i} data-bin={b} style={chip(PALETTE[b % PALETTE.length], { animation: 'pop-in 350ms ease both', fontSize: '3.2cqh' })}>✓ {it.text}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- order */

/** A fixed shuffle (the same each time for this box), never already in order. */
function shuffled(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.every((v, i) => v === i) && n > 1) out.push(out.shift()!);
  return out;
}

function Order({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const items = el.items ?? [];
  const order = useMemo(() => shuffled(items.length, el.id + items.map((i) => i.text).join('|')), [el.id, items]);
  const [next, setNext] = useState(kit.solved ? items.length : 0);
  const [wrong, setWrong] = useState<number | null>(null);
  const tap = (k: number) => {
    if (!kit.interactive || k < next) return;
    kit.touch();
    if (k === next) {
      setNext(next + 1);
      if (next + 1 === items.length) kit.finish();
      else kit.sound('good');
    } else {
      kit.sound('bad');
      kit.mistake({ label: `${items[k].text} (too early)`, item: items[k].text, chosen: items[k].text, correct: items[next].text });
      setWrong(k);
      setTimeout(() => setWrong((w) => (w === k ? null : w)), 500);
    }
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap', gap: '1.4cqh', justifyContent: 'center', alignContent: 'center' }}>
      {order.map((k) => {
        const doneStep = k < next;
        return (
          <button key={k} type="button" disabled={!kit.interactive} onClick={() => tap(k)} data-hint-from={k === next ? '' : undefined}
            style={chip(doneStep ? '#16a34a' : '#64748b', {
              position: 'relative', minWidth: '36%', maxWidth: '47%', padding: '1.8cqh 2cqh 1.8cqh 6.5cqh', textAlign: 'left',
              background: doneStep ? '#f0fdf4' : '#fff', cursor: kit.interactive && !doneStep ? 'pointer' : 'default',
              animation: wrong === k ? 'shake 450ms ease' : undefined, ...(kit.hint && !doneStep ? glow(true) : {}),
            })}>
            <span style={{ position: 'absolute', left: '1.6cqh', top: '50%', transform: 'translateY(-50%)', width: '4cqh', height: '4cqh', borderRadius: '50%',
              background: doneStep ? '#16a34a' : '#e2e8f0', color: doneStep ? '#fff' : '#94a3b8', fontSize: '2.6cqh', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{doneStep ? k + 1 : '?'}</span>
            {items[k].text}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- cards */

function Cards({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const items = el.items ?? [];
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set(kit.solved ? items.map((_, i) => i) : []));
  // Finn's guess, stuck on a card the learner hasn't flipped yet
  const [finn, setFinn] = useState<{ item: number; guess: string } | null>(null);
  const finnNonce = kit.finnMove?.nonce;
  useEffect(() => {
    const m = kit.finnMove;
    if (!m?.guess || kit.solved) return;
    const item = !flipped.has(m.item) && items[m.item] ? m.item : items.findIndex((_, i) => !flipped.has(i));
    if (item < 0) return;
    setFinn({ item, guess: m.guess });
    kit.finnEvent({ type: 'applied', item: items[item].text, guess: m.guess });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finnNonce]);
  const first = items.findIndex((_, i) => !flipped.has(i));
  const flip = (i: number) => {
    if (!kit.interactive || flipped.has(i)) return;
    kit.touch();
    const next = new Set(flipped).add(i);
    setFlipped(next);
    kit.sound('good');
    if (finn?.item === i) kit.finnEvent({ type: 'revealed', item: items[i].text, guess: finn.guess });
    if (next.size === items.length) setTimeout(kit.finish, 900);   // a moment to read the last one
  };
  const cols = items.length <= 3 ? items.length : items.length === 4 ? 2 : 3;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1.6cqh', perspective: '120cqh' }}>
      {items.map((it, i) => {
        const open = flipped.has(i);
        const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: '1.6cqh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '1.2cqh', textAlign: 'center', lineHeight: 1.2 };
        return (
          <button key={i} type="button" disabled={!kit.interactive} onClick={() => flip(i)} aria-label={open ? `${it.text}: ${it.back ?? ''}` : `${it.text} (tap to flip)`}
            data-hint-from={i === first ? '' : undefined}
            style={{ position: 'relative', border: 0, padding: 0, background: 'none', cursor: kit.interactive && !open ? 'pointer' : 'default', borderRadius: '1.6cqh',
              ...(kit.hint && !open ? glow(true) : {}) }}>
            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform 600ms cubic-bezier(0.4, 0.2, 0.2, 1)', transform: open ? 'rotateY(180deg)' : 'none' }}>
              <div style={{ ...face, background: PALETTE[i % PALETTE.length], color: '#fff', fontSize: '4cqh', fontWeight: 800, boxShadow: '0 0.8cqh 2cqh rgba(15,23,42,0.18)' }}>
                {it.text}<span aria-hidden style={{ position: 'absolute', right: '1.2cqh', bottom: '0.8cqh', fontSize: '2.2cqh', opacity: 0.8 }}>↻</span>
                {finn?.item === i && (
                  // Finn's sticky note: his (wrong) guess, before the learner checks
                  <span data-finn-pick="" style={{ position: 'absolute', left: '6%', right: '6%', top: '5%', padding: '0.6cqh 1cqh', background: '#fef08a', color: INK,
                    fontSize: '2.6cqh', fontWeight: 700, borderRadius: '0.6cqh', transform: 'rotate(-3deg)', boxShadow: '0 0.4cqh 1cqh rgba(0,0,0,0.25)',
                    animation: 'pop-in 450ms ease both' }}>🙋 Finn: “{finn.guess}”</span>
                )}
              </div>
              <div style={{ ...face, background: '#fff', color: INK, fontSize: '3.6cqh', fontWeight: 700, transform: 'rotateY(180deg)', border: `0.45cqh solid ${PALETTE[i % PALETTE.length]}` }}>
                <span>
                  {it.back ?? it.text}
                  {finn?.item === i && <span style={{ display: 'block', marginTop: '0.8cqh', fontSize: '2.4cqh', fontWeight: 600, color: '#b45309' }}>🙋 Finn guessed “{finn.guess}”</span>}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ hotspots */

function Hotspots({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const items = el.items ?? [];
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [opened, setOpened] = useState<Set<number>>(() => new Set(kit.solved ? items.map((_, i) => i) : []));
  const [active, setActive] = useState<number | null>(null);
  const first = items.findIndex((_, i) => !opened.has(i));
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const fit = () => { const b = img.getBoundingClientRect(); setRect(contentRect(b.width, b.height, img.naturalWidth, img.naturalHeight, 'contain')); };
    if (img.complete) fit(); else img.addEventListener('load', fit, { once: true });
    const ro = new ResizeObserver(fit);
    ro.observe(img);
    return () => ro.disconnect();
  }, [el.src]);
  const open = (i: number) => {
    if (!kit.interactive) return;
    kit.touch();
    setActive(i);
    if (!opened.has(i)) kit.sound('good');
    const next = new Set(opened).add(i);
    setOpened(next);
    if (next.size === items.length) setTimeout(kit.finish, 1500);
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={el.src} alt={el.alt ?? ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
      {items.map((it, i) => {
        const left = rect.x + ((it.x ?? 50) / 100) * rect.w, top = rect.y + ((it.y ?? 50) / 100) * rect.h;
        const seen = opened.has(i);
        return (
          <div key={i}>
            <button type="button" disabled={!kit.interactive} onClick={() => open(i)} aria-label={it.text} data-hint-from={i === first ? '' : undefined}
              style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: '4.4cqh', height: '4.4cqh', margin: '-2.2cqh 0 0 -2.2cqh', borderRadius: '50%',
                border: '0.5cqh solid #fff', background: seen ? '#16a34a' : '#f97316', color: '#fff', fontSize: '2.4cqh', fontWeight: 900, zIndex: 4,
                cursor: kit.interactive ? 'pointer' : 'default', boxShadow: '0 0.4cqh 1cqh rgba(0,0,0,0.3)',
                animation: !seen && kit.interactive ? 'hint-pulse 1.6s ease-in-out infinite' : undefined }}>{seen ? '✓' : i + 1}</button>
            {active === i && (
              <div role="status" style={{ position: 'absolute', left: `${Math.min(70, Math.max(2, left - 14))}%`, top: top > 55 ? undefined : `${top + 5}%`,
                // under the spots and see-through to taps: it never blocks the next spot
                bottom: top > 55 ? `${100 - top + 5}%` : undefined, width: '30%', zIndex: 3, pointerEvents: 'none', background: '#fff', borderRadius: '1.4cqh', padding: '1cqh 1.4cqh',
                boxShadow: '0 1cqh 3cqh rgba(15,23,42,0.25)', border: '0.35cqh solid #f97316', animation: 'pop-in 300ms ease both' }}>
                <div style={{ fontSize: '3.4cqh', fontWeight: 900, color: INK }}>{it.text}</div>
                {it.back && <div style={{ fontSize: '3cqh', color: '#334155', lineHeight: 1.25, marginTop: '0.4cqh' }}>{it.back}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- slider */

function Slider({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const s = el.slider!;
  const [value, setValue] = useState(kit.solved ? s.stops[s.stops.length - 1].at : s.min);
  const stops = s.stops;
  const stop = [...stops].reverse().find((st) => value >= st.at) ?? stops[0];
  // The picture's size follows the stops' scales, smoothly between them
  const scale = (() => {
    const i = stops.findIndex((st) => st.at > value);
    if (i <= 0) return (i === 0 ? stops[0] : stops[stops.length - 1]).scale ?? 1;
    const a = stops[i - 1], b = stops[i];
    const t = (value - a.at) / (b.at - a.at || 1);
    return (a.scale ?? 1) + t * ((b.scale ?? 1) - (a.scale ?? 1));
  })();
  const change = (v: number) => {
    if (!kit.interactive) return;
    kit.touch();
    const stopAt = (x: number) => [...stops].reverse().findIndex((st) => x >= st.at);
    if (stopAt(v) !== stopAt(value)) kit.sound('tick');   // reached another stop
    setValue(v);
    if (v >= stops[stops.length - 1].at) kit.finish();
  };
  const fmt = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}${s.unit ? ` ${s.unit}` : ''}`;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1cqh' }}>
      <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4%' }}>
        {el.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={el.src} alt={el.alt ?? ''} draggable={false}
            style={{ height: '80%', maxWidth: '45%', objectFit: 'contain', transform: `scale(${Math.min(1.25, scale)})`, transition: 'transform 150ms ease-out', pointerEvents: 'none' }} />
        )}
        <div key={stop.text} role="status" style={{ maxWidth: el.src ? '45%' : '90%', fontSize: '4cqh', fontWeight: 700, color: INK, lineHeight: 1.25, textAlign: el.src ? 'left' : 'center',
          background: '#fff', border: '0.4cqh solid #0891b2', borderRadius: '1.6cqh', padding: '1.2cqh 1.6cqh', animation: 'pop-in 300ms ease both' }}>
          {stop.text}
        </div>
      </div>
      <div style={{ fontSize: '3.8cqh', fontWeight: 900, color: '#0891b2' }}>{s.label ? `${s.label}: ` : ''}{fmt(value)}</div>
      <div style={{ position: 'relative', width: '86%', borderRadius: '99cqh', ...(kit.hint ? glow(true) : {}) }}>
        <input type="range" min={s.min} max={s.max} step={s.step ?? (s.max - s.min) / 100} value={value} disabled={!kit.interactive}
          aria-label={s.label || 'slider'} onChange={(e) => change(Number(e.target.value))}
          style={{ width: '100%', height: '4cqh', accentColor: '#0891b2', cursor: kit.interactive ? 'pointer' : 'default', margin: 0, touchAction: 'none' }} />
        {/* where the example hand slides from and to */}
        <span data-hint-from="" aria-hidden style={{ position: 'absolute', left: '1.5%', top: '50%', width: 1, height: 1 }} />
        <span data-hint-to="" aria-hidden style={{ position: 'absolute', left: '92%', top: '50%', width: 1, height: 1 }} />
      </div>
    </div>
  );
}
