// The canvas slide format — used by hand-made decks (the editor) and AI decks alike.
// Positions and sizes are percent of the slide (0–100), so a slide looks the
// same at any screen size. See docs/customization-plan.md.

export type TextStyle = 'title' | 'body' | 'caption' | 'bigNumber';

/**
 * A laser-pointer mark: when the professor says `word` (a phrase from the
 * element's spoken words), a red dot points at (x, y). For an image, x/y are
 * % of the picture itself (so the mark stays on the whiskers however the box
 * is sized); for text, % of the box.
 */
export interface Pointer { x: number; y: number; word: string }

interface ElementBase {
  id: string;
  x: number;          // left edge, % of slide width
  y: number;          // top edge, % of slide height
  w: number;          // width, % of slide width
  h: number;          // height, % of slide height
  z?: number;         // stacking; higher is in front

  /** Doesn't speak (titles, labels, decorative images). */
  silent?: boolean;
  /** Speaking order: numbered elements first, then reading order. */
  queue?: number;
  /** What the professor says for this element. Separate from what's shown. */
  say?: string;
  sayByAI?: boolean;
  /** Plain version, played for "simpler please" / "you lost me". */
  plain?: string;
  plainByAI?: boolean;
  /** Pre-made clips (made when the slide is saved). Missing → spoken live. */
  audioUrl?: string;
  plainAudioUrl?: string;
  // Fingerprints of what the AI-made fields were made from (lib/canvas/aiFields.ts)
  sayFrom?: string;
  plainFrom?: string;
  audioFor?: string;
  plainAudioFor?: string;
  /** Laser-pointer marks (up to 3). An empty list = a person chose none. */
  pointers?: Pointer[];
  pointersByAI?: boolean;
  pointersFrom?: string;   // fingerprint of the picture + spoken words they were placed for
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  style: TextStyle;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
  /** Description: shown to screen readers and used to write the spoken words. */
  alt?: string;
  fit?: 'cover' | 'contain';
  /** A short caption under the picture ("A blue catfish caught in the James River") */
  caption?: string;
  captionByAI?: boolean;
  captionFrom?: string;   // fingerprint of the description it was written from
  /** "No caption": the AI won't write one */
  captionOff?: boolean;
}

/**
 * A chart (the professor's "drawn" answers, and slides): bars (how big, how
 * many), a line (a change over time: label = when) or a pie (parts of a whole).
 */
export interface ChartElement extends ElementBase {
  type: 'chart';
  /** Not set = bars */
  kind?: 'bar' | 'line' | 'pie';
  bars: { label: string; value: number; color?: string }[];
  /** Shown after each value ("lbs", "%") */
  unit?: string;
  /** What the chart shows, in words (screen readers; the spoken words are written from it) */
  alt?: string;
}

/**
 * A drawn diagram made of short labelled items:
 *   steps     boxes joined by arrows (how something happens)
 *   cycle     items round a circle (a life cycle, what eats what in a loop)
 *   timeline  a line with dated events (label = when, detail = what)
 *   compare   a two-column table (columns = the headers; label | detail per row)
 *   sizes     circles sized by value (how big next to something familiar)
 */
export interface DiagramElement extends ElementBase {
  type: 'diagram';
  kind: 'steps' | 'cycle' | 'timeline' | 'compare' | 'sizes';
  items: { label: string; detail?: string; value?: number; color?: string }[];
  columns?: [string, string];
  unit?: string;
  alt?: string;
}

/**
 * A hands-on box: the learner does something with what the slide teaches.
 * The professor explains what to do (its "say"), the lesson waits until it's
 * done (or skipped), and a hint (a pointing hand, a pulse) shows how.
 *   sort      drag each item into its group (items[].group = index into groups)
 *   order     tap the steps in the right order (items listed in the right order)
 *   cards     tap cards to flip them (text on the front, back on the back): guess, then check
 *   hotspots  tap the spots on a picture (src) to find out (label, back; x, y = % of the picture)
 *   slider    drag a slider and watch what changes (slider.stops; the picture grows with scale)
 */
export interface ActivityElement extends ElementBase {
  type: 'activity';
  kind: 'sort' | 'order' | 'cards' | 'hotspots' | 'slider';
  /** What to do, shown at the top of the box ("Drag each fish to where it came from") */
  prompt?: string;
  groups?: string[];
  items?: { text: string; back?: string; group?: number; x?: number; y?: number }[];
  src?: string;
  slider?: { label: string; min: number; max: number; step?: number; unit?: string; stops: { at: number; text: string; scale?: number }[] };
  alt?: string;
}

export type SlideElement = TextElement | ImageElement | ChartElement | DiagramElement | ActivityElement;

/**
 * The slide's helper: another version of it, shown when the learner is lost.
 * The slide morphs into it (and back): a helper element with the same id as
 * an element on the slide morphs from that element; new ids fade in.
 */
export interface SlideHelper {
  elements: SlideElement[];
  /** Drafted by the AI on save and not edited since (a person's edits are never overwritten). */
  byAI?: boolean;
  /** Fingerprint of the slide it was drafted from: when the slide changes, an AI draft is redone. */
  from?: string;
  /** "No helper for this slide": the AI won't draft one. */
  off?: boolean;
}

/**
 * A topic's introduction: what the professor says before the first slide of a
 * topic ("Next, let's look at…"), with a small title card on screen.
 */
export interface SlideIntro {
  say?: string;
  sayByAI?: boolean;
  sayFrom?: string;    // fingerprint of the topic it was written for
  audioUrl?: string;
  audioFor?: string;
  /** "No introduction for this topic": the AI won't write one */
  off?: boolean;
}

export interface Slide {
  id: string;
  /** Editor-only. Consecutive slides with the same topic form one topic. */
  topic?: string;
  topicByAI?: boolean;
  topicFrom?: string;
  background?: { color?: string; image?: string };
  elements: SlideElement[];
  helper?: SlideHelper;
  /** Only on the first slide of a topic (lib/canvas/intro.ts) */
  intro?: SlideIntro;
}

export interface Deck {
  lessonId: string;
  title: string;
  slides: Slide[];
  /** End-of-lesson recap, written by the AI on publish. */
  recap?: string;
  source: 'hand' | 'ai';
  /** The AI lesson version (Redis key) this deck was copied from with "Start from AI". */
  basedOn?: string;
  /** Changes with every save from the editor (not with AI fill-ins), to spot two people editing at once. */
  editRev?: string;
  recapByAI?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}
