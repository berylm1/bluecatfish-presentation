'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Deck, SlideElement } from '@/lib/canvas/types';
import { speakingOrder, spokenText, topicIndexes } from '@/lib/canvas/queue';
import { currentAudio } from '@/lib/canvas/aiFields';
import { learnerHeaders } from '@/lib/learnerSession';

const AFTER_SLIDE_MS = 1500;    // pause after a slide's last clip before moving on
const SILENT_SLIDE_MS = 5000;   // a slide with nothing to say stays up this long
const DUCK_VOLUME = 0.25;       // while the professor finishes a sentence over the learner
const MAX_FINISH_S = 6;         // never keep talking more than this after being interrupted

// 'finishing' = interrupted: ducked, completing the current sentence, then pauses
export type PlayerStatus = 'loading' | 'playing' | 'finishing' | 'paused' | 'waiting' | 'finished';

/**
 * When the sentence being spoken at `t` ends, in seconds. Sentence times are
 * estimated from their share of the text (speech is close to even-paced),
 * so the professor stops at a sentence end instead of mid-word.
 */
/** A text split into sentences (keeps the punctuation and trailing space). */
export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g)?.filter((s) => s.trim()) ?? [text];
}

/** Where each sentence ends, as a share (0-1) of the clip. Speech is close to even-paced. */
export function sentenceStops(text: string): number[] {
  const sentences = splitSentences(text);
  const total = sentences.reduce((n, s) => n + s.length, 0) || 1;
  let chars = 0;
  return sentences.map((s) => (chars += s.length) / total);
}

/**
 * When the sentence being spoken at `t` ends, in seconds, so an interrupted
 * professor stops at a sentence end instead of mid-word.
 */
export function sentenceEnd(text: string, t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return t + 3;
  for (const share of sentenceStops(text)) {
    const end = share * duration;
    if (end > t + 0.25) return Math.min(end, t + MAX_FINISH_S, duration);
  }
  return Math.min(duration, t + MAX_FINISH_S);
}

/** When the sentence being spoken at `t` started, in seconds (to replay it after an interruption). */
export function sentenceStart(text: string, t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  let start = 0;
  for (const share of sentenceStops(text)) {
    const end = share * duration;
    if (end > t + 0.05) break;   // this sentence runs past t: it's the one being spoken
    start = end;
  }
  return Math.min(start, Math.max(0, duration - 0.1));
}

type Pos = {
  slide: number;
  clip: number;               // index into the slide's speaking order
  mode: 'normal' | 'plain';   // plain = the "simpler please" version of this clip
  token: number;              // bumped to (re)start playback at this position
};

// Clips without a pre-made file are spoken live through /api/tts and cached per text
export async function liveClip(text: string, simple: boolean): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: learnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, simple }),
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

/**
 * Plays a canvas deck: each slide's elements in speaking order, then the next
 * slide after a short pause. Exposes the controls the page and voice commands use.
 */
