'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CUE_TEXT, type CueKey } from '@/lib/canvas/cues';
import { learnerHeaders } from '@/lib/learnerSession';

/** A live clip: its URL and where the sound starts and ends (the silence around it is skipped). */
type Live = { url: string; start: number; end: number | null };

/**
 * Where the voice starts and stops in a clip, so a live line (one with the
 * learner's name in it, Finn's question) plays with no blank before or after.
 * null when it can't be measured: then the whole clip plays.
 */
async function soundBounds(blob: Blob): Promise<{ start: number; end: number } | null> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);   // decodes without needing a click first
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const loud = 0.015;
    let first = 0;
    while (first < data.length && Math.abs(data[first]) < loud) first++;
    let last = data.length - 1;
    while (last > first && Math.abs(data[last]) < loud) last--;
    if (first >= last) return null;
    // a breath of margin, so no word is clipped
    return { start: Math.max(0, first / buf.sampleRate - 0.04), end: Math.min(buf.duration, last / buf.sampleRate + 0.12) };
  } catch {
    return null;
  }
}

async function liveClip(text: string, who?: 'classmate'): Promise<Live | null> {
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ text, who }) });
    if (!res.ok) return null;
    const blob = await res.blob();
    const b = await soundBounds(blob);
    return { url: URL.createObjectURL(blob), start: b?.start ?? 0, end: b?.end ?? null };
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
  const live = useRef(new Map<string, Promise<Live | null>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const seq = useRef(0);
  const finish = useRef<((ok: boolean) => void) | null>(null);
  const [saying, setSaying] = useState('');   // the line being said, for the transcript

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/cues', { headers: learnerHeaders() }).then((r) => r.json()).then((d) => { urls.current = d.urls ?? {}; }).catch(() => {});
  }, [enabled]);

  const stop = useCallback(() => {
    seq.current++;
    audio.current?.pause();
    audio.current = null;
    finish.current?.(false);
    finish.current = null;
    setSaying('');
  }, []);

  /** Starts making a live line now (e.g. while something else is said), so play() can start it at once. */
  const livePromise = useCallback((text: string, who?: 'classmate') => {
    const key = `${who ?? ''}|${text}`;
    if (!live.current.has(key)) {
      const made = liveClip(text, who);
      live.current.set(key, made);
      made.then((clip) => { if (!clip && live.current.get(key) === made) live.current.delete(key); });   // failed: try again next time
    }
    return live.current.get(key)!;
  }, []);
  const preload = useCallback((text: string, who?: 'classmate') => { void livePromise(text, who); }, [livePromise]);

  /** Plays a cue by key, or any text (spoken live, cached per text). */
  /** who: 'classmate' = Finn's voice instead of the professor's */
  const play = useCallback((what: CueKey | { text: string; url?: string | null; who?: 'classmate' }): Promise<boolean> => {
    stop();
    const my = ++seq.current;
    const text = typeof what === 'string' ? CUE_TEXT[what] : what.text;
    const known = typeof what === 'string' ? urls.current[what] : what.url ?? undefined;
    const source: Promise<Live | null> = known
      ? Promise.resolve({ url: known, start: 0, end: null })
      : livePromise(text, typeof what === 'string' ? undefined : what.who);
    setSaying(text);
    return new Promise<boolean>((resolve) => {
      finish.current = (ok) => { setSaying(''); resolve(ok); };
      source.then((clip) => {
        if (my !== seq.current) return;
        if (!clip) { finish.current = null; setSaying(''); resolve(true); return; }
        const a = new Audio(clip.url);
        audio.current = a;
        let watch = 0;
        const done = () => {
          cancelAnimationFrame(watch);
          if (my === seq.current) { a.pause(); finish.current = null; audio.current = null; setSaying(''); resolve(true); }
        };
        a.onended = done;
        a.onerror = done;
        // Skip the silence at the end too: the line is over when the voice is
        const end = clip.end;
        if (end !== null) {
          const check = () => { if (my !== seq.current) return; if (a.currentTime >= end) done(); else watch = requestAnimationFrame(check); };
          a.onplaying = () => { cancelAnimationFrame(watch); watch = requestAnimationFrame(check); };
        }
        if (clip.start > 0) a.currentTime = clip.start;
        a.play().catch(done);
      });
    });
  }, [stop]);

  /** The audio element of the line being said (for the laser on a helper), or null. */
  const getAudio = useCallback(() => audio.current, []);

  return { play, stop, saying, preload, getAudio };
}
