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
  /**
   * The answer check (lib/canvas/activityCheck.ts): the AI read the answer key against the
   * knowledge base before any audio was made. from = fingerprint of the box it checked;
   * ok = nothing doubtful left; notes = what a person should look at; fixed = what it corrected.
   * A person's "Answers look right" sets ok (byPerson) until the box changes.
   */
  answerCheck?: {
    from: string; ok: boolean; notes?: string[]; fixed?: string[]; byPerson?: boolean;
    /** The AI's fixes for a key a person typed (not made): the whole key with them in, and the notes they answer */
    suggested?: { items?: ActivityElement['items']; slider?: ActivityElement['slider']; notes: string[]; says: string[] };
    /** A person has looked at what the AI fixed (the "fixed by AI" tag goes) */
    fixesSeen?: boolean;
  };
  /** A person edited the answer key (groups, items, stops): the answer check only suggests fixes, never makes them */
  keyByPerson?: boolean;
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

/** A fact the slide check looked at (lib/canvas/checkSlide.ts) */
export interface CheckedClaim {
  /** The fact, in a few words */
  claim: string;
  verdict: 'supported' | 'unsupported' | 'contradicted';
  /** The element it's in (to jump to it), when known */
  elId?: string;
  /** Where it's backed up (or contradicted): files from the knowledge base, with a short quote */
  sources: { source: string; quote: string }[];
  /** For a contradicted fact: what the sources say instead */
  fix?: string;
  /** For a contradicted fact: the element's words with the fix in ("Use this"), and what they were */
  rewrite?: { say?: string; text?: string; beforeSay: string; beforeText?: string };
}

/**
 * What the editor's checks found, kept with the lesson so they survive a
 * reload, both editors see them, and Publish only re-checks what changed.
 * Fingerprints say what was checked (lib/canvas/checks.ts factBasis / lessonBasis).
 */
export interface DeckChecks {
  /** Fact checks by slide id */
  facts?: Record<string, { from: string; at: string; excerpts: number; claims: CheckedClaim[] }>;
  /** Facts a person marked "It's fine" (claimKey) */
  factsOk?: string[];
  /** The last AI repeat check: what the lesson was then, how many it found, and each slide as it was (factBasis: the next check reads what changed) */
  repeats?: { from: string; at: string; found: number; slides?: Record<string, string> };
  /** Repeat suggestions a person skipped (repeatKey) */
  repeatSkips?: string[];
  /** The story-order check (storyOrder.ts): the lesson it looked at (orderBasis), and the moves it suggests */
  order?: { from: string; at: string; why?: string; moves: OrderMove[] };
  /** Order moves a person skipped (moveKey) */
  orderSkips?: string[];
  /** The picture check (pictures.ts), per slide id: the slide it looked at (pictureBasis) and the pictures it suggests (null: none) */
  pictures?: Record<string, { from: string; at: string; idea: PictureIdea | null; note?: string }>;
  /** Picture ideas a person skipped (pictureSkipKey) */
  pictureSkips?: string[];
}

/** Pictures the check suggests adding to a slide, and the slide laid out again with them */
export interface PictureIdea {
  /** The pictures added: address, description, and why it fits the slide */
  pictures: { src: string; alt: string; why: string }[];
  /** The slide's elements laid out with them (the slide's own keep their content; the pictures are new elements) */
  elements: SlideElement[];
}

/** A suggested move: these slides (a topic, or one slide), put right after `after` (null: at the start). */
export interface OrderMove {
  ids: string[];
  after: string | null;
  /** "Move the topic “…” to the start", "Move “…” after “…”" */
  label: string;
  topic?: boolean;
  /** Slides whose AI-written words don't fit the new order: written again when the move is made */
  reword?: string[];
}

/** One end-of-lesson quiz question: a few choices, one right (by index). */
export interface QuizQuestion {
  q: string;
  choices: string[];
  answer: number;
  /** Why the answer is right, in a short sentence (said after a wrong pick) */
  why?: string;
}

/**
 * The end-of-lesson quiz (lib/canvas/quiz.ts): a pool the AI writes when the lesson is saved, each
 * answer checked against the lesson and the knowledge base. Learners get 3 at random.
 */
export interface DeckQuiz {
  questions: QuizQuestion[];
  /** quizBasis of the lesson the questions were last checked against (a changed lesson: checked again) */
  from: string;
  /** No quiz at the end of this lesson */
  off?: boolean;
}

/**
 * A question learners (or the classmates) might ask about a topic, with its answer as a slide
 * (lib/canvas/bank.ts). The AI writes about 6 per topic when the lesson is saved; the answer
 * slide gets its spoken words' audio like any slide. When a learner asks something close, its
 * answer slide plays; the classmates ask the related ones.
 */
export interface BankQuestion {
  id: string;
  /** The topic it's about (the topic name on its slides) */
  topic: string;
  /** The question, as a kid in class would ask it */
  q: string;
  /** The classmate who asks it when it comes up (lib/classmates.ts) */
  asker: 'maya' | 'finn' | 'leo';
  /** The answer, as a slide: shown and said like any slide */
  slide: Slide;
  /** Written by the AI (a person's edit makes it theirs: kept when the topic changes) */
  byAI?: boolean;
}

export interface DeckBank {
  questions: BankQuestion[];
  /** Per topic, the bankBasis its AI questions were written from (a changed topic: written again) */
  from: Record<string, string>;
  /** No question bank in this lesson */
  off?: boolean;
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
  /** The end-of-lesson quiz pool */
  quiz?: DeckQuiz;
  /** Questions and answer slides per topic (the classmates ask them; a learner's close question gets its answer slide) */
  bank?: DeckBank;
  /** The editor's fact and repeat checks (editor-only) */
  checks?: DeckChecks;
  updatedAt?: string;
  updatedBy?: string;
  /** The name this version was saved under when it was published (lib/canvas/saved.ts) */
  savedAs?: string;
}
