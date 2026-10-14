import { useRef, useState } from 'react';
import { learnerHeaders } from '@/lib/learnerSession';
import { voiced } from '@/lib/voiceSpeed';

async function fetchClip(text: string): Promise<Blob | null> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: learnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export function useSpeechQueue() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const clipsRef = useRef<Promise<Blob | null>[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const drainingRef = useRef(false);
  const cancelledRef = useRef(false);
  const streamingRef = useRef(false);
  // Bumped by every stop and every new answer: a playback loop from before it stops at once
  // (was: a stop paused the clip but the loop waited on it forever, and could carry on
  // playing the old answer's next sentence once a new answer had reset `cancelled`)
  const genRef = useRef(0);
  const endClipRef = useRef<(() => void) | null>(null);

  const beginStream = () => {
    // Clips queued after a stop (the old stream kept arriving) must not play before the new answer
    clipsRef.current = [];
    streamingRef.current = true;
    cancelledRef.current = false;
    genRef.current++;
    drainingRef.current = false;   // an old loop (if any) sees the new generation and ends itself
  };

  const endStream = () => {
    streamingRef.current = false;
    if (!cancelledRef.current) drain();   // in case the last clip arrived after the queue drained
  };
  
  const playBlob = (blob: Blob) =>
    new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = voiced(new Audio(url));
      audioRef.current = audio;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        if (endClipRef.current === done) endClipRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      endClipRef.current = done;   // a stop ends the wait too (a paused clip never fires "ended")
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });

  const drain = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const gen = genRef.current;
    const current = () => gen === genRef.current && !cancelledRef.current;
    setIsSpeaking(true);

    while ((clipsRef.current.length > 0 || streamingRef.current) && current()) {
      if (clipsRef.current.length === 0) {
        await new Promise((r) => setTimeout(r, 100));   // wait for the next sentence
        continue;
      }
      const blob = await clipsRef.current.shift()!;
      if (!current()) break;
      if (blob) await playBlob(blob);
    }

    // (a newer answer's loop owns these now)
    if (gen === genRef.current) {
      drainingRef.current = false;
      setIsSpeaking(false);
    }
  };

  // Kicks off generation immediately; playback stays in order
  const enqueue = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (cancelledRef.current) return;   // stopped: don't fetch speech nobody will hear
    clipsRef.current.push(fetchClip(trimmed));
    drain();
  };

  const stopSpeaking = () => {
    cancelledRef.current = true;
    genRef.current++;
    clipsRef.current = [];
    audioRef.current?.pause();
    audioRef.current = null;
    endClipRef.current?.();   // the loop waiting on that clip goes on (and ends)
    drainingRef.current = false;
    setIsSpeaking(false);
  };

  /** Let the sentence playing now finish, then stop (nothing after it is played). */
  const finishSentence = () => {
    cancelledRef.current = true;
    clipsRef.current = [];
  };

  return { enqueue, stopSpeaking, finishSentence, isSpeaking, beginStream, endStream };
}
