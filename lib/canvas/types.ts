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

export interface Slide {
  id: string;
  /** Editor-only. Consecutive slides with the same topic form one topic. */
  topic?: string;
  topicByAI?: boolean;
  background?: { color?: string; image?: string };
  elements: SlideElement[];
}

export interface Deck {
  lessonId: string;
  title: string;
  slides: Slide[];
  /** End-of-lesson recap, written by the AI on publish. */
  recap?: string;
  source: 'hand' | 'ai';
  updatedAt?: string;
  updatedBy?: string;
}
