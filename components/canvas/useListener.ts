'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { MicLevel } from '@/components/hooks/useVoiceInput';

/*
 * The canvas page's microphone: barge-in detection and recording on ONE open
 * stream, with echo cancellation (so the professor's voice isn't recorded).
 *
 * Why not the shared useVoiceInput: it detects speech on one stream, then
 * opens a second one to record. Everything said while it decides and while
 * the new mic opens is lost, so the first words got cut off. Here the last
 * PREROLL seconds of sound are always kept, and when speech starts they
 * become the start of the recording.
 *
 * Levels adapt to the room: speech must stand out from the learned
 * background; the end of the turn is quiet relative to that background too.
 */

const PREROLL_S = 0.8;          // kept from before speech was recognised
const ONSET_MS = 220;           // this much speech (short gaps allowed) starts a turn
const GAP_MS = 200;
const END_SILENCE_MS = 1100;    // quiet this long after speaking ends the turn
const MAX_TURN_MS = 15000;
const NO_SPEECH_MS = 6000;      // Talk pressed, nothing said: give up
const MIN_LEVEL = 0.012;        // never trigger below this RMS
const TRIGGER_MULT = 2.5;       // speech: this many times the background
const SUSTAIN_MULT = 1.6;       // still speaking (lower, so soft word endings aren't cut)
const OUT_RATE = 16000;         // what's sent to speech-to-text

const NOISE = /^(?:thank you|thanks|thanks for watching|thank you for watching|you|bye|okay|ok|hmm+|uh+|um+|so|yeah|oh|ah|music|\[.*\]|\(.*\))[.!?]*$/i;

export type ListenStatus = 'off' | 'idle' | 'listening' | 'processing';

