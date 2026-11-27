'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ActivityElement } from '@/lib/canvas/types';
import { contentRect } from '@/lib/canvas/laser';
import { PALETTE } from './Visuals';
import { activityReady } from '@/lib/canvas/queue';
import { answerMatches, parseNumber } from '@/lib/canvas/answerMatch';
import { learnerHeaders } from '@/lib/learnerSession';
import { playSound, type HandsOnSound } from '@/lib/canvas/sounds';
import Icon from '@/components/Icon';
import { mathTextOn, typeset } from '@/lib/mathText';

/**
 * Words as big as fit their box, between `min` and `max` (% of the slide's height). A card's words were one fixed
 * size: small in a big card (three cards across a wide box), and hanging out of a small one (six cards, long answers).
 */
function FitBox({ fitKey, min = 2.2, max = 6.4, style, children }: { fitKey: string; min?: number; max?: number; style: CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fits = () => box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
    const fit = () => {
      let lo = min, hi = max;
      box.style.fontSize = `${hi}cqh`;
      if (fits()) return;
      for (let n = 0; n < 6; n++) {
        const mid = (lo + hi) / 2;
        box.style.fontSize = `${mid}cqh`;
        if (fits()) lo = mid; else hi = mid;
      }
      box.style.fontSize = `${lo}cqh`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [fitKey, min, max]);
  return <div ref={ref} style={{ fontSize: `${(min + max) / 2}cqh`, ...style }}>{children}</div>;
}

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

export default function ActivityView({ el, interactive, onDone, hintNonce = 0, solved = false, quiet = false, sounds = false, onMistake, finnMove, onFinn, guide, turn = false }: {
  el: ActivityElement; interactive: boolean; onDone?: (shown?: boolean) => void;
  /** It's the learner's turn on this box now (the professor has said what to do) */
  turn?: boolean;
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
  /** shown: finished with an answer given away ("Show me"): done, but not solved by the learner */
  const finish = useCallback((shown?: boolean) => {
    // was: the side effect inside a setDone updater, which React may run twice (dev): onDone twice
    if (doneRef.current || !alive.current) return;
    doneRef.current = true;
    if (idle.current) clearTimeout(idle.current);
    setDone(true);
    setJustDone(true);
    if (soundsRef.current) playSound('done');
    onDoneRef.current?.(shown);
  }, []);

  const ready = activityReady(el);
  const hint = interactive && ready && !touched && !done && !quiet;
  const kit: Kit = { live: interactive && ready, interactive: interactive && ready && !done, hint, touch, finish, solved, sound, mistake, finnMove: interactive ? finnMove : null, finnEvent, guide, turn: interactive && turn };
  // A half-made box: the editor shows what's missing; learners see nothing (it isn't waited on either)
  if (!ready && interactive) return null;
  return (
    <div data-activity={el.kind} style={{ position: 'absolute', inset: '1.2cqh 1.4cqh', display: 'flex', flexDirection: 'column', gap: '1.2cqh' }}>   {/* (inset was 0: the box's padding doesn't reach an absolute child, so the cards sat on its edge) */}
      {el.prompt && (
        <div style={{ fontSize: '3.8cqh', fontWeight: 800, color: INK, textAlign: 'center', lineHeight: 1.15 }}>
          <Icon name="hands-on-activity" /> {typeset(el.prompt)}
        </div>
      )}
      <div ref={setArea} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {!ready ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.4cqh dashed #94a3b8',
            borderRadius: '1.6cqh', color: '#64748b', fontSize: '2.8cqh', textAlign: 'center', padding: '2cqh' }}>
            Hands-on box: not finished yet (fill it in on the right)
          </div>
        ) : el.kind === 'sort' ? <Sort el={el} kit={kit} />
          : el.kind === 'order' ? <Order el={el} kit={kit} />
            : el.kind === 'cards' ? <Cards el={el} kit={kit} />
              : el.kind === 'hotspots' ? <Hotspots el={el} kit={kit} />
                : el.kind === 'answer' || el.kind === 'blank' ? <TypeAnswer el={el} kit={kit} />
                : el.kind === 'match' ? <Match el={el} kit={kit} />
                  : <Slider el={el} kit={kit} />}
        {hint && area && <HintHand area={area} mode={el.kind === 'sort' || el.kind === 'slider' ? 'drag' : 'tap'} />}
      </div>
      {justDone && (
        <div role="status" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 6, padding: '1.2cqh 2.6cqh', borderRadius: '99cqh', background: '#16a34a',
          color: '#fff', fontSize: '4cqh', fontWeight: 900, boxShadow: '0 1cqh 3cqh rgba(22,163,74,0.45)', animation: 'done-pop 600ms ease both, fade-in 400ms ease 2400ms reverse forwards',
          pointerEvents: 'none' }}><Icon name="check-mark" /> Nice!</div>
      )}
    </div>
  );
}

