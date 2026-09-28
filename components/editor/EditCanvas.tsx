'use client';

import { useRef, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Slide, SlideElement } from '@/lib/canvas/types';

// The slide being edited: the real renderer underneath, and on top a box per
// element that can be clicked, dragged and resized. Positions stay in percent.

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 3;          // smallest box, % of the slide
const GRID = 0.5;       // positions snap to half a percent
const SNAP = 1;         // within 1% of the slide's centre line, snap to it

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const IMAGE_DRAG_TYPE = 'application/x-canvas-image';

export default function EditCanvas({
  slide,
  selected,
  onSelect,
  onChange,
  onDropImage,
  onEditText,
  warnIds,
}: {
  slide: Slide;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** group: one undo step per drag */
  onChange: (id: string, patch: Partial<SlideElement>, group: string) => void;
  onDropImage: (img: { url: string; description: string }, x: number, y: number) => void;
  onEditText: () => void;
  warnIds: Set<string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  const startDrag = (e: React.PointerEvent, el: SlideElement, handle: Handle | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    const rect = wrapRef.current!.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };
    const group = `drag:${el.id}:${Date.now()}`;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - start.px) / rect.width) * 100;
      const dy = ((ev.clientY - start.py) / rect.height) * 100;
      let { x, y, w, h } = start;
      if (!handle) {
        x = clamp(snap(start.x + dx), 0, 100 - w);
        y = clamp(snap(start.y + dy), 0, 100 - h);
        // Centre lines of the slide
        const v = Math.abs(x + w / 2 - 50) < SNAP;
        const hz = Math.abs(y + h / 2 - 50) < SNAP;
        if (v) x = 50 - w / 2;
        if (hz) y = 50 - h / 2;
        setGuides({ v, h: hz });
      } else {
        if (handle.includes('e')) w = clamp(snap(start.w + dx), MIN, 100 - start.x);
        if (handle.includes('s')) h = clamp(snap(start.h + dy), MIN, 100 - start.y);
        if (handle.includes('w')) {
          x = clamp(snap(start.x + dx), 0, start.x + start.w - MIN);
          w = start.x + start.w - x;
        }
        if (handle.includes('n')) {
          y = clamp(snap(start.y + dy), 0, start.y + start.h - MIN);
          h = start.y + start.h - y;
        }
      }
      onChange(el.id, { x, y, w, h }, group);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setGuides({ v: false, h: false });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(IMAGE_DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    onDropImage(JSON.parse(raw), ((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
  };

  // Front-most first, so clicks land on what's on top
  const ordered = [...slide.elements].sort((a, b) => (a.z ?? 1) - (b.z ?? 1));

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ width: 'min(100%, calc((100vh - 190px) * 16 / 9))' }}
      onPointerDown={() => onSelect(null)}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(IMAGE_DRAG_TYPE)) e.preventDefault(); }}
      onDrop={onDrop}
    >
      <SlideCanvas slide={slide} width="100%">
        {ordered.map((el) => {
          const isSel = el.id === selected;
          return (
            <div
              key={el.id}
              data-edit-box={el.id}
              onPointerDown={(e) => startDrag(e, el, null)}
              onDoubleClick={() => el.type === 'text' && onEditText()}
              className={`group absolute cursor-move ${isSel ? 'outline outline-2 outline-cyan-500' : 'hover:outline hover:outline-1 hover:outline-cyan-400/70'}`}
              style={{
                left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
                zIndex: 50 + (el.z ?? 1),
                outlineStyle: isSel ? 'solid' : undefined,
                boxShadow: warnIds.has(el.id) ? 'inset 0 0 0 2px rgba(245, 158, 11, 0.8)' : undefined,
              }}
            >
              {el.silent && (
                <span className="absolute -top-0.5 -left-0.5 px-1 rounded-br bg-slate-700/70 text-[10px] text-white pointer-events-none">silent</span>
              )}
              {isSel && HANDLES.map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => startDrag(e, el, h)}
                  className="absolute w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm"
                  style={{
                    // inside the box, so handles at the slide's edge aren't cut off
                    left: h.includes('w') ? 0 : h.includes('e') ? 'calc(100% - 12px)' : 'calc(50% - 6px)',
                    top: h.includes('n') ? 0 : h.includes('s') ? 'calc(100% - 12px)' : 'calc(50% - 6px)',
                    cursor: `${h}-resize`,
                  }}
                />
              ))}
            </div>
          );
        })}
        {guides.v && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-pink-500 pointer-events-none" style={{ zIndex: 200 }} />}
        {guides.h && <div className="absolute left-0 right-0 top-1/2 h-px bg-pink-500 pointer-events-none" style={{ zIndex: 200 }} />}
      </SlideCanvas>
    </div>
  );
}