function encodeWav(chunks: Float32Array[], inRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const ratio = inRate / OUT_RATE;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  // Average-downsample to 16 kHz
  let ci = 0, off = 0;
  const at = (i: number) => {
    while (ci < chunks.length && i - off >= chunks[ci].length) { off += chunks[ci].length; ci++; }
    return ci < chunks.length ? chunks[ci][i - off] : 0;
  };
  for (let o = 0; o < outLen; o++) {
    const start = Math.floor(o * ratio), end = Math.floor((o + 1) * ratio);
    let sum = 0;
    for (let i = start; i < end; i++) sum += at(i);
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[o] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (p: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, OUT_RATE, true); dv.setUint32(28, OUT_RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * armed: keep the mic open and watch for speech (interruptions on).
 * bargeActive: speech right now starts a turn (the professor is talking).
 * Talk (talk()) starts a turn straight away, armed or not.
 */
export function useListener({
  armed,
  bargeActive,
  onTranscript,
  onListenStart,
}: {
  armed: boolean;
  bargeActive: boolean;
  onTranscript: (text: string) => void;
  onListenStart?: () => void;
}) {
  const [status, setStatus] = useState<ListenStatus>('off');
  const [manual, setManual] = useState(false);   // Talk pressed: mic open even when not armed
  const levelRef = useRef<MicLevel>({ level: 0, threshold: MIN_LEVEL });

  // Latest values for the audio callback
  const live = useRef({ bargeActive, onTranscript, onListenStart });
  live.current = { bargeActive, onTranscript, onListenStart };
  const turnRef = useRef<{ chunks: Float32Array[]; startedAt: number; lastVoice: number; spoke: boolean; manual: boolean; stop?: boolean } | null>(null);
  const manualRequest = useRef(false);

  const open = armed || manual;

  useEffect(() => {
    if (!open) { setStatus('off'); return; }
    let stopped = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let proc: ScriptProcessorNode | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AudioCtx();
        if (ctx.state === 'suspended') await ctx.resume();
        const rate = ctx.sampleRate;
        const source = ctx.createMediaStreamSource(stream);
        proc = ctx.createScriptProcessor(2048, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;   // the processor must be connected to run; nothing is played back
        source.connect(proc);
        proc.connect(mute);
        mute.connect(ctx.destination);

        const ring: Float32Array[] = [];
        let ringLen = 0;
        let floor = -1;
        let onsetAt: number | null = null;
        let lastVoiced = 0;
        setStatus('idle');

        const finish = async (turn: NonNullable<typeof turnRef.current>) => {
          turnRef.current = null;
          if (!turn.spoke) { setStatus('idle'); live.current.onTranscript(''); return; }
          setStatus('processing');
          try {
            const form = new FormData();
            form.append('file', encodeWav(turn.chunks, rate), 'speech.wav');
            const res = await fetch('/api/transcribe', { method: 'POST', body: form });
            const data = await res.json();
            const text = String(data.text ?? '').trim();
            live.current.onTranscript(text.length > 2 && !NOISE.test(text) ? text : '');
          } catch {
            live.current.onTranscript('');
          } finally {
            if (!stopped) setStatus('idle');
          }
        };

        const beginTurn = (isManual: boolean, now: number) => {
          turnRef.current = { chunks: [...ring], startedAt: now, lastVoice: now, spoke: !isManual, manual: isManual };
          ring.length = 0;
          ringLen = 0;
          setStatus('listening');
          live.current.onListenStart?.();
        };

        proc.onaudioprocess = (ev) => {
          if (stopped) return;
          const input = new Float32Array(ev.inputBuffer.getChannelData(0));
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          const now = performance.now();
          if (floor < 0) floor = rms;
          const trigger = Math.max(MIN_LEVEL, floor * TRIGGER_MULT);
          const sustain = Math.max(MIN_LEVEL * 0.6, floor * SUSTAIN_MULT);
          levelRef.current = { level: rms, threshold: trigger };

          const turn = turnRef.current;
          if (turn) {
            turn.chunks.push(input);
            if (rms > sustain) { turn.lastVoice = now; turn.spoke = true; }
            const quiet = now - turn.lastVoice;
            if (turn.stop || (turn.spoke && quiet > END_SILENCE_MS) || now - turn.startedAt > MAX_TURN_MS ||
                (!turn.spoke && now - turn.startedAt > NO_SPEECH_MS)) {
              finish(turn);
            }
            return;
          }

          // Not in a turn: keep the pre-roll and watch for speech
          ring.push(input);
          ringLen += input.length;
          while (ringLen - ring[0].length > PREROLL_S * rate) ringLen -= ring.shift()!.length;

          if (manualRequest.current) {
            manualRequest.current = false;
            beginTurn(true, now);
            return;
          }
          if (rms > trigger) {
            if (onsetAt === null) onsetAt = now;
            lastVoiced = now;
            if (now - onsetAt >= ONSET_MS && live.current.bargeActive) {
              onsetAt = null;
              beginTurn(false, now);
            }
          } else {
            if (onsetAt !== null && now - lastVoiced > GAP_MS) onsetAt = null;
            // only quiet moments teach the background, capped so noise can't make it deaf
            floor = Math.min(0.03, floor * 0.95 + rms * 0.05);
          }
        };
      } catch (e) {
        console.warn('Microphone unavailable:', e);
        setStatus('off');
        setManual(false);
      }
    })();

    return () => {
      stopped = true;
      turnRef.current = null;
      if (proc) proc.onaudioprocess = null;
      ctx?.close().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  // A manual turn is over: close the mic again unless interruptions keep it open
  useEffect(() => {
    if (manual && status === 'idle' && !turnRef.current && !manualRequest.current) setManual(false);
  }, [manual, status]);

  /** Start a turn now (the Talk button). */
  const talk = useCallback(() => {
    if (turnRef.current) {   // already listening: stop and send what we have
      turnRef.current.stop = true;
      return;
    }
    manualRequest.current = true;
    setManual(true);
  }, []);

  return { status, talk, levelRef: levelRef as MutableRefObject<MicLevel> };
}
