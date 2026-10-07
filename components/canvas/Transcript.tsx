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
  dialogue = [],
  question,
}: {
  speaker: string;
  text: string;
  /** Earlier questions and answers, shown under what's being said now */
  dialogue?: { question: string; answer: string; asker?: string }[];
  /** The playing audio, to follow along sentence by sentence (omit for streamed answers) */
  getAudio?: () => HTMLAudioElement | null;
  /** The question being answered right now, shown above the answer */
  question?: { text: string; asker?: string };
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
  useEffect(() => {
    const box = boxRef.current;
    if (box && !getAudio) box.scrollTop = box.scrollHeight;
  }, [text, dialogue.length, getAudio]);

  if (!text && !dialogue.length) return null;
  return (
    <aside
      data-bubble-avoid
      className={`fixed top-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] ${dialogue.length ? 'max-h-80' : 'max-h-44'} overflow-y-auto rounded-xl bg-slate-950/75 backdrop-blur-sm border border-white/10 px-3 py-2 text-sm leading-snug shadow-xl`}
      aria-live="polite"
      ref={boxRef}
    >
      {dialogue.length > 0 && (
        <div className="mb-2 pb-2 border-b border-white/10 space-y-1.5 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/60">Conversation</div>
          {dialogue.map((d, i) => (
            <div key={i}>
              <p className={d.asker ? 'text-amber-200/90' : 'text-cyan-200/80'}><b>{d.asker ?? 'You'}:</b> {d.question}</p>
              <p className="text-white/60"><b>Professor:</b> {d.answer}</p>
            </div>
          ))}
        </div>
      )}
      {question && <p className={`mb-1 ${question.asker ? 'text-amber-200' : 'text-cyan-200/90'}`}><b>{question.asker ?? 'You'}:</b> {question.text}</p>}
      {text && <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 mb-1">{speaker}</div>}
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
