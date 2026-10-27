// Shared by the browser and the server (no imports: the results page and the editor's stats read it too).
/*
 * The confusion meter: one meter, read at three levels (the "Confusion Meter Plan" doc).
 *   point    a box on a slide (or the slide itself, when no box was playing): what's unclear right now
 *            (its "now" score holds 20 s, then fades by half every 30 s; its total doesn't fade)
 *   topic    how this part went: the worst box, a quarter of the rest, the section check and Finn's result
 *   overall  how the learner is doing in general: a moving average of the finished topics
 * Every learner action adds (or, for good signs, takes away) points at the box where it happened.
 * Each level reads as clear, unsure or confused, so the lesson asks simple questions ("is this topic
 * confused?") instead of adding up counters. Nothing here is shown to the learner: it only changes what
 * the lesson does, and it's logged for the study (confusion_level, confusion_topic events).
 * The weights and thresholds are a first guess, to be set from the pilot.
 */

export type ConfusionLevel = 'clear' | 'unsure' | 'confused';
export type Sureness = 'high' | 'medium' | 'low' | 'none';

type SignalDef = {
  points: number;
  sure: Sureness;
  /** Counted for the topic only (the section check, Finn's result), not at a box */
  topicOnly?: boolean;
  /** Disengagement, not confusion (counted apart: confusion and boredom need opposite fixes) */
  disengaged?: boolean;
};

export const SIGNALS = {
  lost: { points: 3, sure: 'high' },              // "I'm lost" (button, said, typed)
  simpler: { points: 2, sure: 'high' },           // "simpler please"
  again: { points: 1, sure: 'medium' },           // "explain that again" (could be a missed sentence)
  wrong_move: { points: 1, sure: 'high' },        // hands-on: a wrong move
  wrong_again: { points: 2, sure: 'high' },       // ...the same item wrong again
  stepped_in: { points: 1, sure: 'high' },        // hands-on: the professor explains an item
  hint: { points: 1, sure: 'high' },              // hands-on: stuck, the hand shows how again
  puzzled: { points: 1, sure: 'low' },            // a puzzled face on camera (held a few seconds)
  helper_watched: { points: 1, sure: 'medium' },  // "another way to see it": watched (8 s or to the end)
  helper_left: { points: 0, sure: 'none' },       // ...left within 8 s: just looking
  check_got: { points: -2, sure: 'high', topicOnly: true },   // "How did that section go?": Got it
  check_kind: { points: 2, sure: 'high', topicOnly: true },   // ...Kind of
  check_lost: { points: 4, sure: 'high', topicOnly: true },   // ...Lost me
  finn_fooled: { points: 2, sure: 'high', topicOnly: true },  // agreed with Finn's mix-up
  finn_unsure: { points: 1, sure: 'high', topicOnly: true },  // weren't sure
  finn_caught: { points: -2, sure: 'high', topicOnly: true }, // caught it
  solved: { points: -1, sure: 'high' },           // a hands-on box solved on the first try
  went_back: { points: 1, sure: 'low' },          // back a slide (could be curiosity)
  question: { points: 0, sure: 'none' },          // a question to the professor: curiosity, not confusion
  what_means: { points: 1, sure: 'medium' },      // ...except "what does X mean?"
  bored: { points: 0, sure: 'none', disengaged: true },   // a bored face
  skip: { points: 0, sure: 'none', disengaged: true },    // skipping ahead
} satisfies Record<string, SignalDef>;
export type ConfusionSignal = keyof typeof SIGNALS;
export const SIGNAL_NAMES = Object.keys(SIGNALS) as ConfusionSignal[];

export const POINT_MAX = 10;
export const TOPIC_MAX = 20;
export const NOW_HOLD_MS = 20_000;        // a box's "now" score holds this long (past the sentence it came during),
export const NOW_HALF_LIFE_MS = 30_000;   // then fades by half every 30 s (gone in about a minute)
export const SAME_WITHIN_MS = 10_000;     // the same action at the same box within 10 s counts once
export const OVERALL_WEIGHT = 0.5;        // the latest finished topic's weight in the overall average
// Where each level starts (unsure, confused)
// (overall: an average of topic scores, so the topic's scale; was [2, 4] in the plan: one "Lost me" made a whole lesson "confused")
export const THRESHOLDS = { point: [2, 4], topic: [3, 6], overall: [3, 6] } as const;