type Kit = {
  /** On the lesson page (not the editor's drawing of it), done or not */
  live: boolean;
  interactive: boolean; hint: boolean; touch: () => void; finish: (shown?: boolean) => void; solved: boolean;
  sound: (k: HandsOnSound) => void; mistake: (m: ActivityMistake) => void;
  finnMove?: FinnMove | null; finnEvent: (e: FinnEvent) => void; guide?: string;
  turn: boolean;
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
      const fromEl = area.querySelector<HTMLElement>('[data-hint-from]');
      const from = fromEl?.getBoundingClientRect();
      const to = area.querySelector('[data-hint-to]')?.getBoundingClientRect() ?? from;
      if (!from || !to) { setPts(null); return; }
      // a card or a step full of words: tap near its bottom-right corner, not on the words (was: the hand covered the question)
      const corner = fromEl?.dataset.hintSpot === 'corner';
      const fx = corner ? from.left + from.width * 0.84 : from.left + from.width / 2;
      const fy = corner ? from.top + from.height * 0.8 : from.top + from.height / 2;
      setPts({ fx: fx - a.left, fy: fy - a.top, tx: (corner ? fx : to.left + to.width / 2) - a.left, ty: (corner ? fy : to.top + to.height / 2) - a.top });
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
      <span style={{ display: 'block', fontSize: '6cqh', lineHeight: 1, transform: 'translate(-48%, -30%)', color: '#0f172a', filter: 'drop-shadow(0 0 0.3cqh #fff) drop-shadow(0 0.4cqh 0.6cqh rgba(0,0,0,0.35))' }}><Icon name="hands-on-activity" /></span>
    </span>
  );
}

