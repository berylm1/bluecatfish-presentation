'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Slide, SlideElement, TextElement, TextStyle } from '@/lib/canvas/types';

// Font sizes are % of the slide height (container query units), so text keeps
// its size relative to the slide on any screen.
const STYLE_SIZE: Record<TextStyle, number> = { title: 7.5, body: 4.6, caption: 3.2, bigNumber: 14 };
const STYLE_WEIGHT: Record<TextStyle, number> = { title: 800, body: 500, caption: 500, bigNumber: 900 };
const MIN_SCALE = 0.6;   // text that doesn't fit shrinks, but never below 60%

/** Text that wraps in its box and shrinks a little if it still overflows. */
function FitText({ el }: { el: TextElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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

function ElementView({ el, active }: { el: SlideElement; active: boolean }) {
  const decorative = el.type === 'image' && el.silent && !el.alt;
  const style: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.z ?? (decorative ? 0 : 1),
    borderRadius: '1.2cqh',
    padding: el.type === 'text' ? '0.8cqh 1cqw' : 0,
    transition: 'box-shadow 300ms ease, background-color 300ms ease, transform 300ms ease',
    // The element being spoken: a soft glow, nothing that moves the layout
    boxShadow: active ? '0 0 0 0.35cqh rgba(34, 211, 238, 0.85), 0 0 3cqh rgba(34, 211, 238, 0.45)' : 'none',
    backgroundColor: active && el.type === 'text' ? 'rgba(34, 211, 238, 0.10)' : 'transparent',
    transform: active ? 'scale(1.015)' : 'none',
  };
  return (
    <div style={style} data-element-id={el.id} data-active={active || undefined}>
      {el.type === 'text' ? (
        <FitText el={el} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={el.src}
          alt={decorative ? '' : el.alt ?? ''}
          aria-hidden={decorative || undefined}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: el.fit ?? 'contain', borderRadius: 'inherit', pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}

/**
 * One 16:9 slide, as big as fits in 80% of the screen. Elements are placed by
 * percent, so the layout is identical at any size.
 */
export default function SlideCanvas({ slide, activeId }: { slide: Slide; activeId?: string | null }) {
  const bg = slide.background ?? {};
  return (
    <div
      data-slide-id={slide.id}
      style={{
        position: 'relative',
        width: 'min(80vw, calc(80vh * 16 / 9))',
        aspectRatio: '16 / 9',
        containerType: 'size',
        overflow: 'hidden',
        borderRadius: '1.5cqh',
        boxShadow: '0 20px 60px rgba(2, 6, 23, 0.35)',
        backgroundColor: bg.color ?? '#ffffff',
        backgroundImage: bg.image ? `url(${bg.image})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {slide.elements.map((el) => (
        <ElementView key={el.id} el={el} active={el.id === activeId} />
      ))}
    </div>
  );
}