export function levelOf(score: number, kind: keyof typeof THRESHOLDS): ConfusionLevel {
  const [unsure, confused] = THRESHOLDS[kind];
  return score >= confused ? 'confused' : score >= unsure ? 'unsure' : 'clear';
}
export const LEVEL_RANK: Record<ConfusionLevel, number> = { clear: 0, unsure: 1, confused: 2 };
export const worse = (a: ConfusionLevel, b: ConfusionLevel) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);
export const atLeast = (l: ConfusionLevel, min: ConfusionLevel) => LEVEL_RANK[l] >= LEVEL_RANK[min];

/** Where something happened: the topic, the slide (its index in the lesson) and the box (its element id) */
export type Where = { topic: number; slide: number; box?: string | null };

type PointState = {
  topic: number;
  slide: number;
  box: string;               // '' = the slide itself
  now: number;               // fades (NOW_HALF_LIFE_MS)
  nowAt: number;             // when `now` was last worked out
  total: number;             // doesn't fade
  sure: boolean;             // some high- or medium-sureness evidence here (a camera guess alone never is)
  signals: Partial<Record<ConfusionSignal, number>>;
  last: Record<string, number>;   // when each action last counted here
};
type TopicExtra = { points: number; check?: ConfusionSignal; signals: Partial<Record<ConfusionSignal, number>>; last: Record<string, number> };

export type PointReading = { topic: number; slide: number; box: string; now: number; total: number; level: ConfusionLevel; sure: boolean; signals: Partial<Record<ConfusionSignal, number>> };
export type TopicReading = {
  topic: number;
  score: number;
  level: ConfusionLevel;
  /** The box with the highest total (where a classmate's question helps most), when one has any */
  hardest: PointReading | null;
  signals: Partial<Record<ConfusionSignal, number>>;
  disengaged: number;
};
export type OverallReading = { score: number; level: ConfusionLevel; topics: number };

/** What's kept with the lesson's progress (Continue where you left off) */
export type SavedMeter = {
  v: 1;
  points: [string, number, number, number, number, boolean, Partial<Record<ConfusionSignal, number>>][];   // key, topic, slide, total, now, sure, signals
  extra: [number, ConfusionSignal | null, Partial<Record<ConfusionSignal, number>>][];   // topic, the latest section check, signals
  ended: [number, number][];   // finished topics, in order: topic, score
};

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const keyOf = (w: Where) => `${w.slide}:${w.box ?? ''}`;

export class ConfusionMeter {
  private points = new Map<string, PointState>();
  private extra = new Map<number, TopicExtra>();
  private ended: [number, number][] = [];

  constructor(saved?: unknown) {
    if (saved) this.restore(saved);
  }

  /**
   * An action at a place. Returns whether it counted (the same action at the same box within
   * SAME_WITHIN_MS counts once) and the points it added.
   */
  record(signal: ConfusionSignal, where: Where, at = Date.now(), same = ''): { counted: boolean; points: number } {
    // (`same`: what makes two of these the same action, e.g. which hands-on item: wrong moves on two items both count)
    const once = same ? `${signal}|${same}` : signal;
    const def: SignalDef = SIGNALS[signal];
    if (!def) return { counted: false, points: 0 };
    if (def.topicOnly) {
      const t = this.extra.get(where.topic) ?? { points: 0, signals: {}, last: {} };
      if (at - (t.last[once] ?? -Infinity) < SAME_WITHIN_MS) return { counted: false, points: 0 };
      t.last[once] = at;
      t.signals[signal] = (t.signals[signal] ?? 0) + 1;
      // (asked again after coming back to the topic: the new answer replaces the old)
      if (signal.startsWith('check_')) t.check = signal;
      t.points = this.topicOnlyPoints(t.signals, t.check);
      this.extra.set(where.topic, t);
      return { counted: true, points: def.points };
    }
    const key = keyOf(where);
    const p = this.points.get(key) ?? { topic: where.topic, slide: where.slide, box: where.box ?? '', now: 0, nowAt: at, total: 0, sure: false, signals: {}, last: {} };
    if (at - (p.last[once] ?? -Infinity) < SAME_WITHIN_MS) return { counted: false, points: 0 };
    p.last[once] = at;
    p.signals[signal] = (p.signals[signal] ?? 0) + 1;
    p.now = clamp(this.faded(p, at) + def.points, 0, POINT_MAX);
    p.nowAt = at;
    p.total = clamp(p.total + def.points, 0, POINT_MAX);
    if (def.points > 0 && (def.sure === 'high' || def.sure === 'medium')) p.sure = true;
    this.points.set(key, p);
    return { counted: true, points: def.points };
  }

