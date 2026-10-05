'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Slide, SlideElement, TextElement, TextStyle } from '@/lib/canvas/types';
import { ChartView, DiagramView } from './Visuals';
import ActivityView from './Activity';
import { planMorph, sameBase, type MorphPlan } from '@/lib/canvas/morph';
import { contentRect } from '@/lib/canvas/laser';
import type { Pointer } from '@/lib/canvas/types';

// Font sizes are % of the slide height (container query units), so text keeps
// its size relative to the slide on any screen.
const STYLE_SIZE: Record<TextStyle, number> = { title: 7.5, body: 4.6, caption: 3.2, bigNumber: 14 };
const STYLE_WEIGHT: Record<TextStyle, number> = { title: 800, body: 500, caption: 500, bigNumber: 900 };
const MIN_SCALE = 0.6;   // text that doesn't fit shrinks, but never below 60%

/** Text that wraps in its box and shrinks a little if it still overflows. */
function FitText({ el }: { el: TextElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      let s = 1;
      box.style.fontSize = `${STYLE_SIZE[el.style]}cqh`;
      while (s > MIN_SCALE && (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1)) {
        s = Math.round((s - 0.05) * 100) / 100;
        box.style.fontSize = `${STYLE_SIZE[el.style] * s}cqh`;
      }
      setScale(s);
      setOverflow(box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [el.text, el.style, el.w, el.h, el.bold]);

  const justify = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
  return (
    <div
      ref={ref}
      data-fit-scale={scale}
      data-fit-overflow={overflow || undefined}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: justify,
        textAlign: el.align ?? 'left',
        fontSize: `${STYLE_SIZE[el.style] * scale}cqh`,
        fontWeight: el.bold ? Math.max(700, STYLE_WEIGHT[el.style]) : STYLE_WEIGHT[el.style],
        lineHeight: el.style === 'bigNumber' ? 1 : 1.25,
        color: el.color ?? '#0f172a',
        overflowWrap: 'break-word',
        whiteSpace: 'pre-wrap',
      }}
    >
      {el.text}
    </div>
  );
}

/**
 * The laser dot: a red point with a glow and a soft pulse. It glides from mark
 * to mark on the same element. For a picture, the mark is placed on the
 * picture itself (letterboxing taken into account).
 */
function LaserDot({ el, p, imgRef }: { el: SlideElement; p: Pointer; imgRef: React.RefObject<HTMLImageElement | null> }) {
  const [, rerender] = useState(0);
  const img = imgRef.current;
  const box = img?.parentElement?.getBoundingClientRect();
  const r = el.type === 'image' && img && box
    ? contentRect(box.width, box.height, img.naturalWidth, img.naturalHeight, el.fit ?? 'contain')
    : { x: 0, y: 0, w: 100, h: 100 };
  useLayoutEffect(() => { if (el.type === 'image' && img && !img.complete) img.addEventListener('load', () => rerender((n) => n + 1), { once: true }); }, [el.type, img]);
  return (
    <span
      data-laser={p.word}
      aria-hidden
      style={{
        position: 'absolute', zIndex: 5, pointerEvents: 'none',
        left: `${r.x + (p.x / 100) * r.w}%`, top: `${r.y + (p.y / 100) * r.h}%`,
        width: '3cqh', height: '3cqh', marginLeft: '-1.5cqh', marginTop: '-1.5cqh', borderRadius: '50%',
        background: 'radial-gradient(circle, #fff 0 18%, #ff2d2d 30%, rgba(255,45,45,0.55) 60%, rgba(255,45,45,0) 72%)',
        boxShadow: '0 0 1.6cqh 0.4cqh rgba(255, 40, 40, 0.65)',
        transition: 'left 450ms cubic-bezier(0.65,0,0.35,1), top 450ms cubic-bezier(0.65,0,0.35,1)',
        animation: 'laser-pulse 1.1s ease-in-out infinite',
      }}
    />
  );
}

function ElementView({ el, active, laser, dim = 1, interactive = false, onActivityDone }: {
  el: SlideElement; active: boolean; laser?: Pointer | null; dim?: number; interactive?: boolean; onActivityDone?: (id: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const decorative = el.type === 'image' && el.silent && !el.alt;
  // Spotlight: the rest of the slide steps back a little (never a background picture)
  const faded = !active && !decorative && dim < 1;
  const style: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.z ?? (decorative ? 0 : 1),
    borderRadius: '1.2cqh',
    padding: el.type === 'text' ? '0.8cqh 1cqw' : el.type === 'activity' ? '1cqh' : 0,
    transition: 'box-shadow 300ms ease, background-color 300ms ease, transform 300ms ease, opacity 450ms ease, filter 450ms ease',
    opacity: faded ? dim : 1,
    filter: faded ? 'saturate(0.8)' : 'none',
    // The element being spoken: a soft glow, nothing that moves the layout
    boxShadow: active ? '0 0 0 0.35cqh rgba(34, 211, 238, 0.85), 0 0 3cqh rgba(34, 211, 238, 0.45)' : 'none',
    backgroundColor: active && el.type === 'text' ? 'rgba(34, 211, 238, 0.10)' : 'transparent',
    transform: active ? 'scale(1.015)' : 'none',
  };
  return (
    <div style={style} data-element-id={el.id} data-active={active || undefined}>
      {el.type === 'text' ? (
        <FitText el={el} />
      ) : el.type === 'chart' ? (
        <ChartView el={el} />
      ) : el.type === 'diagram' ? (
        <DiagramView el={el} />
      ) : el.type === 'activity' ? (
        // a fresh start whenever the box itself changes (the editor)
        <ActivityView key={JSON.stringify([el.kind, el.items, el.groups, el.slider, el.src])} el={el} interactive={interactive} onDone={() => onActivityDone?.(el.id)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={el.src}
          alt={decorative ? '' : el.alt ?? ''}
          aria-hidden={decorative || undefined}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: el.fit ?? 'contain', borderRadius: 'inherit', pointerEvents: 'none' }}
        />
      )}
      {laser && <LaserDot el={el} p={laser} imgRef={imgRef} />}
    </div>
  );
}