const THINK_MS = 3000;   // cards: the moment to guess before they can flip

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
            {typeset(items[i].text)}
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
            <div data-bin={b} style={{ fontSize: '3.8cqh', fontWeight: 900, color: PALETTE[b % PALETTE.length] }}>{typeset(g)}</div>
            {items.map((it, i) => placed[i] !== b ? null : finn?.item === i ? (
              // Finn's pick: his badge, and the learner can drag it out to where it really goes
              <button key={i} type="button" disabled={!kit.interactive} data-bin={b} data-finn-pick=""
                data-hint-from={i === hintItem ? '' : undefined} title={`Finn put this here. Is he right?`}
                {...movable(i, '#f59e0b', { borderStyle: 'dashed', background: '#fffbeb', fontSize: '3.2cqh', animation: wrong?.item === i ? 'shake 450ms ease' : 'pop-in 450ms ease both' })}>
                <Icon name="raised-hand" /> {typeset(it.text)}
              </button>
            ) : (
              <div key={i} data-bin={b} style={chip(PALETTE[b % PALETTE.length], { animation: 'pop-in 350ms ease both', fontSize: '3.2cqh' })}><Icon name="check-mark" /> {typeset(it.text)}</div>
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

/*
 * Type the answer: one question at a time, a box for the answer, Check. Right: on to the next (all done: finished).
 * Wrong: "Not quite", a mistake for the lesson (the professor steps in when they repeat); after two tries, "Show me"
 * shows the answer and goes on. Checked forgivingly (lib/canvas/answerMatch.ts: 3/4 = 0.75, small typos…).
 */
const TRIES_BEFORE_SHOW = 2;
const KEYS = ['/', '.', '-', '(', ')', '^'];
const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'];
type Typed = { text: string; back?: string };
function TypeAnswer({ el, kit }: { el: ActivityElement; kit: Kit }) {
  // Practice: the same questions with fresh numbers (asked for once the box is done; they don't count for the lesson)
  const [fresh, setFresh] = useState<Typed[] | null>(null);
  const [freshBusy, setFreshBusy] = useState(false);
  const [freshNote, setFreshNote] = useState('');
  const [round, setRound] = useState(0);        // practice rounds finished
  const items: Typed[] = fresh ?? el.items ?? [];
  const [at, setAt] = useState(kit.solved ? items.length - 1 : 0);
  const [typed, setValue] = useState('');
  const value = typed;
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<'right' | 'wrong' | 'shown' | null>(kit.solved ? 'right' : null);
  const [over, setOver] = useState(kit.solved);   // every question answered (the box, or a practice round)
  const [hint, setHint] = useState('');
  const hintFor = useRef('');
  const anyShown = useRef(false);   // an answer given away: the box is done, not solved (the end screen's count)
  const input = useRef<HTMLInputElement>(null);
  const item = items[Math.min(at, items.length - 1)];
  const answer = (item?.back ?? '').split('|')[0].trim();
  const last = at >= items.length - 1;
  const canType = fresh ? kit.live && !over : kit.interactive;
  // Fill in the blank: the sentence is shown with its gap; with a word bank (the box's extra words) the learner taps a word
  const gap = el.kind === 'blank';
  const bank = useMemo(() => {
    if (!gap || !el.groups?.length) return null;
    const words = [...new Set([...(el.items ?? []).map((it) => (it.back ?? '').split('|')[0].trim()), ...el.groups].filter(Boolean))];
    return shuffled(words.length, `${el.id}:bank`).map((k) => words[k]);
  }, [gap, el.groups, el.items, el.id]);
  const math = mathTextOn();
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const next = () => {
    if (last) {
      setOver(true);
      if (fresh) setRound((n) => n + 1); else kit.finish(anyShown.current);
      return;
    }
    setAt((i) => i + 1); setValue(''); setTries(0); setResult(null); setHint('');
    window.setTimeout(() => input.current?.focus(), 50);
  };
  // A hint after a wrong try (/api/tutor/practice): the next step, never the answer. None when it can't be had: fine
  const askHint = (tried: string) => {
    const key = `${item.text}|${tried}`;
    if (hintFor.current === key) return;
    hintFor.current = key;
    fetch('/api/tutor/practice', { method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ kind: 'hint', question: item.text, answer: item.back ?? '', tried }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.hint && hintFor.current === key) setHint(String(d.hint)); })
      .catch(() => {});
  };
  const check = (given?: string) => {
    const value = given ?? typed;
    if (!canType || !item || !value.trim() || result === 'right' || result === 'shown') return;
    kit.touch();
    if (answerMatches(value, item.back ?? '', gap ? '' : item.text)) {
      kit.sound('good');
      setResult('right'); setHint('');
      window.setTimeout(next, 1100);
    } else {
      kit.sound('bad');
      if (!fresh) kit.mistake({ label: `${item.text} → ${value.trim()}`, item: item.text, chosen: value.trim(), correct: answer });
      setTries((t) => t + 1);
      setResult('wrong');
      if (kit.live) askHint(value.trim());
    }
  };
  const show = () => { anyShown.current = true; setResult('shown'); setHint(''); setValue(answer); window.setTimeout(next, 2200); };
  // The same questions with other numbers (each checked on the server: one whose sum doesn't add up is left out)
  const practise = async () => {
    setFreshBusy(true); setFreshNote('');
    try {
      const made = (await Promise.all((el.items ?? []).map((it) =>
        fetch('/api/tutor/practice', { method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ kind: 'fresh', question: it.text, answer: it.back ?? '' }) })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ))).filter((d) => d?.question && d?.answer).map((d) => ({ text: String(d.question), back: String(d.answer) }));
      if (!made.length) { setFreshNote('No new questions this time. Try again in a moment.'); return; }
      setFresh(made); setAt(0); setValue(''); setTries(0); setResult(null); setHint(''); setOver(false);
      window.setTimeout(() => input.current?.focus(), 50);
    } finally {
      setFreshBusy(false);
    }
  };
  const press = (k: string) => {
    const node = input.current;
    const a = node?.selectionStart ?? value.length, b = node?.selectionEnd ?? value.length;
    const v = k === 'back' ? value.slice(0, a === b ? Math.max(0, a - 1) : a) + value.slice(b) : value.slice(0, a) + k + value.slice(b);
    const caret = k === 'back' ? (a === b ? Math.max(0, a - 1) : a) : a + k.length;
    setValue(v); if (result === 'wrong') setResult(null); kit.touch();
    window.setTimeout(() => { node?.focus({ preventScroll: true }); node?.setSelectionRange(caret, caret); }, 0);
  };
  if (!item) return null;
  const color = result === 'right' ? '#16a34a' : result === 'wrong' ? '#dc2626' : result === 'shown' ? '#0891b2' : '#94a3b8';
  const key: CSSProperties = { fontSize: '3.2cqh', fontWeight: 700, minWidth: '6cqh', padding: '0.5cqh 1cqh', borderRadius: '1.2cqh', border: '0.3cqh solid #cbd5e1', background: '#fff', color: INK, cursor: 'pointer', lineHeight: 1.2 };
  // (only questions whose answer is a number can be made again with other numbers)
  const canPractise = kit.live && over && math && (el.items ?? []).some((it) => parseNumber((it.back ?? '').split('|')[0]) !== null);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.8cqh' }} data-type-answer data-practice={fresh ? '' : undefined}>
      {(items.length > 1 || fresh) && <div style={{ fontSize: '2.4cqh', fontWeight: 700, color: fresh ? '#7c3aed' : '#64748b' }}>{fresh ? 'Practice · ' : ''}{Math.min(at, items.length - 1) + 1} of {items.length}</div>}
      <FitBox fitKey={item.text} min={3} max={7} style={{ width: '92%', maxHeight: '34%', textAlign: 'center', fontWeight: 800, color: INK, lineHeight: 1.15, overflow: 'hidden' }}>
        {gap ? (() => {
          // the sentence, with the word in its gap once it's right (or shown)
          const [before, ...after] = item.text.split(/_{2,}/);
          const filled = result === 'right' || result === 'shown' ? (result === 'shown' ? answer : value.trim()) : bank && value ? value : '';
          return <>{before}<span data-gap style={{ display: 'inline-block', minWidth: '4.5em', padding: '0 0.3em', margin: '0 0.15em', borderBottom: `0.14em solid ${color}`, color, lineHeight: 1.1 }}>{filled || ' '}</span>{after.join('___')}</>;
        })() : typeset(item.text)}
      </FitBox>
      {bank ? (
        <div data-word-bank style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.4cqh', maxWidth: '92%' }}>
          {bank.map((w) => (
            <button key={w} type="button" disabled={!canType || result === 'right' || result === 'shown'} onClick={() => { setValue(w); if (result === 'wrong') setResult(null); check(w); }}
              style={{ fontSize: '3.8cqh', fontWeight: 800, padding: '0.9cqh 2.4cqh', borderRadius: '1.6cqh', border: `0.4cqh solid ${value === w && result === 'wrong' ? '#dc2626' : '#0891b2'}`, color: INK, background: value === w && result === 'right' ? '#dcfce7' : '#fff',
                cursor: 'pointer', opacity: !canType || result === 'right' || result === 'shown' ? 0.6 : 1, animation: value === w && result === 'wrong' ? 'shake 360ms ease' : undefined }}>{w}</button>
          ))}
        </div>
      ) : (
      <form onSubmit={(e) => { e.preventDefault(); check(); }} style={{ display: 'flex', gap: '1.4cqh', width: '70%', maxWidth: '90cqh' }}>
        <input ref={input} value={value} disabled={!canType || result === 'right' || result === 'shown'} inputMode="text" autoComplete="off"
          aria-label={`Your answer: ${item.text}`} placeholder="Your answer" data-hint-from=""
          onChange={(e) => { setValue(e.target.value); if (result === 'wrong') setResult(null); kit.touch(); }}
          style={{ flex: 1, minWidth: 0, fontSize: '4.6cqh', fontWeight: 700, textAlign: 'center', padding: '1cqh 1.6cqh', borderRadius: '1.6cqh',
            border: `0.5cqh solid ${color}`, color: INK, background: '#fff', outline: 'none',
            animation: result === 'wrong' ? 'shake 360ms ease' : undefined }} />
        <button type="submit" disabled={!canType || !value.trim() || result === 'right' || result === 'shown'}
          style={{ fontSize: '3.6cqh', fontWeight: 800, padding: '1cqh 2.6cqh', borderRadius: '1.6cqh', background: '#0891b2', color: '#fff', border: 'none',
            opacity: !canType || !value.trim() || result === 'right' || result === 'shown' ? 0.45 : 1, cursor: 'pointer' }}>Check</button>
      </form>
      )}
      {/* Math keys: the signs a keyboard hides (and the digits, on a touch screen) */}
      {math && !gap && canType && result !== 'right' && result !== 'shown' && (
        <div data-math-keys style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.8cqh', maxWidth: '92%' }}>
          {(touch ? [...DIGITS, ...KEYS] : KEYS).map((k) => (
            <button key={k} type="button" onClick={() => press(k)} aria-label={k === '/' ? 'fraction bar' : k === '^' ? 'to the power of' : k === '-' ? 'minus' : k === '.' ? 'decimal point' : k} style={key}>{k === '-' ? '−' : k}</button>
          ))}
          <button type="button" onClick={() => press('back')} aria-label="Delete" style={key}>⌫</button>
        </div>
      )}
      <div role="status" style={{ minHeight: '4.4cqh', fontSize: '3.2cqh', fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: '1.6cqh', flexWrap: 'wrap', justifyContent: 'center' }}>
        {result === 'right' && <><Icon name="check-mark" /> Right!</>}
        {result === 'wrong' && <>Not quite. Try again!</>}
        {result === 'shown' && <>The answer: {typeset(answer)}</>}
        {result !== 'right' && result !== 'shown' && tries >= TRIES_BEFORE_SHOW && canType && (
          <button type="button" onClick={show} style={{ fontSize: '2.8cqh', fontWeight: 700, padding: '0.6cqh 1.8cqh', borderRadius: '99cqh', border: '0.3cqh solid #0891b2', color: '#0891b2', background: '#fff', cursor: 'pointer' }}>Show me</button>
        )}
      </div>
      {hint && result === 'wrong' && (
        <div data-answer-hint style={{ maxWidth: '88%', fontSize: '2.8cqh', fontWeight: 600, color: '#92400e', background: '#fef3c7', border: '0.3cqh solid #fcd34d', borderRadius: '1.4cqh', padding: '0.8cqh 1.6cqh', textAlign: 'center', lineHeight: 1.25 }}>
          <Icon name="lightbulb" /> {typeset(hint)}
        </div>
      )}
      {canPractise && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4cqh', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={practise} disabled={freshBusy} data-practise
            style={{ fontSize: '2.8cqh', fontWeight: 700, padding: '0.7cqh 2cqh', borderRadius: '99cqh', border: '0.3cqh solid #7c3aed', color: '#6d28d9', background: '#fff', cursor: 'pointer', opacity: freshBusy ? 0.6 : 1 }}>
            {freshBusy ? 'Making new questions…' : round ? 'Practise again with new numbers' : 'Practise with new numbers'}
          </button>
          {freshNote && <span style={{ fontSize: '2.4cqh', color: '#64748b' }}>{freshNote}</span>}
        </div>
      )}
    </div>
  );
}

