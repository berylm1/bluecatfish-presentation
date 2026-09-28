'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Deck, SlideElement } from '@/lib/canvas/types';
import { speakingOrder, spokenText, topicIndexes } from '@/lib/canvas/queue';
import { currentAudio } from '@/lib/canvas/aiFields';

const AFTER_SLIDE_MS = 1500;    // pause after a slide's last clip before moving on
const SILENT_SLIDE_MS = 5000;   // a slide with nothing to say stays up this long

export type PlayerStatus = 'loading' | 'playing' | 'paused' | 'waiting' | 'finished';

type Pos = {
  slide: number;
  clip: number;               // index into the slide's speaking order
  mode: 'normal' | 'plain';   // plain = the "simpler please" version of this clip
  token: number;              // bumped to (re)start playback at this position
};

// Clips without a pre-made file are spoken live through /api/tts and cached per text
async function liveClip(text: string, simple: boolean): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
export function useDeckPlayer(deck: Deck, started: boolean) {
  const [pos, setPos] = useState<Pos>({ slide: 0, clip: 0, mode: 'normal', token: 0 });
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const statusRef = useRef(status);
  statusRef.current = status;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef(new Map<string, Promise<string | null>>());

  const orders = useMemo(() => deck.slides.map(speakingOrder), [deck]);
  const topics = useMemo(() => topicIndexes(deck.slides), [deck]);
  const order = orders[pos.slide] ?? [];
  const current: SlideElement | null = order[Math.min(pos.clip, order.length - 1)] ?? null;
  const speaking = status === 'playing' || status === 'loading' || status === 'paused';

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
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
    };

    if (pos.clip >= order.length) {
      setStatus('waiting');
      timerRef.current = setTimeout(() => goToSlide(pos.slide + 1), order.length ? AFTER_SLIDE_MS : SILENT_SLIDE_MS);
      return () => { cancelled = true; clear(); };
    }

    const el = order[pos.clip];
    setStatus('loading');
    clipUrl(el, pos.mode).then((url) => {
      if (cancelled) return;
      const next = () => {
        if (cancelled) return;
        // After a plain version, carry on with the slide's next clip
        setPos((p) => ({ ...p, clip: p.clip + 1, mode: 'normal' }));
      };
      if (!url) { next(); return; }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = next;
      audio.onerror = next;
      audio.play().then(() => { if (!cancelled) setStatus('playing'); }).catch(next);
      // Get the following clip ready while this one plays
      const following = order[pos.clip + 1] ?? orders[pos.slide + 1]?.[0];
      if (following) clipUrl(following, 'normal');
    });
    return () => { cancelled = true; clear(); };
    // pos.token restarts the same position (repeat, simpler, resume after a pause)
  }, [started, pos, order, orders, clipUrl, goToSlide, deck.slides.length]);

  // The end: say the recap once
  useEffect(() => {
    if (status !== 'finished' || !deck.recap) return;
    let audio: HTMLAudioElement | null = null;
    liveClip(deck.recap, false).then((url) => {
      if (!url) return;
      audio = new Audio(url);
      audio.play().catch(() => {});
    });
    return () => audio?.pause();
  }, [status, deck.recap]);

  const clampedClip = Math.max(0, Math.min(pos.clip, order.length - 1));

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
      if (timerRef.current) clearTimeout(timerRef.current);
      audioRef.current?.pause();
      setStatus('paused');
    },
    resume: () => {
      if (statusRef.current !== 'paused') return;
      if (audioRef.current && audioRef.current.paused && !audioRef.current.ended) {
        audioRef.current.play().then(() => setStatus('playing')).catch(() => {});
      } else {
        setPos((p) => ({ ...p, token: p.token + 1 }));   // was between clips: pick up again
      }
    },
    restart: () => {
      setStatus('loading');
      setPos((p) => ({ slide: 0, clip: 0, mode: 'normal', token: p.token + 1 }));
    },
  }), [goToSlide, pos.slide, topics, deck.slides.length, clampedClip]);

  return {
    slideIndex: Math.min(pos.slide, deck.slides.length - 1),
    clipIndex: pos.clip,
    clipCount: order.length,
    mode: pos.mode,
    topicIndex: topics[Math.min(pos.slide, deck.slides.length - 1)] ?? 0,
    topicCount: (topics[topics.length - 1] ?? 0) + 1,
    activeId: speaking ? current?.id ?? null : null,
    status,
    ...controls,
  };
}
