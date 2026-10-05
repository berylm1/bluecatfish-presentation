/*
 * Camera calibration: what THIS learner normally looks like, so the camera
 * compares them to themselves instead of to fixed numbers. Someone whose
 * resting face is a bit frowny isn't "puzzled" all lesson, someone with a
 * calm face isn't "gone quiet" all lesson, and someone sitting close or far
 * gets a hand-raise and presence check that fit where they sit.
 *
 *   warm-up  the first ~10 s of the camera seeing a face (the hello plays
 *            then): the middle of the readings is their normal, and how much
 *            they wobble is their normal noise
 *   drift    afterwards the normal follows slow changes (posture, light)
 *            over a couple of minutes, but not while a reaction is going on
 *
 * Only a few numbers, kept in memory on this page; nothing is saved or sent.
 * Starts over each time the camera is turned on (lib/sharedCamera.ts).
 */

export const WARMUP_MS = 10000;
const MIN_READINGS = 30;
const DRIFT = 1 / 1500;   // per reading (~10 a second): follows a slow change in ~2–3 minutes
const MAX_SAMPLES = 300;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One number's normal: learnt from the warm-up (median, spread), then drifting slowly. */
export class Channel {
  private samples: number[] = [];
  private since: number | null = null;
  mean = 0;
  dev = 0;
  ready = false;

  add(v: number, now: number, hold = false) {
    if (!Number.isFinite(v)) return;
    if (!this.ready) {
      this.since ??= now;
      if (this.samples.length < MAX_SAMPLES) this.samples.push(v);
      if (now - this.since >= WARMUP_MS && this.samples.length >= MIN_READINGS) {
        // median and median distance: a smile or a sneeze during the warm-up doesn't count as normal
        this.mean = median(this.samples);
        this.dev = median(this.samples.map((x) => Math.abs(x - this.mean))) * 1.4826;
        this.samples = [];
        this.ready = true;
      }
      return;
    }
    if (hold) return;   // a reaction going on: don't learn it as the new normal
    this.mean += DRIFT * (v - this.mean);
    this.dev += DRIFT * (Math.abs(v - this.mean) * 1.2533 - this.dev);
  }

  reset() { this.samples = []; this.since = null; this.mean = 0; this.dev = 0; this.ready = false; }
}

export type FaceBox = { x: number; y: number; w: number; h: number };   // shares of the picture (0–1), y down

export class LearnerBaseline {
  /** The expression watcher's "puzzle" score (brow knit, no smile) */
  confusion = new Channel();
  /** How expressive the face is (the strongest expression channel) */
  expressive = new Channel();
  /** How wide their face is in the picture (how close they sit) */
  faceWidth = new Channel();
  private face: { box: FaceBox; at: number } | null = null;

  reset() {
    this.confusion.reset();
    this.expressive.reset();
    this.faceWidth.reset();
    this.face = null;
  }

  /** Still learning their face (for the camera bubble). */
  get learning() { return !this.confusion.ready; }

  /** Puzzled? Before calibration, the old fixed rule; after, clearly above their own normal. */
  isConfused(score: number): boolean {
    const c = this.confusion;
    return c.ready ? score > c.mean + Math.max(0.18, 3 * c.dev) : score > 0.28;
  }

  /** A flat face? Before calibration, the old fixed rule; after, well below their own normal liveliness. */
  isFlat(expressive: number): boolean {
    const e = this.expressive;
    return e.ready ? expressive < Math.min(0.18, Math.max(0.03, e.mean * 0.55)) : expressive < 0.12;
  }

  /** The smallest face that counts as the learner (not someone far behind them). */
  minFaceWidth(): number {
    const f = this.faceWidth;
    return f.ready ? Math.min(0.12, Math.max(0.04, f.mean * 0.5)) : 0.08;
  }

  seeFace(box: FaceBox, now: number) {
    this.face = { box, at: now };
    this.faceWidth.add(box.w, now);
  }

  /** Where their face is right now (for the hand-raise check), if seen in the last second. */
  faceNow(now: number): FaceBox | null {
    return this.face && now - this.face.at < 1000 ? this.face.box : null;
  }
}

/** The learner at this screen (one per page). */
export const learner = new LearnerBaseline();
