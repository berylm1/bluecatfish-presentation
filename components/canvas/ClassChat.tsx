'use client';

import { useEffect, useRef, useState } from 'react';
import { splitSentences, sentenceStops } from './useDeckPlayer';
import { CLASSMATES, CLASSMATE_IDS, type ClassmateId } from '@/lib/classmates';

/*
 * The class chat: everything said in the lesson, as one conversation. The learner's questions and
 * answers, the professor's replies, the classmates' questions and mix-ups, each with who said it.
 * The slides' narration is folded, one entry per slide (the line being said now is shown, the rest
 * opens with a click), so it doesn't drown out the back-and-forth. Replaces the top-right
 * transcript (Transcript.tsx). The page keeps the entries (app/presentation/page.tsx).
 */

export type Speaker = 'professor' | 'you' | ClassmateId;
export type ChatEntry =
  /** A slide's narration: the lines said so far (a slide visited again, or picked up after a question, gets a new entry) */
  | { id: number; kind: 'slide'; slide: number; title: string; lines: { key: string; text: string }[] }
  /** Something said: a line from the professor or a classmate, or what the learner typed, said or clicked */
  | { id: number; kind: 'line'; who: Speaker; text: string; to?: string }
  /** The professor's answer to a question (written as it streams in) */
  | { id: number; kind: 'answer'; exchange: number; text: string; done: boolean };

const PROFESSOR = { name: 'Professor Marine', short: 'PM', color: '#0891b2' };

export function speakerOf(who: Speaker, learnerName: string) {
  if (who === 'professor') return PROFESSOR;
  if (who === 'you') return { name: learnerName || 'You', short: (learnerName || 'You').slice(0, 2).toUpperCase(), color: '#22d3ee' };
  const c = CLASSMATES[who];
  return { name: c.name, short: c.name[0], color: c.color };
}

export function Avatar({ who, learnerName = '', size = 28, speaking = false }: { who: Speaker; learnerName?: string; size?: number; speaking?: boolean }) {
  const s = speakerOf(who, learnerName);
  return (
    <span aria-hidden className={`shrink-0 inline-flex items-center justify-center rounded-full font-bold text-white ${speaking ? 'ring-2 ring-white animate-pulse' : ''}`}
      style={{ width: size, height: size, background: s.color, fontSize: size * 0.4 }}>
      {s.short}
    </span>
  );
}

