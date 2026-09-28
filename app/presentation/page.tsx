'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { useDeckPlayer } from '@/components/canvas/useDeckPlayer';
import { useVoiceInput } from '@/components/hooks/useVoiceInput';
import { parseCanvasCommand, findSlide } from '@/lib/canvas/commands';
import { COMMAND_ACK_TEXT } from '@/lib/deckCommands';
import { SAMPLE_DECK } from '@/lib/canvas/sampleDeck';
import { loadLegacyDeck } from '@/lib/canvas/fromLegacy';
import { DEFAULT_LESSON, HAS_AI_LESSON } from '@/lib/canvas/lessons';
import type { Deck } from '@/lib/canvas/types';

/*
 * The canvas presentation (see docs/customization-plan.md).
 *   /presentation                    → the default lesson
 *   /presentation?lesson=<id>        → another lesson
 *   /presentation?lesson=<id>&preview=1 → that lesson's saved draft (editors only)
 *   /presentation?lesson=sample      → the built-in sample deck
 * A lesson plays its published deck; with none, the AI lesson.
 * Barge-in, the emotion check-in and tutor questions come in a later step.
 */

const NEXT_CLIP_ACK = 'Skipping that bit.';

type Loaded = { deck: Deck; preview: boolean };

async function loadDeck(lesson: string, preview: boolean): Promise<Loaded> {
  if (lesson === 'sample') return { deck: SAMPLE_DECK, preview: false };
  if (preview) {
    const res = await fetch(`/api/editor/deck?lesson=${encodeURIComponent(lesson)}&kind=draft`);
    if (res.status === 401) throw new Error('Previews are for editors: unlock the slide editor first.');
    const { deck } = await res.json();
    if (!deck?.slides?.length) throw new Error('This draft has no saved slides yet.');
    return { deck, preview: true };
  }
  const res = await fetch(`/api/deck?lesson=${encodeURIComponent(lesson)}`);
  const { deck, error } = await res.json();
  if (error) throw new Error(error);
  if (deck?.slides?.length) return { deck, preview: false };
  if (HAS_AI_LESSON.has(lesson)) return { deck: await loadLegacyDeck(lesson, DEFAULT_LESSON.title), preview: false };
  throw new Error('This lesson hasn’t been published yet.');
}

export default function CanvasPresentation() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lesson = params.get('lesson') || DEFAULT_LESSON.id;
    loadDeck(lesson, params.get('preview') === '1')
      .then(setLoaded)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error || !loaded) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6 text-center">
        {error ? (
          <p className="text-lg text-red-200 max-w-md">{error}</p>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-4 border-cyan-300/30 border-t-cyan-300 animate-spin" />
            <p className="text-slate-300">Getting the lesson ready… (the first time, this can take a few minutes)</p>
          </>
        )}
      </main>
    );
  }
  return <Player deck={loaded.deck} preview={loaded.preview} />;
}

function Player({ deck, preview }: { deck: Deck; preview: boolean }) {
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
        {preview && <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold">Preview of the saved draft</div>}
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
        {preview && <span className="mr-2 text-amber-300">Preview ·</span>}
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
