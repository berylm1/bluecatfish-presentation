'use client';

import { useCallback, useEffect, useRef } from 'react';
import { CUE_TEXT, type CueKey } from '@/lib/canvas/cues';

async function liveUrl(text: string): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    return res.ok ? URL.createObjectURL(await res.blob()) : null;
  } catch {
    return null;
  }
}

/**
 * Plays the page's own short lines (command replies, cues) on their own audio
 * element. play() resolves when the line is over, or at once if it can't play;
 * a newer play() or stop() cuts the old one off (its promise still resolves,
 * with false, so callers can tell).
 */
export function useCues(enabled: boolean) {
  const urls = useRef<Record<string, string>>({});
  const live = useRef(new Map<string, Promise<string | null>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const seq = useRef(0);
  const finish = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/cues').then((r) => r.json()).then((d) => { urls.current = d.urls ?? {}; }).catch(() => {});
  }, [enabled]);

  const stop = useCallback(() => {
    seq.current++;
    audio.current?.pause();
    audio.current = null;
    finish.current?.(false);
    finish.current = null;
  }, []);

  /** Plays a cue by key, or any text (spoken live, cached per text). */
  const play = useCallback((what: CueKey | { text: string; url?: string | null }): Promise<boolean> => {
    stop();
    const my = ++seq.current;
    const text = typeof what === 'string' ? CUE_TEXT[what] : what.text;
    const known = typeof what === 'string' ? urls.current[what] : what.url ?? undefined;
    let source: Promise<string | null>;
    if (known) source = Promise.resolve(known);
    else {
      if (!live.current.has(text)) live.current.set(text, liveUrl(text));
      source = live.current.get(text)!;
    }
    return new Promise<boolean>((resolve) => {
      finish.current = resolve;
      source.then((url) => {
        if (my !== seq.current) return;
        if (!url) { finish.current = null; resolve(true); return; }
        const a = new Audio(url);
        audio.current = a;
        const done = () => { if (my === seq.current) { finish.current = null; audio.current = null; resolve(true); } };
        a.onended = done;
        a.onerror = done;
        a.play().catch(done);
      });
    });
  }, [stop]);

  return { play, stop };
}
