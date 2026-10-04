// The canvas slide format — used by hand-made decks (the editor) and AI decks alike.
// Positions and sizes are percent of the slide (0–100), so a slide looks the
// same at any screen size. See docs/customization-plan.md.

export type TextStyle = 'title' | 'body' | 'caption' | 'bigNumber';

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
}

export type SlideElement = TextElement | ImageElement;

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

export interface Slide {
  id: string;
  /** Editor-only. Consecutive slides with the same topic form one topic. */
  topic?: string;
  topicByAI?: boolean;
  topicFrom?: string;
  background?: { color?: string; image?: string };
  elements: SlideElement[];
  helper?: SlideHelper;
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