/** Text with the sentence being said now lit up (following the audio), like the old transcript */
function LiveText({ text, getAudio }: { text: string; getAudio?: () => HTMLAudioElement | null }) {
  const [current, setCurrent] = useState(0);
  const sentences = splitSentences(text);
  useEffect(() => {
    setCurrent(0);
    if (!getAudio) return;
    const stops = sentenceStops(text);
    let raf = 0;
    const tick = () => {
      const a = getAudio();
      if (a && Number.isFinite(a.duration) && a.duration > 0) {
        const i = stops.findIndex((s) => a.currentTime / a.duration < s);
        setCurrent(i === -1 ? stops.length - 1 : i);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [text, getAudio]);
  if (!getAudio) return <>{text}</>;
  return <>{sentences.map((s, i) => <span key={i} className={i === current ? 'text-white' : i < current ? 'text-white/50' : 'text-white/65'}>{s}</span>)}</>;
}

export default function ClassChat({ entries, learnerName, liveSlide, getAudio, thinking, speaking, onSend, onClose, closeLabel = 'Hide the chat', className = '', solid = false, mates = true }: {
  entries: ChatEntry[];
  learnerName: string;
  /** The slide entry whose last line is being said now (its id), or null */
  liveSlide: number | null;
  /** The lesson's audio, to follow the line being said */
  getAudio?: () => HTMLAudioElement | null;
  /** The professor is writing an answer */
  thinking: boolean;
  /** Who is talking now (a ring on their avatar at the top) */
  speaking: Speaker | null;
  /** What the learner types here goes to the professor (a question, or "next") */
  onSend: (text: string) => void;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  /** Over the slide (a pull-out): not see-through */
  solid?: boolean;
  /** The classmates are in the class (false: the study's group without them; just the professor and you) */
  mates?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());   // folded slide entries opened
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);   // at the bottom: follow new lines (scrolled up to read: stay there)

  const last = entries[entries.length - 1];
  const lastText = !last ? '' : last.kind === 'slide' ? last.lines[last.lines.length - 1]?.text ?? '' : last.text;
  useEffect(() => {
    const b = box.current;
    if (b && stick.current) b.scrollTop = b.scrollHeight;
  }, [entries.length, lastText, thinking]);

  return (
    <section className={`flex flex-col min-h-0 rounded-2xl ${solid ? 'bg-slate-950/95' : 'bg-slate-950/70'} backdrop-blur border border-white/10 shadow-2xl text-white ${className}`} aria-label="Class chat" data-bubble-avoid data-class-chat>
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        <h2 className="font-semibold text-sm flex-1">Class chat</h2>
        {/* who's in the class (a ring on whoever is talking) */}
        <div className="flex -space-x-1.5" aria-label={mates ? 'In the class: Professor Marine, you, Maya, Finn and Leo' : 'In the class: Professor Marine and you'}>
          {(['professor', 'you', ...(mates ? CLASSMATE_IDS : [])] as Speaker[]).map((w) => <Avatar key={w} who={w} learnerName={learnerName} size={22} speaking={speaking === w} />)}
        </div>
        {onClose && <button className="ml-1 w-7 h-7 rounded-full hover:bg-white/10 text-white/60 hover:text-white" onClick={onClose} aria-label={closeLabel} title={closeLabel}>✕</button>}
      </header>
      <div ref={box} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-2.5 text-sm leading-snug" aria-live="polite"
        onScroll={(e) => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40; }}>
        {entries.length === 0 && <p className="text-white/45 text-xs text-center mt-6">What’s said in class shows up here. Ask the professor anything below.</p>}
        {entries.map((e) => {
          if (e.kind === 'slide') {
            const live = e.id === liveSlide;
            const shown = live || open.has(e.id);
            const lines = live ? e.lines.slice(-1) : e.lines;
            const earlier = live ? e.lines.length - 1 : 0;
            return (
              <div key={e.id} className={live ? 'rounded-xl border border-cyan-300/20 bg-white/[0.04]' : ''} data-chat-slide>
                <button className={`w-full flex items-center gap-2 px-2.5 py-1 text-left text-[11px] uppercase tracking-wider hover:text-cyan-100 ${live ? 'text-cyan-200/80' : 'text-white/35'}`}
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                  aria-expanded={live ? undefined : shown} disabled={live && !earlier}>
                  <span aria-hidden>{live ? '🔊' : shown ? '▾' : '▸'}</span>
                  <span className="flex-1 truncate">Slide {e.slide + 1}{e.title ? ` · ${e.title}` : ''}</span>
                  {!live && <span className="normal-case tracking-normal text-white/40">{e.lines.length} line{e.lines.length === 1 ? '' : 's'}</span>}
                  {live && earlier > 0 && <span className="normal-case tracking-normal text-white/40">+{earlier} earlier</span>}
                </button>
                {shown && lines.length > 0 && (
                  <div className="px-2.5 pb-2 flex flex-col gap-1.5">
                    {live && open.has(e.id) && e.lines.slice(0, -1).map((l) => <p key={l.key} className="text-white/55">{l.text}</p>)}
                    {lines.map((l, i) => (
                      <p key={l.key} className={live ? '' : 'text-white/60'}>
                        {live && i === lines.length - 1 ? <LiveText text={l.text} getAudio={getAudio} /> : l.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const who: Speaker = e.kind === 'answer' ? 'professor' : e.who;
          const s = speakerOf(who, learnerName);
          const mine = who === 'you';
          const text = e.text;
          return (
            <div key={e.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`} data-chat-line={who}>
              <Avatar who={who} learnerName={learnerName} size={26} />
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-cyan-500/90 text-slate-950 rounded-br-md' : 'bg-white/10 rounded-bl-md'}`}>
                {!mine && <div className="text-[11px] font-semibold mb-0.5" style={{ color: who === 'professor' ? '#67e8f9' : s.color }}>{s.name}{e.kind === 'line' && e.to && <span className="font-normal text-white/50"> → {e.to}</span>}</div>}
                {text || <span className="inline-flex gap-1 py-1" aria-label="thinking"><Dot /><Dot d={150} /><Dot d={300} /></span>}
              </div>
            </div>
          );
        })}
        {thinking && last?.kind !== 'answer' && (
          <div className="flex items-end gap-2"><Avatar who="professor" size={26} /><div className="rounded-2xl rounded-bl-md bg-white/10 px-3 py-2"><span className="inline-flex gap-1 py-1"><Dot /><Dot d={150} /><Dot d={300} /></span></div></div>
        )}
      </div>
      <form className="flex items-center gap-1.5 p-2 border-t border-white/10" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { onSend(typed.trim()); setTyped(''); stick.current = true; } }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={500} placeholder="Ask the professor anything…" aria-label="Type to the class"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/10 placeholder:text-white/40 text-sm outline-none focus:bg-white/15" />
        <button className="px-3 py-2 rounded-lg bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-40" disabled={!typed.trim()}>Send</button>
      </form>
    </section>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: `${d}ms` }} />;
}

/** The classmates: who they are, and the last thing each said (the right-hand panel on wide screens, a pull-out on phones) */
export function ClassmatesPanel({ entries, speaking, onClose, className = '', solid = false }: {
  entries: ChatEntry[];
  speaking: Speaker | null;
  onClose?: () => void;
  className?: string;
  solid?: boolean;
}) {
  const lastBy = (id: ClassmateId) => {
    for (let i = entries.length - 1; i >= 0; i--) { const e = entries[i]; if (e.kind === 'line' && e.who === id) return e.text; }
    return null;
  };
  return (
    <section className={`flex flex-col min-h-0 rounded-2xl ${solid ? 'bg-slate-950/95' : 'bg-slate-950/70'} backdrop-blur border border-white/10 shadow-2xl text-white ${className}`} aria-label="Classmates" data-bubble-avoid data-classmates>
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        <h2 className="font-semibold text-sm flex-1">Classmates</h2>
        {onClose && <button className="w-7 h-7 rounded-full hover:bg-white/10 text-white/60 hover:text-white" onClick={onClose} aria-label="Hide the classmates" title="Hide the classmates">✕</button>}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 text-sm">
        {CLASSMATE_IDS.map((id) => {
          const c = CLASSMATES[id];
          const said = lastBy(id);
          return (
            <div key={id} className={`rounded-xl border px-3 py-2.5 transition-colors ${speaking === id ? 'bg-white/10' : 'bg-white/[0.03] border-white/10'}`}
              style={speaking === id ? { borderColor: c.color } : undefined} data-classmate={id}>
              <div className="flex items-center gap-2">
                <Avatar who={id} size={30} speaking={speaking === id} />
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: c.color }}>{c.name}{speaking === id && <span className="ml-1.5 text-[11px] text-white/70 font-normal">talking…</span>}</div>
                  <div className="text-[11px] text-white/55 leading-tight">{c.blurb}</div>
                </div>
              </div>
              {said && <p className="mt-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/85">“{said}”</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