  /** The topic-only points: the latest section check counts (once), Finn's results add up */
  private topicOnlyPoints(s: Partial<Record<ConfusionSignal, number>>, check?: ConfusionSignal): number {
    let n = 0;
    for (const k of ['finn_fooled', 'finn_unsure', 'finn_caught'] as const) n += (s[k] ?? 0) * SIGNALS[k].points;
    return n + (check ? SIGNALS[check].points : 0);
  }

  private faded(p: PointState, at: number) {
    return p.now * Math.pow(0.5, Math.max(0, at - p.nowAt - NOW_HOLD_MS) / NOW_HALF_LIFE_MS);
  }

  private read(p: PointState, at: number): PointReading {
    const now = round(this.faded(p, at));
    // a camera guess (or going back) alone is never enough to act on: at most "unsure"
    let level = levelOf(now, 'point');
    if (!p.sure && level === 'confused') level = 'unsure';
    return { topic: p.topic, slide: p.slide, box: p.box, now, total: round(p.total), level, sure: p.sure, signals: { ...p.signals } };
  }

  /** One box (or the slide itself: no box) */
  point(where: Where, at = Date.now()): PointReading | null {
    const p = this.points.get(keyOf(where));
    return p ? this.read(p, at) : null;
  }

  /** Every box with something recorded, in a topic (or on one slide) */
  pointsOf(topic: number, at = Date.now(), slide?: number): PointReading[] {
    return [...this.points.values()].filter((p) => p.topic === topic && (slide === undefined || p.slide === slide)).map((p) => this.read(p, at));
  }

  /** The box that's most unclear right now (its "now" score), in a topic or on one slide */
  hotPoint(topic: number, at = Date.now(), slide?: number): PointReading | null {
    let best: PointReading | null = null;
    for (const r of this.pointsOf(topic, at, slide)) if (r.now > 0 && (!best || r.now > best.now)) best = r;
    return best;
  }

  /** How the topic is going (or went): the worst box's total, a quarter of the rest, and the topic-only signals */
  topic(topic: number, at = Date.now()): TopicReading {
    const pts = this.pointsOf(topic, at).sort((a, b) => b.total - a.total);
    const t = this.extra.get(topic);
    const rest = pts.slice(1).reduce((s, p) => s + p.total, 0);
    const score = round(clamp((pts[0]?.total ?? 0) + rest / 4 + (t?.points ?? 0), 0, TOPIC_MAX));
    const signals: Partial<Record<ConfusionSignal, number>> = { ...(t?.signals ?? {}) };
    let disengaged = 0;
    for (const p of this.points.values()) {
      if (p.topic !== topic) continue;
      for (const [k, n] of Object.entries(p.signals) as [ConfusionSignal, number][]) {
        signals[k] = (signals[k] ?? 0) + n;
        if ((SIGNALS[k] as SignalDef).disengaged) disengaged += n;
      }
    }
    return { topic, score, level: levelOf(score, 'topic'), hardest: pts[0] && pts[0].total > 0 ? pts[0] : null, signals, disengaged };
  }

  /** A topic is over: it joins the overall average (again: its score is updated where it was) */
  endTopic(topic: number, at = Date.now()): TopicReading {
    const r = this.topic(topic, at);
    const i = this.ended.findIndex(([t]) => t === topic);
    if (i >= 0) this.ended[i] = [topic, r.score];
    else this.ended.push([topic, r.score]);
    return r;
  }

  hasEnded(topic: number) {
    return this.ended.some(([t]) => t === topic);
  }

  /** How the learner is doing in general: a moving average of the finished topics, the latest counting most */
  overall(): OverallReading {
    let score: number | null = null;
    for (const [, s] of this.ended) score = score === null ? s : OVERALL_WEIGHT * s + (1 - OVERALL_WEIGHT) * score;
    const v = round(score ?? 0);
    return { score: v, level: levelOf(v, 'overall'), topics: this.ended.length };
  }

  /**
   * Right now, in this topic: the worse of the topic's level and its most unclear box's (the level logged
   * as it changes, for "minutes spent confused").
   */
  live(topic: number, at = Date.now()): ConfusionLevel {
    const hot = this.hotPoint(topic, at);
    return worse(this.topic(topic, at).level, hot?.level ?? 'clear');
  }

  /** The topics in the order they were finished, with their scores */
  endedTopics(): [number, number][] {
    return this.ended.map(([t, s]) => [t, s]);
  }

