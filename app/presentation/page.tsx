'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { useDeckPlayer } from '@/components/canvas/useDeckPlayer';
import { useListener } from '@/components/canvas/useListener';
import Transcript from '@/components/canvas/Transcript';
import { useTutor } from '@/components/canvas/useTutor';
import MicMeter from '@/components/canvas/MicMeter';
import { parseCanvasCommand, findSlide } from '@/lib/canvas/commands';
import { useCues } from '@/components/canvas/useCues';
import { useLessonTracking } from '@/components/canvas/useLessonTracking';
import VariantOverlay, { type Variant } from '@/components/canvas/VariantOverlay';
import { useEmotionWatcher, type LearnerEmotion } from '@/components/hooks/useEmotionWatcher';
import { useHandRaise } from '@/components/hooks/useHandRaise';
import { useFacePresence } from '@/components/hooks/useFacePresence';
import { describeForTutor } from '@/lib/learnerState';
import { CUE_TEXT, type CueKey } from '@/lib/canvas/cues';
import { SAMPLE_DECK } from '@/lib/canvas/sampleDeck';
import { loadLegacyDeck } from '@/lib/canvas/fromLegacy';
import { DEFAULT_LESSON, HAS_AI_LESSON } from '@/lib/canvas/lessons';
import type { Deck } from '@/lib/canvas/types';

/*
 * The canvas presentation (see docs/customization-plan.md).
 *   /presentation                    → the default lesson
 *   /presentation?lesson=<id>        → another lesson
 *   /presentation?lesson=<id>&preview=1 → that lesson's saved draft (editors only)
 *   /presentation?lesson=<id>&preview=ai → that lesson's AI deck (editors only)
 *   /presentation?lesson=sample      → the built-in sample deck
 * A lesson plays its published deck; with none, its AI deck; with neither,
 * the old AI lesson converted (Blue Catfish only).
 * The learner can interrupt, ask questions, say they're lost (variant slides),
 * and with the camera on the professor notices confusion, looking away and a
 * raised hand. Learner events go to the same tables as /presentationv2.
 */

type Loaded = { deck: Deck; preview: boolean };