/*
 * Match the pairs: the words on the left, what goes with each on the right (mixed up). Tap one, then its partner:
 * right, the two take a colour and stay; wrong, a shake and another go. Done when every pair is made.
 */
function Match({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const items = useMemo(() => (el.items ?? []).slice(0, 6), [el.items]);
  const order = useMemo(() => shuffled(items.length, `${el.id}:match`), [items.length, el.id]);
  const [made, setMade] = useState<Set<number>>(() => new Set(kit.solved ? items.map((_, i) => i) : []));
  const [left, setLeft] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);   // the right-hand one just tried, wrongly
  const pick = (r: number) => {
    if (!kit.interactive || left === null || made.has(r)) return;
    kit.touch();
    if (r === left) {
      kit.sound('good');
      const next = new Set(made).add(r);
      setMade(next); setLeft(null); setWrong(null);
      if (next.size === items.length) window.setTimeout(() => kit.finish(), 500);
    } else {
      kit.sound('bad');
      kit.mistake({ label: `${items[left].text} → ${items[r].back ?? ''}`, item: items[left].text, chosen: items[r].back ?? '', correct: items[left].back ?? '' });
      setWrong(r);
      window.setTimeout(() => setWrong((w) => (w === r ? null : w)), 500);
    }
  };
  const cell = (on: boolean, done: number | null, bad = false): CSSProperties => ({
    flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.6cqh 1.6cqh', borderRadius: '1.6cqh', fontWeight: 800, lineHeight: 1.12,
    fontSize: `${Math.max(2.8, Math.min(4.4, 26 / items.length))}cqh`, cursor: done === null && kit.interactive ? 'pointer' : 'default', color: done !== null ? '#fff' : INK,
    background: done !== null ? PALETTE[done % PALETTE.length] : on ? '#cffafe' : '#fff', border: `0.4cqh solid ${bad ? '#dc2626' : done !== null ? PALETTE[done % PALETTE.length] : on ? '#0891b2' : '#94a3b8'}`,
  });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: '6%', padding: '0 2%' }} data-match>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.4cqh' }}>
        {items.map((it, i) => (
          <button key={i} type="button" data-match-left={i} data-hint-from={!made.has(i) && left === null ? '' : undefined} disabled={made.has(i) || !kit.interactive}
            onClick={() => { kit.touch(); setLeft(left === i ? null : i); }} style={cell(left === i, made.has(i) ? i : null)}>{typeset(it.text)}</button>
        ))}
      </div>
      <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: '1.4cqh' }}>
        {order.map((r) => (
          <button key={r} type="button" data-match-right={r} disabled={made.has(r) || !kit.interactive} onClick={() => pick(r)}
            style={{ ...cell(false, made.has(r) ? r : null, wrong === r), animation: wrong === r ? 'shake 360ms ease' : undefined }}>{typeset(items[r].back)}</button>
        ))}
      </div>
    </div>
  );
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
          <button key={k} type="button" disabled={!kit.interactive} onClick={() => tap(k)} data-hint-from={k === next ? '' : undefined} data-hint-spot="corner"
            style={chip(doneStep ? '#16a34a' : '#64748b', {
              position: 'relative', minWidth: '36%', maxWidth: '47%', padding: '1.8cqh 2cqh 1.8cqh 6.5cqh', textAlign: 'left',
              background: doneStep ? '#f0fdf4' : '#fff', cursor: kit.interactive && !doneStep ? 'pointer' : 'default',
              animation: wrong === k ? 'shake 450ms ease' : undefined, ...(kit.hint && !doneStep ? glow(true) : {}),
            })}>
            <span style={{ position: 'absolute', left: '1.6cqh', top: '50%', transform: 'translateY(-50%)', width: '4cqh', height: '4cqh', borderRadius: '50%',
              background: doneStep ? '#16a34a' : '#e2e8f0', color: doneStep ? '#fff' : '#94a3b8', fontSize: '2.6cqh', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{doneStep ? k + 1 : '?'}</span>
            {typeset(items[k].text)}
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
  // A moment to guess before any card can flip, once, when the learner's turn starts (guessing first is the point)
  const [thinking, setThinking] = useState(false);
  const thinkFrom = useRef(0);   // when the moment started (a time, not a flag: an effect that runs twice picks it up again)
  useEffect(() => {
    if (!kit.turn || kit.solved) return;
    if (!thinkFrom.current) {
      if (flipped.size) return;   // already flipping (during the instructions): no wait
      thinkFrom.current = Date.now();
    }
    const left = thinkFrom.current + THINK_MS - Date.now();
    if (left <= 0) return;
    setThinking(true);
    const t = setTimeout(() => setThinking(false), left);
    return () => { clearTimeout(t); setThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.turn]);
  const first = items.findIndex((_, i) => !flipped.has(i));
  const flip = (i: number) => {
    if (!kit.interactive || flipped.has(i) || thinking) return;
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
      {thinking && (
        <div role="status" data-think style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 8, padding: '1.4cqh 3cqh 1.8cqh',
          borderRadius: '2cqh', background: 'rgba(15,23,42,0.88)', color: '#fff', fontSize: '3.6cqh', fontWeight: 800, textAlign: 'center', pointerEvents: 'none',
          boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.35)', animation: 'pop-in 300ms ease both' }}>
          Think of your guesses first…
          {/* the wait, running out */}
          <div style={{ marginTop: '1cqh', height: '0.7cqh', borderRadius: '99cqh', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#67e8f9', transformOrigin: 'left', animation: `think-bar ${THINK_MS}ms linear both` }} />
          </div>
        </div>
      )}
      {items.map((it, i) => {
        const open = flipped.has(i);
        const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: '1.6cqh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '1.2cqh', textAlign: 'center', lineHeight: 1.2 };
        return (
          <button key={i} type="button" disabled={!kit.interactive} onClick={() => flip(i)} aria-label={open ? `${it.text}: ${it.back ?? ''}` : `${it.text} (tap to flip)`}
            data-hint-from={i === first && !thinking ? '' : undefined} data-hint-spot="corner"
            style={{ position: 'relative', border: 0, padding: 0, background: 'none', cursor: kit.interactive && !open ? 'pointer' : 'default', borderRadius: '1.6cqh',
              ...(kit.hint && !open ? glow(true) : {}) }}>
            <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform 600ms cubic-bezier(0.4, 0.2, 0.2, 1)', transform: open ? 'rotateY(180deg)' : 'none' }}>
              <FitBox fitKey={`${it.text}|${items.length}`} style={{ ...face, background: PALETTE[i % PALETTE.length], color: '#fff', fontWeight: 800, boxShadow: '0 0.8cqh 2cqh rgba(15,23,42,0.18)' }}>
                {typeset(it.text)}<span aria-hidden style={{ position: 'absolute', right: '1.2cqh', bottom: '0.8cqh', fontSize: '2.2cqh', opacity: 0.8 }}><Icon name="repeat" /></span>
                {finn?.item === i && (
                  // Finn's sticky note: his (wrong) guess, before the learner checks
                  <span data-finn-pick="" style={{ position: 'absolute', left: '6%', right: '6%', top: '5%', padding: '0.6cqh 1cqh', background: '#fef08a', color: INK,
                    fontSize: '2.6cqh', fontWeight: 700, borderRadius: '0.6cqh', transform: 'rotate(-3deg)', boxShadow: '0 0.4cqh 1cqh rgba(0,0,0,0.25)',
                    animation: 'pop-in 450ms ease both' }}><Icon name="raised-hand" /> Finn: “{finn.guess}”</span>
                )}
              </FitBox>
              <FitBox fitKey={`${it.back ?? it.text}|${items.length}|${finn?.item === i}`} style={{ ...face, background: '#fff', color: INK, fontWeight: 700, transform: 'rotateY(180deg)', border: `0.45cqh solid ${PALETTE[i % PALETTE.length]}` }}>
                <span>
                  {typeset(it.back ?? it.text)}
                  {finn?.item === i && <span style={{ display: 'block', marginTop: '0.8cqh', fontSize: '2.4cqh', fontWeight: 600, color: '#b45309' }}><Icon name="raised-hand" /> Finn guessed “{finn.guess}”</span>}
                </span>
              </FitBox>
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
  const spots = useMemo(() => spreadSpots(items), [items]);
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    // (a picture that didn't load has no size: the spots go on the whole box, not nowhere)
    const fit = () => { const b = img.getBoundingClientRect(); setRect(img.naturalWidth && img.naturalHeight ? contentRect(b.width, b.height, img.naturalWidth, img.naturalHeight, 'contain') : { x: 0, y: 0, w: 100, h: 100 }); };
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
        const left = rect.x + (spots[i].x / 100) * rect.w, top = rect.y + (spots[i].y / 100) * rect.h;
        const seen = opened.has(i);
        return (
          <div key={i}>
            <button type="button" disabled={!kit.interactive} onClick={() => open(i)} aria-label={it.text} data-hint-from={i === first ? '' : undefined}
              style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: '4.4cqh', height: '4.4cqh', margin: '-2.2cqh 0 0 -2.2cqh', borderRadius: '50%',
                border: '0.5cqh solid #fff', background: seen ? '#16a34a' : '#f97316', color: '#fff', fontSize: '2.4cqh', fontWeight: 900, zIndex: 4,
                cursor: kit.interactive ? 'pointer' : 'default', boxShadow: '0 0.4cqh 1cqh rgba(0,0,0,0.3)',
                animation: !seen && kit.interactive ? 'hint-pulse 1.6s ease-in-out infinite' : undefined }}>{seen ? <Icon name="check-mark" /> : i + 1}</button>
            {active === i && (
              <div role="status" style={{ position: 'absolute', left: `${Math.min(70, Math.max(2, left - 14))}%`, top: top > 55 ? undefined : `${top + 5}%`,
                // under the spots and see-through to taps: it never blocks the next spot
                bottom: top > 55 ? `${100 - top + 5}%` : undefined, width: '30%', zIndex: 3, pointerEvents: 'none', background: '#fff', borderRadius: '1.4cqh', padding: '1cqh 1.4cqh',
                boxShadow: '0 1cqh 3cqh rgba(15,23,42,0.25)', border: '0.35cqh solid #f97316', animation: 'pop-in 300ms ease both' }}>
                <div style={{ fontSize: '3.4cqh', fontWeight: 900, color: INK }}>{typeset(it.text)}</div>
                {it.back && <div style={{ fontSize: '3cqh', color: '#334155', lineHeight: 1.25, marginTop: '0.4cqh' }}>{typeset(it.back)}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where each spot goes (% of the picture). A spot never placed gets a place of its own along the
 * middle, and a spot right on top of another is moved off it, so every spot can be tapped. Was: unplaced
 * spots all sat at the centre, only the top one could be opened, and the box could never be finished.
 */
export function spreadSpots(items: { x?: number; y?: number }[]): { x: number; y: number }[] {
  const unplaced = items.filter((it) => typeof it.x !== 'number' || typeof it.y !== 'number').length;
  let k = 0;
  const out = items.map((it) => (typeof it.x === 'number' && typeof it.y === 'number'
    ? { x: it.x, y: it.y }
    : { x: ((++k) / (unplaced + 1)) * 100, y: 50 + (k % 2 ? -8 : 8) }));
  const MIN = 9;   // closer than this (% of the picture) and two spots overlap
  for (let i = 1; i < out.length; i++) {
    for (let tries = 0; tries < 12 && out.slice(0, i).some((o) => Math.hypot(o.x - out[i].x, o.y - out[i].y) < MIN); tries++) {
      const a = (tries * 137.5 * Math.PI) / 180;   // around it, a little further each time
      out[i] = { x: Math.min(95, Math.max(5, out[i].x + Math.cos(a) * MIN)), y: Math.min(95, Math.max(5, out[i].y + Math.sin(a) * MIN)) };
    }
  }
  return out;
}

/* -------------------------------------------------------------- slider */

function Slider({ el, kit }: { el: ActivityElement; kit: Kit }) {
  const s = el.slider!;
  const step = s.step ?? (s.max - s.min) / 100;
  // The furthest the knob can go: a step that doesn't divide the range stops short of the max (0 to 20
  // in 3s ends at 18). A stop past that counts as there. Was: a last stop out of reach, never finished
  const end = step > 0 ? s.min + Math.floor((s.max - s.min) / step + 1e-9) * step : s.max;
  const stops = s.stops.map((st) => ({ ...st, at: Math.min(st.at, end) }));
  const [value, setValue] = useState(kit.solved ? stops[stops.length - 1].at : s.min);
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
    if (v >= stops[stops.length - 1].at - 1e-9) kit.finish();
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
          {typeset(stop.text)}
        </div>
      </div>
      <div style={{ fontSize: '3.8cqh', fontWeight: 900, color: '#0891b2' }}>{s.label ? `${s.label}: ` : ''}{fmt(value)}</div>
      <div style={{ position: 'relative', width: '86%', borderRadius: '99cqh', ...(kit.hint ? glow(true) : {}) }}>
        <input type="range" min={s.min} max={s.max} step={step} value={value} disabled={!kit.interactive}
          aria-label={s.label || 'slider'} onChange={(e) => change(Number(e.target.value))}
          style={{ width: '100%', height: '4cqh', accentColor: '#0891b2', cursor: kit.interactive ? 'pointer' : 'default', margin: 0, touchAction: 'none' }} />
        {/* where the example hand slides from and to */}
        <span data-hint-from="" aria-hidden style={{ position: 'absolute', left: '1.5%', top: '50%', width: 1, height: 1 }} />
        <span data-hint-to="" aria-hidden style={{ position: 'absolute', left: '92%', top: '50%', width: 1, height: 1 }} />
      </div>
    </div>
  );
}
