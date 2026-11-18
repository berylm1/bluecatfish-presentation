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

// One voice at a time. Every voice in the lesson (the professor's clips, answers, cues, the classmates) is made
// with voiced(), so this is the one place they meet: a clip asked to play while another is still talking waits
// for it to stop (ended or paused), then plays. (was: nothing stopped two from playing over each other, e.g. a
// reply still being said as the next part began after a skip)
const talking = new Set<HTMLAudioElement>();
const MAX_WAIT_MS = 20000;   // a clip stuck loading can't hold the others up for ever
const never = new Promise<void>(() => {});
// Told whenever a voice stops talking (not left to the audio's own events: one paused before it began, or whose
// play() was refused, fires none, and the next voice would wait out the whole MAX_WAIT_MS)
const waiting = new Set<() => void>();
function leave(a: HTMLAudioElement): void {
  if (!talking.delete(a)) return;
  for (const go of [...waiting]) go();
}

/** Plays this clip at the chosen speed (and keeps it there if the speed changes mid-clip), after any voice still talking. */
export function voiced(a: HTMLAudioElement): HTMLAudioElement {
  a.preservesPitch = true;
  a.playbackRate = speed;
  // the browser resets the rate when a new source loads
  a.defaultPlaybackRate = speed;
  a.addEventListener('play', () => { a.playbackRate = speed; playing.add(a); });
  for (const ev of ['pause', 'ended', 'error', 'emptied']) a.addEventListener(ev, () => { playing.delete(a); leave(a); });
  const play = a.play.bind(a);
  const pause = a.pause.bind(a);
  let asked = 0;
  a.play = async () => {
    const my = ++asked;
    const until = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const others = [...talking].filter((o) => o !== a);
      if (!others.length || Date.now() >= until) break;
      await new Promise<void>((resolve) => {
        const go = () => { waiting.delete(go); clearTimeout(timer); resolve(); };
        const timer = setTimeout(go, Math.max(0, until - Date.now()));
        waiting.add(go);
      });
      // paused (or asked again) while it waited: this play is withdrawn (it never settles, like a clip that never started)
      if (my !== asked) return never;
    }
    talking.add(a);
    return play().catch((e) => { leave(a); throw e; });
  };
  a.pause = () => { asked++; leave(a); pause(); };
  return a;
}

export const voiceSpeedNow = (): VoiceSpeed => speed;