async function loadDeck(lesson: string, preview: 'draft' | 'ai' | null): Promise<Loaded> {
  if (lesson === 'sample') return { deck: SAMPLE_DECK, preview: false };
  if (preview) {
    const res = await fetch(`/api/editor/deck?lesson=${encodeURIComponent(lesson)}&kind=${preview}`);
    if (res.status === 401) throw new Error('Previews are for editors: unlock the slide editor first.');
    const { deck } = await res.json();
    if (!deck?.slides?.length) throw new Error(preview === 'ai' ? 'This lesson has no AI deck yet.' : 'This draft has no saved slides yet.');
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
    const pv = params.get('preview');
    loadDeck(lesson, pv === 'ai' ? 'ai' : pv ? 'draft' : null)
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

// "You lost me" and friends: the learner is confused, not just asking for simpler words
const CONFUSED = /\blost me\b|\bi'?m lost\b|\b(?:don'?t|do not|didn'?t) (?:understand|get it|get that|get this|follow)\b|\bconfus|\bwhat does (?:that|this|it) (?:even )?mean\b|^huh\b/i;
const YES = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|uh[- ]huh|definitely|go ahead|do it|mhm)\b/i;
const SPEAKING: string[] = ['playing', 'loading', 'finishing', 'waiting'];

function Player({ deck, preview }: { deck: Deck; preview: boolean }) {
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [interruptOn, setInterruptOn] = useState(false);   // talk over the professor (opt-in: opens the mic)
  const [cameraOn, setCameraOn] = useState(false);         // emotion check-in, presence, hand raise (opt-in)
  const [showTranscript, setShowTranscript] = useState(true);   // top-right text of what's being said
  const [variant, setVariant] = useState<Variant | null>(null);
  const [mood, setMood] = useState<LearnerEmotion | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useDeckPlayer(deck, started);
  const tutor = useTutor();
  const cues = useCues(started);
  const tracking = useLessonTracking(deck, started, player.slideIndex, player.status === 'finished');
  // Async steps (an answer or a cue finished) must act on the latest player, not the one from when they began
  const playerRef = useRef(player);
  playerRef.current = player;
  const tutorBusy = tutor.thinking || tutor.speaking;

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  /** Say a short reply ("Skipping ahead."), then do it. A newer reply cancels this one. */
  const act = useCallback((cue: CueKey, action: () => void) => {
    say(CUE_TEXT[cue]);
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    cues.play(cue).then((ok) => { if (ok) action(); });
  }, [cues, say]);

  /** What the learner is looking at, for the tutor: the slide's text and what's being said. */
  const slideText = useCallback((i: number) => {
    const s = deck.slides[i];
    return s ? s.elements.map((e) => (e.type === 'text' ? e.text : e.alt ? `[image: ${e.alt}]` : '')).filter(Boolean).join(' | ') : '';
  }, [deck]);
  const slideContext = useCallback(() => {
    const p = playerRef.current;
    const s = deck.slides[p.slideIndex];
    if (!s) return deck.title;
    const speaking = s.elements.find((e) => e.id === p.activeId);
    return `Lesson: ${deck.title}. Topic: ${s.topic ?? ''}. On screen: ${slideText(p.slideIndex)}.` +
      (speaking?.say ? ` The professor was just saying: "${speaking.say}"` : '') +
      describeForTutor(tracking.state());
  }, [deck, slideText, tracking]);

  /** A question (not a command): the professor answers, then the lesson carries on. */
  const answer = useCallback(async (question: string) => {
    tracking.track('tutor_question', { question: question.slice(0, 300) }, { questions: 1 });
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    const { decision, superseded } = await tutor.ask(question, slideContext());
    if (superseded) return;   // talked over the answer: the next turn decides what happens
    if (decision) tracking.track('tutor_decision', { action: decision });
    const now = playerRef.current;
    if (decision === 'simplify') now.simplify();
    else if (decision === 'advance') now.nextSlide();
    else if (decision === 'repeat') now.repeat();
    else now.resume();
  }, [tutor, slideContext, tracking]);

  /**
   * The learner is lost: show a reviewed variant slide for this topic if there
   * is one (e.g. the authored PDF deck slide), otherwise play the plain
   * version of what was just said.
   */
  const confused = useCallback(async () => {
    tracking.track('confusion_click', {}, { confusion_marks: 1 });
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    const s = deck.slides[p.slideIndex];
    let found: Variant | null = null;
    try {
      const q = new URLSearchParams({ state: tracking.state().last_state === 'frustrated' ? 'frustrated' : 'confused', title: s?.topic ?? '', about: slideText(p.slideIndex) });
      const res = await fetch(`/api/tutor/variant?${q}`, { signal: AbortSignal.timeout(4000) });
      found = (await res.json()).variant ?? null;
    } catch { /* no variant: the plain version below */ }
    if (found) {
      tracking.track('tutor_decision', { action: 'variant', variant: found.variant, title: found.title });
      setVariant(found);
      const ok = await cues.play({ text: found.narration, url: found.audio_url });
      if (ok) { setVariant(null); playerRef.current.resume(); }
      return;
    }
    tracking.track('tutor_decision', { action: 'plain' });
    act('cmd_simplify', () => playerRef.current.simplify());
  }, [deck, slideText, tracking, cues, act]);

  const closeVariant = useCallback(() => {
    cues.stop();
    setVariant(null);
    playerRef.current.resume();
  }, [cues]);

  // Paused on purpose before talking? Then a turn with nothing in it leaves it paused
  const resumeAfterTurn = useRef(true);
  // The professor asked "You look puzzled…?" and is waiting for the answer
  const checkIn = useRef<LearnerEmotion | null>(null);

  const handleText = useCallback((text: string) => {
    const cmd = parseCanvasCommand(text);
    if (variant) { cues.stop(); setVariant(null); }
    if (!cmd) { answer(text); return; }
    if (tutorBusy) tutor.cancel();   // a command ends the answer
    const command = (kind: string, patch?: Parameters<typeof tracking.track>[2]) =>
      tracking.track(kind === 'repeat' ? 'repeat_request' : kind === 'simplify' ? 'simplify_request' : 'deck_command', { kind }, patch);
    const p = player;
    switch (cmd.kind) {
      case 'nextClip': command('nextClip', { skips: 1 }); act('cmd_nextClip', () => playerRef.current.nextClip()); break;
      case 'nextSlide': command('nextSlide', { skips: 1 }); act('cmd_nextSlide', () => playerRef.current.nextSlide()); break;
      case 'prevSlide':
        command('prevSlide');
        if (p.slideIndex === 0) act('cmd_atStart', () => playerRef.current.repeat());
        else act('cmd_prevSlide', () => playerRef.current.prevSlide());
        break;
      case 'nextTopic':
        command('nextTopic', { skips: 1 });
        act(p.topicIndex >= p.topicCount - 1 ? 'cmd_wrapUp' : 'cmd_nextTopic', () => playerRef.current.nextTopic());
        break;
      case 'repeat': command('repeat', { repeats: 1 }); act('cmd_repeat', () => playerRef.current.repeat()); break;
      case 'simplify':
        if (CONFUSED.test(text)) { confused(); break; }   // "you lost me": another way to see it
        command('simplify', { simplify_requests: 1 });
        act('cmd_simplify', () => playerRef.current.simplify());
        break;
      case 'goTo': {
        const target = findSlide(deck, cmd.query, p.slideIndex);
        if (target !== null) { command('goTo', { jumps: 1 }); act('cmd_goto', () => playerRef.current.goToSlide(target)); }
        else if (cmd.soft) answer(text);   // "tell me about X": not on a slide, so the professor answers
        else act('cmd_notFound', () => playerRef.current.resume());
        break;
      }
    }
  }, [deck, player, act, answer, confused, tutor, tutorBusy, tracking, variant, cues]);

  // Barge-in: with interruptions on, starting to talk over the professor (or
  // over an answer) makes them finish the sentence, then stop and listen.
  const speakingNow = ['playing', 'loading', 'finishing'].includes(player.status) || tutor.speaking;
  const { status: micStatus, talk, levelRef } = useListener({
    armed: interruptOn && started,
    bargeActive: speakingNow,
    onListenStart: () => {
      resumeAfterTurn.current = playerRef.current.status !== 'paused' || checkIn.current !== null;
      if (tutor.speaking || tutor.thinking) tutor.finishSentence();
      else if (SPEAKING.includes(playerRef.current.status)) {
        tracking.track('barge_in', {}, { barge_ins: 1 });
        playerRef.current.interrupt();
      }
    },
    onTranscript: (text) => {
      const asked = checkIn.current;
      checkIn.current = null;
      if (asked && text && YES.test(text.trim())) {
        // "Want me to go over that a different way?" → yes
        if (asked === 'confused') confused();
        else act('cmd_nextSlide', () => playerRef.current.nextSlide());
        return;
      }
      if (text) handleText(text);
      // nothing usable (a cough, silence, no answer to a check-in): carry on
      else if (resumeAfterTurn.current && !tutor.thinking) playerRef.current.resume();
    },
  });

  /* ------------------------------------------------ camera: the instructor notices */

  // The mic is mid-turn (it can be 'off' when interruptions are off: that's free)
  const micBusy = micStatus === 'listening' || micStatus === 'processing';

  // Emotion check-in: sustained confusion or boredom on camera → the professor
  // finishes the sentence, asks, and listens; "yes" helps, silence carries on.
  const onEmotion = useCallback((state: LearnerEmotion) => {
    const p = playerRef.current;
    if (!started || tutorBusy || variant || checkIn.current || micBusy || !SPEAKING.includes(p.status)) return;
    setMood(state);
    tracking.track('emotion_state', { state }, state === 'confused' ? { confusion_marks: 1 } : undefined);
    p.interrupt(() => {
      cues.play(state === 'confused' ? 'cue_confused' : 'cue_bored').then((ok) => {
        if (!ok) return;
        checkIn.current = state;
        resumeAfterTurn.current = true;
        talk();
      });
    });
  }, [started, tutorBusy, variant, micStatus, tracking, cues, talk]);
  const { ready: emotionReady, error: emotionError } = useEmotionWatcher(cameraOn && started, onEmotion)   // busy moments are skipped in onEmotion, so the camera isn't restarted per answer;

  // Hand raise: stop at the end of the sentence, "Do you have a question?", listen
  const onHandRaised = useCallback(() => {
    if (!started || micBusy || variant) return;
    tracking.track('hand_raise');
    resumeAfterTurn.current = true;
    const ask = () => cues.play('cue_handRaise').then((ok) => { if (ok) talk(); });
    if (tutorBusy) { tutor.finishSentence(); ask(); }
    else playerRef.current.interrupt(ask);
  }, [started, micStatus, variant, tracking, cues, talk, tutorBusy, tutor]);
  useHandRaise(cameraOn && started, onHandRaised);

  // Presence: looked away → pause and wait; back → pick up again
  const { present, error: presenceError } = useFacePresence(cameraOn && started);
  const awayPaused = useRef(false);
  const lastPresent = useRef<boolean | null>(null);
  useEffect(() => {
    if (!cameraOn || !started) { lastPresent.current = null; return; }
    if (lastPresent.current === null) { lastPresent.current = present; return; }   // first reading
    if (present === lastPresent.current) return;
    lastPresent.current = present;
    const p = playerRef.current;
    if (!present) {
      tracking.track('presence_away');
      if (SPEAKING.includes(p.status) && !tutorBusy) {
        p.pause();
        awayPaused.current = true;
        cues.play('cue_away');
      }
    } else {
      tracking.track('presence_back');
      if (awayPaused.current) {
        awayPaused.current = false;
        cues.play('cue_back').then((ok) => { if (ok) playerRef.current.resume(); });
      }
    }
  }, [present, cameraOn, started, tracking, cues, tutorBusy]);

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
      else if (e.key.toLowerCase() === 'l') confused();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, player, confused]);

  if (!started) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">
        {preview && <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold">{deck.source === 'ai' ? 'Preview of the AI deck' : 'Preview of the saved draft'}</div>}
        <h1 className="text-4xl font-bold text-center">{deck.title}</h1>
        <p className="text-slate-300 text-center max-w-md">Turn your sound on. Ask the professor anything, or say &quot;next&quot;, &quot;next slide&quot;, &quot;repeat&quot; or &quot;simpler please&quot; at any time.</p>
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
      {showTranscript && (tutor.speaking || tutor.thinking
        ? <Transcript speaker="Professor Marine · answering" text={tutor.exchange?.answer ?? ''} />
        : <Transcript speaker={player.mode === 'plain' ? 'Professor Marine · plain version' : 'Professor Marine'} text={player.captionText} getAudio={player.getAudio} />)}
      <div className="text-xs uppercase tracking-widest text-cyan-200/70">
        {preview && <span className="mr-2 text-amber-300">Preview ·</span>}
        Topic {player.topicIndex + 1} of {player.topicCount} · Slide {player.slideIndex + 1} of {deck.slides.length}
        {player.mode === 'plain' && <span className="ml-2 text-amber-300">· plain version</span>}
        {player.status === 'finishing' && <span className="ml-2 text-emerald-300">· finishing the sentence, then listening</span>}
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
        {variant && <VariantOverlay variant={variant} onDone={closeVariant} />}
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

      {/* The question and the professor's answer, while it's being answered */}
      {tutor.exchange && (
        <div className="w-full max-w-3xl rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-sm relative" role="status">
          <button className="absolute top-2 right-3 text-white/50 hover:text-white" onClick={tutor.clearExchange} aria-label="Close">✕</button>
          <p className="text-cyan-200/90"><b>You:</b> {tutor.exchange.question}</p>
          <p className="mt-1 text-white/90">
            <b>Professor Marine:</b>{' '}
            {tutor.thinking && !tutor.exchange.answer ? <span className="animate-pulse">thinking…</span> : tutor.exchange.answer}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button className={btn} onClick={player.prevSlide} disabled={player.slideIndex === 0}>⏮ Previous slide</button>
        {player.status === 'paused'
          ? <button className={btn} onClick={player.resume}>▶ Resume</button>
          : <button className={btn} onClick={player.pause} disabled={player.status === 'finished'}>⏸ Pause</button>}
        <button className={btn} onClick={player.nextClip}>⏭ Next</button>
        <button className={btn} onClick={player.nextSlide}>⏩ Next slide</button>
        <button className={btn} onClick={player.repeat}>⟲ Repeat</button>
        <button className={btn} onClick={() => handleText('simpler please')}>Simpler please</button>
        <button className={btn} onClick={confused} title="Another way to see it">😕 I&apos;m lost</button>
        <button
          className={`${btn} ${micStatus === 'listening' ? 'bg-red-500/80 hover:bg-red-500' : ''}`}
          onClick={talk}
          disabled={micStatus === 'processing'}
        >
          {micStatus === 'listening' ? '● Listening…' : micStatus === 'processing' ? '…' : '🎤 Talk'}
        </button>
        <button
          className={`${btn} ${interruptOn ? 'bg-emerald-500/70 hover:bg-emerald-500' : ''}`}
          onClick={() => {
            setInterruptOn((on) => !on);
            if (!interruptOn) say('Interrupt on: just start talking and the professor will finish the sentence and listen.');
          }}
          title="Talk over the professor any time (uses the microphone)"
        >
          🎙 Interrupt {interruptOn ? 'on' : 'off'}
        </button>
        {(interruptOn || micStatus === 'listening') && <MicMeter levelRef={levelRef} listening={micStatus === 'listening'} />}
        <button
          className={`${btn} ${cameraOn ? 'bg-emerald-500/70 hover:bg-emerald-500' : ''}`}
          onClick={() => {
            setCameraOn((on) => !on);
            if (!cameraOn) say('Camera on: raise your hand to ask, and the professor notices if you look lost or step away. Nothing leaves your device.');
          }}
          title="Hand raise, “you look puzzled” check-ins and pause-when-away (camera stays on this device)"
        >
          📷 Camera {cameraOn ? 'on' : 'off'}
        </button>
        {cameraOn && (
          <span className="text-xs text-white/70">
            {emotionError || presenceError ? `⚠ camera unavailable (${emotionError || presenceError})` : !emotionReady ? 'starting…' : present ? '👤 here' : '🚫 away'}
            {mood && ` · ${mood === 'confused' ? '😕 puzzled' : mood === 'bored' ? '😐 quiet' : '🙂'}`}
          </span>
        )}
        <button className={`${btn} ${showTranscript ? 'bg-white/20' : ''}`} onClick={() => setShowTranscript((v) => !v)} title="Show the words being said (top right)">
          💬 Transcript {showTranscript ? 'on' : 'off'}
        </button>
        <form
          onSubmit={(e) => { e.preventDefault(); if (typed.trim()) handleText(typed); setTyped(''); }}
          className="flex"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder='Ask a question, or "next"…'
            className="px-3 py-2 rounded-l-lg bg-white/10 placeholder:text-white/40 text-sm outline-none focus:bg-white/15 w-44"
          />
          <button className="px-3 py-2 rounded-r-lg bg-cyan-500/80 hover:bg-cyan-500 text-sm font-medium">Send</button>
        </form>
      </div>
    </main>
  );
}
