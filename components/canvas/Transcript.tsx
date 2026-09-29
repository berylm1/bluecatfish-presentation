'use client';

import { useEffect, useRef, useState } from 'react';
import { splitSentences, sentenceStops } from './useDeckPlayer';

/**
 * Top-right transcript of whatever is being said: the lesson clip (with the
 * sentence being spoken now highlighted) or the professor's answer.
 */
export default function Transcript({
  speaker,
  text,
  getAudio,
}: {
  speaker: string;
  text: string;
  /** The playing audio, to follow along sentence by sentence (omit for streamed answers) */
  getAudio?: () => HTMLAudioElement | null;
}) {
  const [current, setCurrent] = useState(0);
  const sentences = splitSentences(text);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(0);
    if (!getAudio) return;
    const stops = sentenceStops(text);
    let raf = 0;
    const tick = () => {
      const a = getAudio();
      if (a && Number.isFinite(a.duration) && a.duration > 0) {
        const share = a.currentTime / a.duration;
        const i = stops.findIndex((s) => share < s);
        setCurrent(i === -1 ? stops.length - 1 : i);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [text, getAudio]);

  // Keep the current sentence in view
  useEffect(() => {
    boxRef.current?.querySelector('[data-now]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current, text]);

  if (!text) return null;
  return (
    <aside
      className="fixed top-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] max-h-44 overflow-y-auto rounded-xl bg-slate-950/75 backdrop-blur-sm border border-white/10 px-3 py-2 text-sm leading-snug shadow-xl"
      aria-live="polite"
      ref={boxRef}
    >
      <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 mb-1">{speaker}</div>
      <p>
        {sentences.map((s, i) => (
          <span
            key={i}
            data-now={getAudio && i === current ? '' : undefined}
            className={!getAudio ? 'text-white/90' : i === current ? 'text-white' : i < current ? 'text-white/45' : 'text-white/60'}
          >
            {s}
          </span>
        ))}
      </p>
    </aside>
  );
}
