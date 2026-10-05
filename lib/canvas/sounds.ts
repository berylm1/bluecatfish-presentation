/*
 * Little sounds for the hands-on boxes: a pop for a right move, a soft bonk
 * for a wrong one, a chime when it's all done, a tick when a slider reaches a
 * new stop. Made on the fly with Web Audio (no files to load), quiet, and
 * only ever after a tap or drag (so the browser allows them). The lesson page
 * has a switch to turn them off.
 */

export type HandsOnSound = 'good' | 'bad' | 'done' | 'tick';

const VOLUME = 0.12;
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One tone: from `f0` to `f1` Hz over `ms`, starting `at` seconds from now, fading out. */
function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, ms: number, at = 0, vol = VOLUME) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

export function playSound(kind: HandsOnSound): void {
  const c = audio();
  if (!c) return;
  switch (kind) {
    case 'good': tone(c, 'sine', 620, 980, 110); break;                       // pop
    case 'bad': tone(c, 'triangle', 220, 140, 180, 0, VOLUME * 0.9); break;   // soft bonk
    case 'tick': tone(c, 'sine', 1200, 1100, 45, 0, VOLUME * 0.5); break;
    case 'done':                                                               // a little rising chime
      [523, 659, 784, 1047].forEach((f, i) => tone(c, 'sine', f, f, i === 3 ? 520 : 220, i * 0.09));
      break;
  }
}