  reset() {
    this.points.clear();
    this.extra.clear();
    this.ended = [];
  }

  save(at = Date.now()): SavedMeter {
    return {
      v: 1,
      points: [...this.points.entries()].slice(-300).map(([k, p]) => [k, p.topic, p.slide, round(p.total), round(this.faded(p, at)), p.sure, p.signals]),
      extra: [...this.extra.entries()].slice(-100).map(([t, e]) => [t, e.check ?? null, e.signals]),
      ended: this.ended.slice(-100),
    };
  }

  /**
   * From what save() gave (checked: a broken or edited entry can't break the lesson). `fits`: whether a slide is
   * still in that topic (the lesson edited since: points saved for slides that moved are left out)
   */
  restore(saved: unknown, at = Date.now(), fits: (topic: number, slide: number) => boolean = () => true) {
    this.reset();
    const s = saved as Partial<SavedMeter> | null;
    if (!s || typeof s !== 'object' || s.v !== 1) return;
    const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : null);
    const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 10_000 ? (v as number) : null);
    const counts = (v: unknown): Partial<Record<ConfusionSignal, number>> => {
      const out: Partial<Record<ConfusionSignal, number>> = {};
      if (v && typeof v === 'object') for (const k of SIGNAL_NAMES) { const n = int((v as Record<string, unknown>)[k]); if (n) out[k] = n; }
      return out;
    };
    for (const e of Array.isArray(s.points) ? s.points.slice(-300) : []) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length > 120) continue;
      const topic = int(e[1]), slide = int(e[2]), total = num(e[3], 0, POINT_MAX), now = num(e[4], 0, POINT_MAX);
      if (topic === null || slide === null || total === null || now === null || !fits(topic, slide)) continue;
      const box = e[0].slice(e[0].indexOf(':') + 1);
      this.points.set(`${slide}:${box}`, { topic, slide, box, total, now, nowAt: at, sure: e[5] === true, signals: counts(e[6]), last: {} });
    }
    for (const e of Array.isArray(s.extra) ? s.extra.slice(-100) : []) {
      if (!Array.isArray(e)) continue;
      const topic = int(e[0]);
      if (topic === null) continue;
      const signals = counts(e[2]);
      const check = typeof e[1] === 'string' && e[1].startsWith('check_') && SIGNAL_NAMES.includes(e[1] as ConfusionSignal) ? e[1] as ConfusionSignal : undefined;
      this.extra.set(topic, { points: this.topicOnlyPoints(signals, check), check, signals, last: {} });
    }
    for (const e of Array.isArray(s.ended) ? s.ended.slice(-100) : []) {
      const topic = Array.isArray(e) ? int(e[0]) : null;
      const score = Array.isArray(e) ? num(e[1], 0, TOPIC_MAX) : null;
      if (topic !== null && score !== null && !this.ended.some(([t]) => t === topic)) this.ended.push([topic, score]);
    }
  }
}

/** A question to the professor: curiosity (0), unless it asks what something means, or says it's unclear (+1) */
export function questionSignal(text: string): ConfusionSignal {
  // (curly apostrophes, from a Mac's or a phone's keyboard, and "whats" typed without one)
  const t = text.trim().toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\bwhats\b/g, "what's");
  if (/\bwhat(?:'s| does| do| is| are)\b.{0,60}\bmean\b/.test(t) || /\bmeaning of\b/.test(t)) return 'what_means';
  // "what is a barbel?", "define invasive" (not "what's next?", "what is it?": nothing to define)
  const term = t.match(/^(?:what(?:'s| is| are)|define)\s+(?:a |an |the )?([\w-]+(?:\s[\w-]+)?)\s*\??$/)?.[1];
  if (term && !/^(?:it|this|that|they|them|these|those|he|she|next|up|going on|happening|left|that one|this one)$/.test(term)) return 'what_means';
  if (/\b(?:i (?:don't|do not|didn't|did not) (?:get|understand)|confus\w*|makes? no sense|i'?m not sure (?:what|why|how)|i'?m lost)\b/.test(t)) return 'what_means';
  return 'question';
}

/** For a topic's snapshot (the confusion_topic event): its boxes with points, the most first, a few at most */
export function snapshotPoints(r: PointReading[], slideIds: (slide: number) => string | undefined, max = 24) {
  return r.filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, max)
    .map((p) => ({ slide: slideIds(p.slide) ?? String(p.slide), box: p.box || null, total: p.total }));
}
