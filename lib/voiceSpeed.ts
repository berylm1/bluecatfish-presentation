// How fast the voices talk (Options → Voice speed): slower, normal or faster.
// One setting for every voice in the lesson (the professor's clips, answers,
// helpers, Finn), remembered on this browser. Clips change speed as they play;
// the pitch stays the same.

export const VOICE_SPEEDS = [0.85, 1, 1.15] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];
const KEY = 'voiceSpeed';

let speed: VoiceSpeed = 1;
const playing = new Set<HTMLAudioElement>();

export function loadVoiceSpeed(): VoiceSpeed {
  try {
    const v = Number(localStorage.getItem(KEY));
    if ((VOICE_SPEEDS as readonly number[]).includes(v)) speed = v as VoiceSpeed;
  } catch { /* private mode */ }
  return speed;
}

export function setVoiceSpeed(v: VoiceSpeed): void {
  speed = v;
  try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ }
  for (const a of playing) a.playbackRate = v;
}

/** Plays this clip at the chosen speed (and keeps it there if the speed changes mid-clip). */
export function voiced(a: HTMLAudioElement): HTMLAudioElement {
  a.preservesPitch = true;
  a.playbackRate = speed;
  // the browser resets the rate when a new source loads
  a.defaultPlaybackRate = speed;
  a.addEventListener('play', () => { a.playbackRate = speed; playing.add(a); });
  for (const ev of ['pause', 'ended', 'error', 'emptied']) a.addEventListener(ev, () => playing.delete(a));
  return a;
}

export const voiceSpeedNow = (): VoiceSpeed => speed;