/* ------------------------------------------------------------- morphing */

const MORPH_MS = 900;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

const box = (e: SlideElement): CSSProperties => ({ left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%` });

/** An element's content, without its box (the morph moves the box). */
function Content({ el }: { el: SlideElement }) {
  if (el.type === 'text') {
    return <div style={{ position: 'absolute', inset: 0, padding: '0.8cqh 1cqw' }}><FitText el={el} /></div>;
  }
  if (el.type === 'chart') return <ChartView el={el} />;
  if (el.type === 'diagram') return <DiagramView el={el} />;
  if (el.type === 'activity') return <ActivityView el={el} interactive={false} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={el.src} alt="" draggable={false}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: el.fit ?? 'contain', borderRadius: 'inherit', pointerEvents: 'none' }} />
  );
}

/**
 * Text during a morph, laid out once at its own box's size (in slide units)
 * and pinned to the moving box's corner: the words don't re-wrap or shrink
 * every frame while the box changes size, they just fade.
 */
function FrozenText({ el }: { el: TextElement }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: `${el.w}cqw`, height: `${el.h}cqh`, padding: '0.8cqh 1cqw' }}>
      <FitText el={el} />
    </div>
  );
}

const sameBox = (a: SlideElement, b: SlideElement) => Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

const sameContent = (a: SlideElement, b: SlideElement) =>
  a.type === 'text' && b.type === 'text' ? a.text === b.text && a.style === b.style
    : a.type === 'image' && b.type === 'image' ? a.src === b.src : false;

/**
 * The slide turning into another: paired elements glide and resize from
 * their old place to their new one while the old content dissolves into the
 * new (pictures through a soft blur, text by cross-fading); unpaired ones
 * fade out (old) or in (new, a moment later). `on` flips false → true one
 * frame after mounting, which starts the CSS transitions.
 */
function MorphLayer({ plan, on }: { plan: MorphPlan; on: boolean }) {
  const move = `left ${MORPH_MS}ms ${EASE}, top ${MORPH_MS}ms ${EASE}, width ${MORPH_MS}ms ${EASE}, height ${MORPH_MS}ms ${EASE}`;
  const fade = (ms: number, delay = 0) => `opacity ${ms}ms ease ${delay}ms, filter ${ms}ms ease ${delay}ms, transform ${ms}ms ${EASE} ${delay}ms`;
  return (
    <>
      {plan.leaving.map((a) => (
        <div key={`out-${a.id}`} style={{ position: 'absolute', ...box(a), zIndex: a.z ?? 1, borderRadius: '1.2cqh',
          opacity: on ? 0 : 1, transform: on ? 'scale(0.92)' : 'none', filter: on ? 'blur(4px)' : 'none', transition: fade(MORPH_MS * 0.5) }}>
          <Content el={a} />
        </div>
      ))}
      {plan.pairs.map(([a, b]) => {
        const isImage = a.type === 'image';
        if (a.type === 'text' && b.type === 'text' && !(sameContent(a, b) && sameBox(a, b))) {
          // was: both texts cross-faded across the whole move, re-wrapping as the box grew.
          // Now the old words fade out in the first part of the move and the new ones fade in as it lands, with no blank between.
          return (
            <div key={`pair-${a.id}-${b.id}`} data-morph-pair={`${a.id}>${b.id}`}
              style={{ position: 'absolute', ...box(on ? b : a), zIndex: (on ? b.z : a.z) ?? 1, borderRadius: '1.2cqh', transition: move }}>
              <div style={{ position: 'absolute', inset: 0, opacity: on ? 0 : 1, transition: `opacity ${MORPH_MS * 0.4}ms ease` }}>
                <FrozenText el={a} />
              </div>
              <div style={{ position: 'absolute', inset: 0, opacity: on ? 1 : 0,
                transition: `opacity ${MORPH_MS * 0.5}ms ease ${MORPH_MS * 0.35}ms` }}>
                <FrozenText el={b} />
              </div>
            </div>
          );
        }
        const same = sameContent(a, b);
        return (
          <div key={`pair-${a.id}-${b.id}`} data-morph-pair={`${a.id}>${b.id}`}
            style={{ position: 'absolute', ...box(on ? b : a), zIndex: (on ? b.z : a.z) ?? 1, borderRadius: '1.2cqh', transition: move }}>
            {same ? <Content el={b} /> : (
              <>
                <div style={{ position: 'absolute', inset: 0, transition: fade(MORPH_MS * 0.7),
                  opacity: on ? 0 : 1, filter: on && isImage ? 'blur(10px)' : 'none', transform: on && isImage ? 'scale(1.06)' : 'none' }}>
                  <Content el={a} />
                </div>
                <div style={{ position: 'absolute', inset: 0, transition: fade(MORPH_MS * 0.7, MORPH_MS * 0.3),
                  opacity: on ? 1 : 0, filter: !on && isImage ? 'blur(10px)' : 'none', transform: !on && isImage ? 'scale(0.94)' : 'none' }}>
                  <Content el={b} />
                </div>
              </>
            )}
          </div>
        );
      })}
      {plan.entering.map((b, i) => (
        <div key={`in-${b.id}`} style={{ position: 'absolute', ...box(b), zIndex: b.z ?? 1, borderRadius: '1.2cqh',
          opacity: on ? 1 : 0, transform: on ? 'none' : 'scale(0.92)', filter: on ? 'none' : 'blur(4px)',
          // one after another, as if drawn
          transition: fade(MORPH_MS * 0.6, MORPH_MS * 0.4 + Math.min(i, 4) * 120) }}>
          <Content el={b} />
        </div>
      ))}
    </>
  );
}

/**
 * When the slide changes to another version of itself (the helper, the
 * focused version, back again), runs the morph between them. Changes to a
 * different slide aren't morphed.
 */
function useMorph(slide: Slide, enabled: boolean) {
  const shown = useRef(slide);   // the slide last drawn (its latest content)
  const [morph, setMorph] = useState<{ plan: MorphPlan; on: boolean } | null>(null);
  // Only a change of slide (id) starts a morph: the page re-renders all the
  // time, and restarting on every render would freeze the animation halfway
  useLayoutEffect(() => {
    const from = shown.current;
    if (!enabled || from.id === slide.id || !sameBase(from.id, slide.id)) { setMorph(null); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMorph(null); return; }
    setMorph({ plan: planMorph(from, slide), on: false });
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setMorph((m) => m && { ...m, on: true })); });
    const done = setTimeout(() => setMorph(null), MORPH_MS + 150);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id, enabled]);
  // After the effect above, so it still sees the previous slide when the id changes
  useLayoutEffect(() => { shown.current = slide; });
  return morph;
}

/**
 * One 16:9 slide, as big as fits in 80% of the screen. Elements are placed by
 * percent, so the layout is identical at any size.
 */
export default function SlideCanvas({
  slide,
  activeId,
  width = 'min(80vw, calc(80vh * 16 / 9))',
  shadow = true,
  morph = false,
  laser,
  spotlight = 1,
  interactive = false,
  onActivityDone,
  children,
}: {
  slide: Slide;
  activeId?: string | null;
  /** CSS width; the height follows at 16:9. Thumbnails and the editor pass their own. */
  width?: string;
  shadow?: boolean;
  /** Morph (instead of switching) when the slide changes to another version of itself, e.g. its helper */
  morph?: boolean;
  /** The laser pointer: which element it's on and which mark */
  laser?: { elementId: string; pointer: Pointer } | null;
  /** While an element is being said, the others' opacity (1 = no spotlight) */
  spotlight?: number;
  /** Hands-on boxes can be used (the lesson); elsewhere they're drawn as they start */
  interactive?: boolean;
  /** A hands-on box was finished */
  onActivityDone?: (elementId: string) => void;
  /** Drawn on top of the slide (the editor's selection boxes) */
  children?: React.ReactNode;
}) {
  const bg = slide.background ?? {};
  const morphing = useMorph(slide, morph);
  return (
    <div
      data-slide-id={slide.id}
      style={{
        position: 'relative',
        width,
        aspectRatio: '16 / 9',
        containerType: 'size',
        // Own stacking context: element (and editor box) z-indexes stay inside
        // the slide and can't rise above popups on the page
        isolation: 'isolate',
        overflow: 'hidden',
        borderRadius: '1.5cqh',
        boxShadow: shadow ? '0 20px 60px rgba(2, 6, 23, 0.35)' : undefined,
        backgroundColor: bg.color ?? '#ffffff',
        backgroundImage: bg.image ? `url(${bg.image})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {morphing ? <MorphLayer plan={morphing.plan} on={morphing.on} /> : slide.elements.map((el) => (
        <ElementView key={el.id} el={el} active={el.id === activeId} laser={laser?.elementId === el.id ? laser.pointer : null}
          dim={activeId && slide.elements.some((e) => e.id === activeId) ? spotlight : 1}
          interactive={interactive} onActivityDone={onActivityDone} />
      ))}
      {children}
    </div>
  );
}
