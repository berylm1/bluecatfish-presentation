'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { MicLevel } from '@/components/hooks/useVoiceInput';

/** Small live mic level bar with the barge-in threshold marked (reads a ref, so it never re-renders the page). */
export default function MicMeter({ levelRef, listening }: { levelRef: MutableRefObject<MicLevel>; listening: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const scale = (v: number) => Math.min(100, Math.sqrt(v / 0.2) * 100);   // quiet sounds stay visible
    const tick = () => {
      const { level, threshold } = levelRef.current;
      if (barRef.current) barRef.current.style.width = `${scale(level)}%`;
      if (markRef.current) markRef.current.style.left = `${scale(threshold)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);
  return (
    <div className="relative w-20 h-2 rounded-full bg-white/15 overflow-hidden" title="Microphone level (talk past the line to interrupt)">
      <div ref={barRef} className={`h-full ${listening ? 'bg-red-400' : 'bg-emerald-400'} transition-[width] duration-75`} />
      <div ref={markRef} className="absolute top-0 bottom-0 w-0.5 bg-white/80" />
    </div>
  );
}
