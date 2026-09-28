'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { useDeckPlayer } from '@/components/canvas/useDeckPlayer';
import { useVoiceInput } from '@/components/hooks/useVoiceInput';
import { parseCanvasCommand, findSlide } from '@/lib/canvas/commands';
import { COMMAND_ACK_TEXT } from '@/lib/deckCommands';
import { SAMPLE_DECK } from '@/lib/canvas/sampleDeck';
import type { Deck } from '@/lib/canvas/types';

/*
 * The canvas presentation (see docs/customization-plan.md). Step 1: plays the
 * sample deck. Loading real decks, the editor, barge-in, the emotion check-in
 * and tutor questions come in the next steps.
 */

const NEXT_CLIP_ACK = 'Skipping that bit.';

export default function CanvasPresentation() {
  const [deck] = useState<Deck>(SAMPLE_DECK);
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useDeckPlayer(deck, started);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const handleText = useCallback((text: string) => {
    const cmd = parseCanvasCommand(text);
    if (!cmd) {
      say('Questions for the professor come in a later step.');
      player.resume();
      return;
    }
    switch (cmd.kind) {
      case 'nextClip': say(NEXT_CLIP_ACK); player.nextClip(); break;
      case 'nextSlide': say(COMMAND_ACK_TEXT.cmd_nextSlide); player.nextSlide(); break;
      case 'prevSlide':
        if (player.slideIndex === 0) { say(COMMAND_ACK_TEXT.cmd_atStart); player.repeat(); }
        else { say(COMMAND_ACK_TEXT.cmd_prevSlide); player.prevSlide(); }
        break;
      case 'nextTopic':
        say(player.topicIndex >= player.topicCount - 1 ? COMMAND_ACK_TEXT.cmd_wrapUp : COMMAND_ACK_TEXT.cmd_nextTopic);
        player.nextTopic();
        break;
      case 'repeat': say(COMMAND_ACK_TEXT.cmd_repeat); player.repeat(); break;
      case 'simplify': say(COMMAND_ACK_TEXT.cmd_simplify); player.simplify(); break;
      case 'goTo': {
        const target = findSlide(deck, cmd.query, player.slideIndex);
        if (target === null) { say(COMMAND_ACK_TEXT.cmd_notFound); player.resume(); }
        else { say(COMMAND_ACK_TEXT.cmd_goto); player.goToSlide(target); }
        break;
      }
    }
  }, [deck, player, say]);

  const { status: micStatus, toggleMic } = useVoiceInput(handleText, () => player.pause());

  // Keyboard: → next clip, Shift+→ / PageDown next slide, ← previous slide,
  // space pause/resume, R repeat, S simpler
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' && e.shiftKey) player.nextSlide();
      else if (e.key === 'ArrowRight') player.nextClip();
      else if (e.key === 'PageDown') player.nextSlide();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') player.prevSlide();
      else if (e.key === ' ') { e.preventDefault(); if (player.status === 'paused') player.resume(); else player.pause(); }
      else if (e.key.toLowerCase() === 'r') player.repeat();
      else if (e.key.toLowerCase() === 's') player.simplify();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, player]);

  if (!started) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">
        <h1 className="text-4xl font-bold text-center">{deck.title}</h1>
        <p className="text-slate-300 text-center max-w-md">Turn your sound on. Say or type &quot;next&quot;, &quot;next slide&quot;, &quot;repeat&quot; or &quot;simpler please&quot; at any time.</p>
        <button onClick={() => setStarted(true)} className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold">
          Start Lesson
        </button>
      </main>
    );
  }

  const slide = deck.slides[player.slideIndex];
  const btn = 'px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white px-4 py-4">
      <div className="text-xs uppercase tracking-widest text-cyan-200/70">
        Topic {player.topicIndex + 1} of {player.topicCount} · Slide {player.slideIndex + 1} of {deck.slides.length}
        {player.mode === 'plain' && <span className="ml-2 text-amber-300">· plain version</span>}
      </div>

      <div className="relative">
        {player.status === 'finished' ? (
          <div
            className="flex flex-col items-center justify-center gap-6 bg-white text-slate-900 rounded-2xl p-10 text-center"
            style={{ width: 'min(80vw, calc(80vh * 16 / 9))', aspectRatio: '16 / 9' }}
          >
            <h2 className="text-3xl font-bold">That&apos;s the lesson!</h2>
            {deck.recap && <p className="text-lg max-w-2xl">{deck.recap}</p>}
            <button onClick={player.restart} className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold">Start over</button>
          </div>
        ) : (
          <SlideCanvas slide={slide} activeId={player.activeId} />
        )}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/85 text-white text-sm shadow-lg" role="status">
            {toast}
          </div>
        )}
      </div>

      {/* clip dots: one per spoken element on this slide */}
      <div className="flex gap-1.5 h-2" aria-hidden>
        {Array.from({ length: player.clipCount }, (_, i) => (
          <span key={i} className={`w-6 h-1.5 rounded-full ${i < player.clipIndex ? 'bg-cyan-300' : i === player.clipIndex ? 'bg-cyan-300 animate-pulse' : 'bg-white/20'}`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button className={btn} onClick={player.prevSlide} disabled={player.slideIndex === 0}>⏮ Previous slide</button>
        {player.status === 'paused'
          ? <button className={btn} onClick={player.resume}>▶ Resume</button>
          : <button className={btn} onClick={player.pause} disabled={player.status === 'finished'}>⏸ Pause</button>}
        <button className={btn} onClick={player.nextClip}>⏭ Next</button>
        <button className={btn} onClick={player.nextSlide}>⏩ Next slide</button>
        <button className={btn} onClick={player.repeat}>⟲ Repeat</button>
        <button className={btn} onClick={player.simplify}>Simpler please</button>
        <button
          className={`${btn} ${micStatus === 'listening' ? 'bg-red-500/80 hover:bg-red-500' : ''}`}
          onClick={toggleMic}
          disabled={micStatus === 'processing'}
        >
          {micStatus === 'listening' ? '● Listening…' : micStatus === 'processing' ? '…' : '🎤 Talk'}
        </button>
        <form
          onSubmit={(e) => { e.preventDefault(); if (typed.trim()) handleText(typed); setTyped(''); }}
          className="flex"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder='Type "next", "go back"…'
            className="px-3 py-2 rounded-l-lg bg-white/10 placeholder:text-white/40 text-sm outline-none focus:bg-white/15 w-44"
          />
          <button className="px-3 py-2 rounded-r-lg bg-cyan-500/80 hover:bg-cyan-500 text-sm font-medium">Send</button>
        </form>
      </div>
    </main>
  );
}