export function useDeckPlayer(
  deck: Deck,
  started: boolean,
  opts: {
    /**
     * Asked before moving on by itself from slide `from` to `to` (`to` past the
     * end = the lesson is over). true → stop there, paused, and call onHold
     * instead (e.g. the self-check between topics). Commands never ask.
     */
    holdBefore?: (from: number, to: number) => boolean;
    onHold?: (from: number, to: number) => void;
    /**
     * Asked when an element's clip is over: true → stop there, paused, and
     * call onWait (a hands-on box: the learner's turn). The page carries on
     * with nextClip() when they're done.
     */
    waitAfter?: (el: SlideElement) => boolean;
    onWait?: (el: SlideElement) => void;
    /** The slide to start on (a preview from the editor's current slide) */
    startAt?: number;
  } = {},
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [pos, setPos] = useState<Pos>(() => ({ slide: Math.max(0, Math.min(opts.startAt ?? 0, deck.slides.length - 1)), clip: 0, mode: 'normal', token: 0 }));
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const statusRef = useRef(status);
  statusRef.current = status;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef(new Map<string, Promise<string | null>>());
  const textRef = useRef('');                          // words of the clip playing now
  const holdRef = useRef<(() => void) | null>(null);   // set while finishing a sentence: runs once stopped
  const finishTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);   // pause asked for; a clip that finishes loading waits
  // Interrupted mid-sentence: where that sentence began. The learner talked
  // over it (it was ducked), so resume plays it again from there.
  const replayRef = useRef<number | null>(null);
  // Waiting for the learner (waitAfter): resume doesn't skip past it, only nextClip / a move does
  const waitingRef = useRef(false);

  const orders = useMemo(() => deck.slides.map(speakingOrder), [deck]);
  const topics = useMemo(() => topicIndexes(deck.slides), [deck]);
  const order = orders[pos.slide] ?? [];
  const current: SlideElement | null = order[Math.min(pos.clip, order.length - 1)] ?? null;
  const speaking = status === 'playing' || status === 'loading' || status === 'paused' || status === 'finishing';

  const clipUrl = useCallback((el: SlideElement, mode: Pos['mode']) => {
    // A pre-made clip only if it says exactly the current words (edited words get a new clip on save)
    const premade = currentAudio(el, mode);
    if (premade) return Promise.resolve<string | null>(premade);
    // No plain version yet (it's written when the slide is saved): replay the clip calmly
    const text = mode === 'plain' ? el.plain?.trim() || spokenText(el) : spokenText(el);
    const key = `${mode}|${text}`;
    let p = cacheRef.current.get(key);
    if (!p) {
      p = liveClip(text, mode === 'plain');
      cacheRef.current.set(key, p);
      p.then((url) => { if (!url) cacheRef.current.delete(key); });   // retry next time
    }
    return p;
  }, []);

  const goToSlide = useCallback((slide: number) => {
    if (slide < 0) return;
    // Past the last slide = the end; the position moves there too, so a clip
    // still finishing can't carry the deck on
    setPos((p) => ({ slide: Math.min(slide, deck.slides.length), clip: 0, mode: 'normal', token: p.token + 1 }));
  }, [deck.slides.length]);

  // Play whatever is at the current position
  useEffect(() => {
    if (!started) return;
    if (pos.slide >= deck.slides.length) {
      setStatus('finished');
      return;
    }
    let cancelled = false;
    pausedRef.current = false;   // a new position always plays
    replayRef.current = null;    // (and has nothing to replay)
    waitingRef.current = false;
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      if (finishTimerRef.current) clearInterval(finishTimerRef.current);
      finishTimerRef.current = null;
      holdRef.current = null;
    };

    if (pos.clip >= order.length) {
      setStatus('waiting');
      timerRef.current = setTimeout(() => {
        const to = pos.slide + 1;
        if (optsRef.current.holdBefore?.(pos.slide, to)) {
          pausedRef.current = true;
          setStatus('paused');
          optsRef.current.onHold?.(pos.slide, to);
        } else {
          goToSlide(to);
        }
      }, order.length ? AFTER_SLIDE_MS : SILENT_SLIDE_MS);
      return () => { cancelled = true; clear(); };
    }

    const el = order[pos.clip];
    setStatus('loading');
    textRef.current = pos.mode === 'plain' ? el.plain?.trim() || spokenText(el) : spokenText(el);
    clipUrl(el, pos.mode).then((url) => {
      if (cancelled) return;
      const next = () => {
        if (cancelled) return;
        // Interrupted and the clip ran out while finishing its sentence: stop here
        if (holdRef.current) { stopFinishing(); return; }
        // The learner's turn (a hands-on box): wait here until the page says go on
        if (optsRef.current.waitAfter?.(el)) {
          waitingRef.current = true;
          pausedRef.current = true;
          setStatus('paused');
          optsRef.current.onWait?.(el);
          return;
        }
        // After a plain version, carry on with the slide's next clip
        setPos((p) => ({ ...p, clip: p.clip + 1, mode: 'normal' }));
      };
      if (!url) {
        // No audio (text to speech failed or was rate-limited). Was: skip
        // straight on, even while paused, so a lesson paused for a question
        // jumped ahead and talked over the answer, and offline a slide
        // flashed by in silence. Now: paused → stay (resume tries again);
        // otherwise show the words (caption) for a reading-time pause.
        audioRef.current = null;   // so resume retries this clip, not the one before
        if (pausedRef.current) return;
        setStatus('playing');
        const words = textRef.current.split(/\s+/).filter(Boolean).length;
        timerRef.current = setTimeout(next, Math.min(12000, Math.max(2000, words * 350)));
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = next;
      audio.onerror = next;
      // Paused (or interrupted) while the clip was loading: keep it ready, don't start it
      if (pausedRef.current) return;
      audio.play().then(() => { if (!cancelled) setStatus('playing'); }).catch(next);
      // Get the following clip ready while this one plays
      const following = order[pos.clip + 1] ?? orders[pos.slide + 1]?.[0];
      if (following) clipUrl(following, 'normal');
    });
    return () => { cancelled = true; clear(); };
    // pos.token restarts the same position (repeat, simpler, resume after a pause)
  }, [started, pos, order, orders, clipUrl, goToSlide, deck.slides.length]);

  const clampedClip = Math.max(0, Math.min(pos.clip, order.length - 1));
  const getAudio = useCallback(() => audioRef.current, []);   // stable, so followers don't restart

  /** End of "finishing": pause where the sentence ended and hand over to the learner. */
  function stopFinishing() {
    if (finishTimerRef.current) clearInterval(finishTimerRef.current);
    finishTimerRef.current = null;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.volume = 1; }
    const done = holdRef.current;
    holdRef.current = null;
    pausedRef.current = true;
    setStatus('paused');
    done?.();
  }

  const controls = useMemo(() => ({
    nextClip: () => setPos((p) => ({ ...p, clip: p.clip + 1, mode: 'normal', token: p.token + 1 })),
    nextSlide: () => goToSlide(pos.slide + 1),
    prevSlide: () => goToSlide(Math.max(0, pos.slide - 1)),
    goToSlide,
    nextTopic: () => {
      const i = topics.findIndex((t, idx) => idx > pos.slide && t > topics[pos.slide]);
      goToSlide(i === -1 ? deck.slides.length : i);
    },
    repeat: () => setPos((p) => ({ ...p, clip: clampedClip, mode: 'normal', token: p.token + 1 })),
    simplify: () => setPos((p) => ({ ...p, clip: clampedClip, mode: 'plain', token: p.token + 1 })),
    pause: () => {
      replayRef.current = null;   // a plain pause picks up exactly where it stopped
      if (timerRef.current) clearTimeout(timerRef.current);
      if (finishTimerRef.current) clearInterval(finishTimerRef.current);
      holdRef.current = null;
      pausedRef.current = true;
      audioRef.current?.pause();
      setStatus('paused');
    },
    resume: () => {
      if (statusRef.current !== 'paused' && !pausedRef.current) return;
      // Still the learner's turn (after a question, or ▶): stay, it's the hands-on box that moves the lesson on
      if (waitingRef.current) return;
      pausedRef.current = false;
      const audio = audioRef.current;
      const replayAt = replayRef.current;
      replayRef.current = null;
      if (audio && replayAt !== null) {
        // back after an interruption: say the sentence that was talked over again
        audio.currentTime = replayAt;
        audio.volume = 1;
        audio.play().then(() => setStatus('playing')).catch(() => {});
      } else if (audio && audio.ended) {
        // stopped right at the end of a clip: carry on with the next one
        setPos((p) => ({ ...p, clip: p.clip + 1, mode: 'normal', token: p.token + 1 }));
      } else if (audio && audio.paused) {
        audio.volume = 1;
        audio.play().then(() => setStatus('playing')).catch(() => {});
      } else {
        setPos((p) => ({ ...p, token: p.token + 1 }));   // was between clips: pick up again
      }
    },
    /**
     * The learner started talking: duck the professor, let the current
     * sentence finish (at most a few seconds), then pause and call onStopped.
     * Not speaking right now → pauses at once.
     */
    interrupt: (onStopped?: () => void) => {
      const audio = audioRef.current;
      if (statusRef.current === 'finishing') { holdRef.current = onStopped ?? holdRef.current; return; }
      if (statusRef.current !== 'playing' || !audio || audio.paused) {
        if (timerRef.current) clearTimeout(timerRef.current);
        pausedRef.current = true;
        audio?.pause();
        setStatus('paused');
        onStopped?.();
        return;
      }
      holdRef.current = onStopped ?? (() => {});
      replayRef.current = sentenceStart(textRef.current, audio.currentTime, audio.duration);
      audio.volume = DUCK_VOLUME;
      setStatus('finishing');
      const stopAt = sentenceEnd(textRef.current, audio.currentTime, audio.duration);
      finishTimerRef.current = setInterval(() => {
        if (audio.currentTime >= stopAt - 0.05) stopFinishing();
      }, 50);
    },
    restart: () => {
      setStatus('loading');
      setPos((p) => ({ slide: 0, clip: 0, mode: 'normal', token: p.token + 1 }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [goToSlide, pos.slide, topics, deck.slides.length, clampedClip]);

  return {
    slideIndex: Math.min(pos.slide, deck.slides.length - 1),
    clipIndex: pos.clip,
    clipCount: order.length,
    mode: pos.mode,
    topicIndex: topics[Math.min(pos.slide, deck.slides.length - 1)] ?? 0,
    topicCount: (topics[topics.length - 1] ?? 0) + 1,
    activeId: speaking ? current?.id ?? null : null,
    /** Words of the clip being spoken (for the transcript), and its audio for timing */
    captionText: speaking && current ? (pos.mode === 'plain' ? current.plain?.trim() || spokenText(current) : spokenText(current)) : '',
    getAudio,
    status,
    ...controls,
  };
}
