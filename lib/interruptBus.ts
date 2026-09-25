/**
 * Interrupt bus — sentence-boundary interruption.
 *
 * When the learner speaks over the professor, we don't cut the audio
 * mid-sentence (that felt like a machine getting cut off). Instead the
 * deck ducks the volume and lets the current sentence finish; when the
 * clip ends, the bus releases and the page attends to the learner.
 *
 * One holder at a time — barge-in is the only producer today.
 */
type Release = () => void;

let held = false;
let release: Release | null = null;

export const interruptBus = {
  /** Called the moment a learner interruption is detected. */
  hold(): void {
    held = true;
  },

  /** True while a sentence is finishing out. */
  isHeld(): boolean {
    return held;
  },

  /** Page registers what "attend to the learner" means (stop audio, mic, ...). */
  onRelease(fn: Release): void {
    release = fn;
  },

  /** Fired when the finishing sentence ends — hands control to the page. */
  release(): void {
    held = false;
    const r = release;
    release = null;
    r?.();
  },
};
