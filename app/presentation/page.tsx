'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { useDeckPlayer } from '@/components/canvas/useDeckPlayer';
import { useListener } from '@/components/canvas/useListener';
import Transcript from '@/components/canvas/Transcript';
import { useTutor } from '@/components/canvas/useTutor';
import MicMeter from '@/components/canvas/MicMeter';
import { parseCanvasCommand, findSlide, searchByMeaning } from '@/lib/canvas/commands';
import { useCues } from '@/components/canvas/useCues';
import { useLessonTracking } from '@/components/canvas/useLessonTracking';
import VariantOverlay, { type Variant } from '@/components/canvas/VariantOverlay';
import { useEmotionWatcher, type LearnerEmotion } from '@/components/hooks/useEmotionWatcher';
import { useHandRaise } from '@/components/hooks/useHandRaise';
import { useFacePresence } from '@/components/hooks/useFacePresence';
import CameraBubble, { type CameraSees } from '@/components/canvas/CameraBubble';
import { describeForTutor, type SectionState, type SelfCheckRating } from '@/lib/learnerState';
import { topicIndexes } from '@/lib/canvas/queue';
import { CUE_TEXT, type CueKey } from '@/lib/canvas/cues';
import { loadDeck, type Loaded } from '@/lib/canvas/loadDeck';
import { DEFAULT_LESSON } from '@/lib/canvas/lessons';
import type { Deck } from '@/lib/canvas/types';
import { learnerHeaders } from '@/lib/learnerSession';
import { CLASSMATE_NAME } from '@/lib/voice';
import type { ActivityMistake, FinnEvent, FinnMove } from '@/components/canvas/Activity';
import { focusSlide, helperSlide, ownHelper } from '@/lib/canvas/morph';
import { activityReady, shownWords, speakingOrder, spokenText } from '@/lib/canvas/queue';
import { currentAudio } from '@/lib/canvas/aiFields';
import { activePointer } from '@/lib/canvas/laser';
import type { ActivityElement, Pointer, Slide } from '@/lib/canvas/types';

/*
 * The canvas presentation (see docs/customization-plan.md).
 *   /presentation                    → the default lesson
 *   /presentation?lesson=<id>        → another lesson
 *   /presentation?lesson=<id>&preview=1 → that lesson's saved draft (editors only)
 *   /presentation?lesson=<id>&preview=ai → that lesson's AI deck (editors only)
 *   /presentation?lesson=sample      → the built-in sample deck
 * A lesson plays its published deck; with none, its AI deck; with neither,
 * the old AI lesson converted (Blue Catfish only).
 * The learner can interrupt, ask questions, say they're lost (variant slides),
 * and with the camera on the professor notices confusion, looking away and a
 * raised hand. Learner events go to the same tables as /presentationv2.
 */

export default function CanvasPresentation() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startAt, setStartAt] = useState(0);   // &slide=N (1-based): start there (the editor's "▶ From this slide")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lesson = params.get('lesson') || DEFAULT_LESSON.id;
    const pv = params.get('preview');
    const at = Number(params.get('slide'));
    if (Number.isInteger(at) && at > 1) setStartAt(at - 1);
    loadDeck(lesson, pv === 'ai' ? 'ai' : pv ? 'draft' : null)
      .then(setLoaded)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error || !loaded) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6 text-center">
        {error ? (
          <p className="text-lg text-red-200 max-w-md">{error}</p>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-4 border-cyan-300/30 border-t-cyan-300 animate-spin" />
            <p className="text-slate-300">Getting the lesson ready… (the first time, this can take a few minutes)</p>
          </>
        )}
      </main>
    );
  }
  return <Player deck={loaded.deck} preview={loaded.preview} startAt={Math.min(startAt, loaded.deck.slides.length - 1)} />;
}

// "You lost me" and friends: the learner is confused, not just asking for simpler words
const CONFUSED = /\blost me\b|\bi'?m lost\b|\b(?:don'?t|do not|didn'?t) (?:understand|get it|get that|get this|follow)\b|\bconfus|\bwhat does (?:that|this|it) (?:even )?mean\b|^huh\b/i;
const YES = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|uh[- ]huh|definitely|go ahead|do it|mhm)\b/i;
const NO = /^(?:no|nope|nah|not really|i'?m (?:good|fine|ok(?:ay)?)|all good|keep going|carry on)\b/i;
const SPEAKING: string[] = ['playing', 'loading', 'finishing', 'waiting'];
// The slide itself turns into the helper ("another way to see it") and into
// the focused plain-words version ("simpler please"), instead of a popup.
// false = the old popup (VariantOverlay) and no focus.
const MORPH_HELPERS = true;
const MORPH_BACK_MS = 950;   // a morph back finishes before the lesson moves to another slide
const HAND_RING_MS = 2500;   // how long the camera bubble stays yellow after a raised hand
// Spotlight: while a box is being said, the rest of the slide fades to this (1 = off). Kept light on purpose.
const SPOTLIGHT = 0.7;
// How often Finn gets something wrong on purpose for the learner to catch (never his first turn; 0 = never)
const FINN_MISTAKE_CHANCE = 0.5;
const MIN_VISUAL_MS = 3000;
// The slide as big as fits with the header and the controls under it (was 80% of the screen height,
// so on a 1366×768 laptop the controls pushed the top of the slide off the screen)
const SLIDE_WIDTH = 'min(88vw, calc((100vh - 190px) * 16 / 9))';
const EXCHANGE_HIDE_MS = 12000;   // the question + answer box under the slide goes away this long after the answer
const FINN_HANDS_ON_DELAY_MS = 900;   // Finn's go in a hands-on box, this long after the learner's turn begins
const STEP_IN_AFTER = 2;              // the same item wrong this many times: the professor explains it
const STEP_IN_MAX = 2;                // at most this many explanations per hands-on box   // a board (or slide) shown with an answer stays up at least this long

/** The topic the learner found hardest (by self-checks, "I'm lost"s, simpler/repeat requests), or null if none was hard. */
function hardestTopic(deck: Deck, topicOf: number[], stateOf: (topic: number) => SectionState): string | null {
  let best: { name: string; score: number } | null = null;
  for (const topic of new Set(topicOf)) {
    const st = stateOf(topic);
    const score = (st.self_check === 'lost' ? 3 : st.self_check === 'kind' ? 1.5 : 0)
      + st.confusion_marks + 0.5 * (st.simplify_requests + st.repeats);
    const name = deck.slides[topicOf.indexOf(topic)]?.topic?.trim();
    if (name && score >= 1 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

/** What Finn says at a topic's end: a question, or (truth set) a mistake for the learner to catch. */
type FinnLine = { question: string; truth?: string };

/** What Finn says when he has a go in a hands-on box */
function finnHandsOnLine(e: { item: string; group?: string; guess?: string }): string {
  return e.guess ? `Ooh, I know this one! I bet it's ${e.guess}!` : `Ooh, let me help! ${e.item} goes in ${e.group}!`;
}
const goodCatch = (item: string, group: string, name: string) => `Good catch${name ? `, ${name}` : ''}! ${item} goes in ${group}.`;
const NICE_TRY = `Nice try, ${CLASSMATE_NAME}! Not quite.`;
const TAKE_ANOTHER_LOOK = `Hmm, almost! Take another look at where ${CLASSMATE_NAME} put his.`;

/** The hello with the learner's name: one clip, so there's no gap around the name. */
const greeting = (name: string) => `Hey ${name}! I'm Professor Marine. Let's dive in.`;

/** A sentence for the end of the recap: the learner's name and what to look at again. */
function personalRecap(name: string, hardest: string | null): string {
  if (name && hardest) return `Nice work today, ${name}! ${hardest} was the trickiest part for you, so that's a great one to look at again.`;
  if (name) return `Nice work today, ${name}! You stuck with it the whole way.`;
  if (hardest) return `${hardest} was the trickiest part, so that's a great one to look at again.`;
  return '';
}

function Player({ deck, preview, startAt = 0 }: { deck: Deck; preview: boolean; startAt?: number }) {
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [interruptOn, setInterruptOn] = useState(false);   // talk over the professor (opt-in: opens the mic)
  const [cameraOn, setCameraOn] = useState(false);         // emotion check-in, presence, hand raise (opt-in)
  const [showTranscript, setShowTranscript] = useState(true);   // top-right text of what's being said
  const [optionsOpen, setOptionsOpen] = useState(false);          // the ⚙ Options menu
  const optionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optionsOpen) return;
    const close = (e: PointerEvent) => { if (!optionsRef.current?.contains(e.target as Node)) setOptionsOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOptionsOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [optionsOpen]);
  const [classmateOn, setClassmateOn] = useState(true);         // Finn, the AI classmate, asks questions at topic ends
  const [classmateSaying, setClassmateSaying] = useState(false);
  // Hands-on sounds (pop, bonk, chime): on unless turned off (remembered on this browser)
  const [soundsOn, setSoundsOn] = useState(true);
  useEffect(() => { try { setSoundsOn(localStorage.getItem('handsOnSounds') !== 'off'); } catch { /* private mode */ } }, []);
  const toggleSounds = () => setSoundsOn((on) => {
    try { localStorage.setItem('handsOnSounds', on ? 'off' : 'on'); } catch { /* private mode */ }
    return !on;
  });
  // What to call the learner (optional, asked on the start screen; remembered on this browser)
  const [learnerName, setLearnerName] = useState('');
  useEffect(() => { try { setLearnerName(localStorage.getItem('learnerName') ?? ''); } catch { /* private mode */ } }, []);
  const topicEndRef = useRef<(from: number, to: number) => void>(() => {});
  // Hands-on boxes: the ones finished this lesson, and the one it's waiting on now
  const activitiesDone = useRef(new Set<string>());
  const activitiesSolved = useRef(new Set<string>());
  const turnStarted = useRef(new Map<string, number>());   // when the learner's turn began (time to finish, for the stats)   // done by the learner (not skipped): drawn finished if drawn again
  const [yourTurn, setYourTurn] = useState<string | null>(null);
  const yourTurnRef = useRef(yourTurn);
  yourTurnRef.current = yourTurn;
  const [activityHint, setActivityHint] = useState(0);
  const [settledTick, setSettledTick] = useState(0);
  // Finn's turn in hands-on boxes (by element id), and the item the professor explained after repeated mistakes
  const [finnMoves, setFinnMoves] = useState<Record<string, FinnMove>>({});
  const [activityGuides, setActivityGuides] = useState<Record<string, string>>({});   // bumped when a box is done or skipped (redraws it without its hand)   // bumped: the hands-on box shows its example hand again
  const [variant, setVariant] = useState<Variant | null>(null);
  const [mood, setMood] = useState<LearnerEmotion | null>(null);
  const [introDone, setIntroDone] = useState(false);
  // Between topics: "How did that section go?" (from = last slide of the topic, to = where next)
  const [selfCheck, setSelfCheck] = useState<{ from: number; to: number } | null>(null);
  const selfCheckRef = useRef(selfCheck);
  selfCheckRef.current = selfCheck;
  const checked = useRef(new Set<number>());   // topic-end slides already asked about
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicOf = useMemo(() => topicIndexes(deck.slides), [deck]);
  const player = useDeckPlayer(deck, started && introDone, {
    holdBefore: (from, to) => !checked.current.has(from) && (to >= deck.slides.length || topicOf[to] !== topicOf[from]),
    // End of a topic: maybe Finn asks something first, then "How did that section go?"
    onHold: (from, to) => { topicEndRef.current(from, to); },
    // A hands-on box: after the professor says what to do, the learner's turn (until done or skipped)
    waitAfter: (el) => el.type === 'activity' && activityReady(el) && !activitiesDone.current.has(el.id),
    onWait: (el) => {
      setYourTurn(el.id);
      turnStarted.current.set(el.id, Date.now());
      // Finn has a go first (planned when the slide started), a moment after the learner's turn begins
      const plan = finnPlans.current.get(el.id);
      if (plan && classmateOnRef.current) {
        setTimeout(() => { if (yourTurnRef.current === el.id) setFinnMoves((m) => ({ ...m, [el.id]: { ...plan, nonce: Date.now() } })); }, FINN_HANDS_ON_DELAY_MS);
      }
      tracking.track('tutor_decision', { action: 'activity_start', kind: el.type === 'activity' ? el.kind : '' });
    },
    startAt,
  });
  const tutor = useTutor();
  const cues = useCues(started);
  // The personal hello is made once they stop typing their name, so Start speaks at once
  const { preload: preloadLine } = cues;
  useEffect(() => {
    const name = learnerName.trim();
    if (started || name.length < 2) return;
    const t = setTimeout(() => preloadLine(greeting(name)), 900);
    return () => clearTimeout(t);
  }, [learnerName, started, preloadLine]);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const tracking = useLessonTracking(deck, started, player.slideIndex, player.status === 'finished');
  // Async steps (an answer or a cue finished) must act on the latest player, not the one from when they began
  const playerRef = useRef(player);
  playerRef.current = player;
  const tutorBusy = tutor.thinking || tutor.speaking;
  // The conversation for the transcript, minus the answer being spoken right now
  const lastTalk = tutor.history[tutor.history.length - 1];
  const earlierDialogue = lastTalk && tutor.exchange?.done && lastTalk.question === tutor.exchange.question ? tutor.history.slice(0, -1) : tutor.history;
  const tutorBusyRef = useRef(tutorBusy);
  tutorBusyRef.current = tutorBusy;
  // The question + answer box under the slide goes away a while after the answer (the transcript keeps it)
  const { clearExchange } = tutor;
  const clearExchangeRef = useRef(clearExchange);
  clearExchangeRef.current = clearExchange;
  useEffect(() => {
    if (!tutor.exchange?.done || tutor.speaking) return;
    const t = setTimeout(() => clearExchangeRef.current(), EXCHANGE_HIDE_MS);
    return () => clearTimeout(t);
  }, [tutor.exchange, tutor.speaking]);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  /** Say a short reply ("Skipping ahead."), then do it. A newer reply cancels this one. */
  const act = useCallback((cue: CueKey, action: () => void) => {
    say(CUE_TEXT[cue]);
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    cues.play(cue).then((ok) => { if (ok) action(); });
  }, [cues, say]);

  /** What the learner is looking at, for the tutor: the slide's text and what's being said. */
  const slideText = useCallback((i: number) => {
    const s = deck.slides[i];
    return s ? s.elements.map((e) => (e.type === 'text' ? e.text : shownWords(e) ? `[${e.type}: ${shownWords(e)}]` : '')).filter(Boolean).join(' | ') : '';
  }, [deck]);
  const slideContext = useCallback(() => {
    const p = playerRef.current;
    const s = deck.slides[p.slideIndex];
    if (!s) return deck.title;
    const speaking = s.elements.find((e) => e.id === p.activeId);
    return `Lesson: ${deck.title}. Topic: ${s.topic ?? ''}. On screen: ${slideText(p.slideIndex)}.` +
      (speaking?.say ? ` The professor was just saying: "${speaking.say}"` : '') +
      (learnerName ? ` The learner's name is ${learnerName}; use it now and then, not in every answer.` : '') +
      // the hands-on box's answers are on screen (above): the professor helps them get there, not past it
      (yourTurnRef.current ? ' The learner is in the middle of the hands-on activity on this slide: give a hint that helps them think, never the answers.' : '') +
      describeForTutor(tracking.state());
  }, [deck, slideText, tracking, learnerName]);

  /** The best reviewed variant slide (e.g. an authored PDF deck slide) for a topic and some words, or null. */
  // explain: also have the professor's spoken explanation of it written fresh (slower)
  const findVariant = useCallback(async (state: string, title: string, about: string, explain = false): Promise<Variant | null> => {
    try {
      const q = new URLSearchParams({ state, title, about, ...(explain ? { explain: '1' } : {}) });
      const res = await fetch(`/api/tutor/variant?${q}`, { headers: learnerHeaders(), signal: AbortSignal.timeout(explain ? 12000 : 6000) });
      return (await res.json()).variant ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Lets the lesson finish the sentence it's in (at most a few seconds), then
   * pause; resolves once it's quiet. Resuming later replays that sentence.
   */
  const finishThenPause = useCallback((): Promise<void> => new Promise((resolve) => {
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.interrupt(() => resolve());
    else resolve();
  }), []);

  /** The professor's drawing for a question, or null (no drawing helps, too slow, or rate-limited). */
  const fetchBoard = useCallback(async (question: string, topic: string, onSlide: string): Promise<Slide | null> => {
    try {
      const res = await fetch('/api/tutor/board', {
        method: 'POST',
        headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, topic, slideText: onSlide }),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok ? ((await res.json()).board ?? null) : null;
    } catch {
      return null;
    }
  }, []);

  /** A question (not a command): the professor answers, then the lesson carries on. */
  const answer = useCallback(async (question: string, opts: {
    /** A classmate asked it (their name): not counted as the learner's question */
    asker?: string;
    /** false: don't carry on with the lesson afterwards (the caller decides what's next) */
    resume?: boolean;
  } = {}) => {
    tracking.track('tutor_question', { question: question.slice(0, 300), ...(opts.asker ? { asker: opts.asker } : {}) }, opts.asker ? undefined : { questions: 1 });
    // was: pause at once (mid-word). Now the sentence finishes while the answer is being written.
    const quiet = finishThenPause();
    // The professor draws while answering: a board the slide morphs into
    // (a chart, a comparison, steps), when a drawing helps
    const base = deck.slides[playerRef.current.slideIndex];
    // In the middle of a hands-on box the slide stays as it is: turning it into a board
    // (or another slide) and back would start the box over
    const handsOn = yourTurnRef.current !== null;
    // (not for a two-word "why not?": a paid call each time, and nothing to draw)
    // ONE visual per answer: the drawing if there is one, else an authored slide on it.
    // (was: both looked up at once and each shown as it arrived, so the slide
    // jumped to the authored slide and then again to the board)
    let answering = true;   // a visual that arrives after the answer is over isn't shown
    let shownAt = 0;        // when it went up (it stays at least MIN_VISUAL_MS, so it never just flashes)
    if (MORPH_HELPERS && base && !handsOn) {
      const wantBoard = question.trim().split(/\s+/).length >= 3;
      Promise.all([
        wantBoard ? fetchBoard(question, base.topic ?? '', slideText(playerRef.current.slideIndex)) : Promise.resolve(null),
        // Not for Finn's questions: the authored slide is the "I'm lost" help slide, and the
        // learner isn't lost when a classmate asks (was: Finn spoke, the help slide came up)
        opts.asker ? Promise.resolve(null) : findVariant('confused', question, question),
      ]).then(([board, slide]) => {
        if (!answering) return;
        variantMode.current = 'answer';
        if (board || slide) shownAt = Date.now();
        if (board) {
          tracking.track('tutor_decision', { action: 'board', title: String(board.elements[0]?.type === 'text' ? board.elements[0].text : '') });
          // keeps the slide's background, so it's the slide turning into the board
          setVariant({ title: '', body: '', narration: '', variant: 'board', slide: { ...board, id: `${base.id}~board`, background: base.background } });
        } else if (slide) {
          tracking.track('tutor_decision', { action: 'slide_with_answer', title: slide.title });
          setVariant(slide);
        }
      });
    }
    const context = slideContext() + (opts.asker
      ? `\nThis question is from ${opts.asker}, a classmate (not the learner). Answer ${opts.asker} by name, as a teacher answers a student in class.` +
        (learnerName.trim() ? ` Don't call ${opts.asker} ${learnerName.trim()}: ${learnerName.trim()} is the learner, not who asked.` : '')
      : '');
    const { decision, superseded } = await tutor.ask(question, context, { holdUntil: quiet, asker: opts.asker });
    answering = false;
    // A drawing that arrived near the end of the answer stays up a moment before the slide turns back
    const left = shownAt && !superseded ? MIN_VISUAL_MS - (Date.now() - shownAt) : 0;
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    if (variantMode.current === 'answer') setVariant(null);
    if (superseded) return;   // talked over the answer: the next turn decides what happens
    // The caller goes on to something else (Finn's turn → "How did that section go?"): let the
    // board morph back first (was: the self-check popped up mid-morph over a redrawing slide)
    if (opts.resume === false) { if (shownAt) await new Promise((r) => setTimeout(r, MORPH_BACK_MS + 250)); return; }
    if (decision) tracking.track('tutor_decision', { action: decision });
    const now = playerRef.current;
    if (decision === 'simplify') now.simplify();
    else if (decision === 'advance') now.nextSlide();
    else if (decision === 'repeat') now.repeat();
    else now.resume();
  }, [tutor, slideContext, tracking, findVariant, finishThenPause, deck, slideText, learnerName]);

  /**
   * The learner is lost: show a reviewed variant slide for this topic if there
   * is one (e.g. the authored PDF deck slide), otherwise play the plain
   * version of what was just said.
   */
  /** Shows a variant slide and narrates it; then `after` (default: the lesson resumes). */
  const presentVariant = useCallback(async (found: Variant, after?: () => void) => {
    setVariant(found);
    variantMode.current = 'narrated';
    variantAfter.current = after ?? null;
    if (found.slide) {
      // The slide's own helper: each speaking box in turn, highlighted while it's said
      const seq = ++helperSeq.current;
      const boxes = speakingOrder(found.slide);
      for (const el of boxes) {
        if (seq !== helperSeq.current) return;
        setHelperActive(el.id);
        const played = await cues.play({ text: spokenText(el), url: currentAudio(el, 'normal') });
        if (!played || seq !== helperSeq.current) { setHelperActive(null); return; }   // closed or talked over
      }
      setHelperActive(null);
      if (boxes.length && seq === helperSeq.current) closeVariant();
      return;   // nothing to say: it stays up until "Got it, back to the lesson"
    }
    // A live explanation (the professor teaches from the slide) beats the stored clip
    const ok = await cues.play(found.live_narration
      ? { text: found.live_narration }
      : { text: found.narration, url: found.audio_url });
    if (ok) closeVariant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues]);

  /** The helper for slide i: its own, or for a hands-on slide the nearest earlier slide's in the same topic. */
  const helperFor = useCallback((i: number): Slide | null => {
    const s = deck.slides[i];
    const own = s ? ownHelper(s) : null;
    if (own || !s?.elements.some((e) => e.type === 'activity')) return own;
    for (let j = i - 1; j >= 0 && topicOf[j] === topicOf[i]; j--) {
      const h = ownHelper(deck.slides[j]);
      if (h) return h;
    }
    return null;
  }, [deck, topicOf]);

  const confused = useCallback(async (after?: () => void, mood?: 'confused' | 'frustrated') => {
    tracking.track('confusion_click', {}, { confusion_marks: 1 });
    if (finnBusy.current) { finnVerdict(null, 'button'); takeOverFromFinn(); if (tutorBusyRef.current) tutor.cancel(); }
    // Stuck on a hands-on box: the professor says what to do again and the hand shows how (what's done stays done)
    if (yourTurnRef.current) {
      tracking.track('tutor_decision', { action: 'activity_hint' });
      setActivityHint((n) => n + 1);
      playerRef.current.repeat();
      return;
    }
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    const s = deck.slides[p.slideIndex];
    const state = mood ?? (tracking.state().last_state === 'frustrated' ? 'frustrated' : 'confused');
    // The slide's own helper (made in the editor or drafted by the AI) comes first;
    // on a hands-on slide (which has none), the helper of the slide that taught it
    const own = MORPH_HELPERS ? helperFor(p.slideIndex) : null;
    if (own) {
      tracking.track('tutor_decision', { action: 'helper', byAI: !!s?.helper?.byAI, state });
      presentVariant({ title: '', body: '', narration: '', slide: own, variant: 'helper' }, after);
      return;
    }
    const found = await findVariant(state, s?.topic ?? '', slideText(p.slideIndex), true);
    if (found) {
      tracking.track('tutor_decision', { action: 'variant', variant: found.variant, title: found.title, state });
      presentVariant(found, after);
      return;
    }
    tracking.track('tutor_decision', { action: 'plain' });
    act('cmd_simplify', () => playerRef.current.simplify());
  }, [deck, slideText, tracking, act, findVariant, presentVariant, helperFor]);

  /** "show me the slide (on X)": the authored slide for X (or this topic), narrated, then back to the lesson. */
  const showSlide = useCallback(async (query: string) => {
    tracking.track('deck_command', { kind: 'showSlide', query });
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    const s = deck.slides[p.slideIndex];
    const found = query
      ? await findVariant('confused', query, query, true)
      : await findVariant('confused', s?.topic ?? '', slideText(p.slideIndex), true);
    if (found) {
      tracking.track('tutor_decision', { action: 'show_slide', title: found.title });
      presentVariant(found);
    } else {
      act('cmd_notFound', () => playerRef.current.resume());
    }
  }, [deck, slideText, tracking, act, findVariant, presentVariant]);

  const variantAfter = useRef<(() => void) | null>(null);   // what happens once the variant slide is done
  const helperSeq = useRef(0);   // bumped to stop narrating a helper box by box
  const [helperActive, setHelperActive] = useState<string | null>(null);   // the helper box being said
  // 'narrated': the professor explains the slide itself. 'answer': it's up while
  // the professor answers a question, and goes away with the answer.
  const variantMode = useRef<'narrated' | 'answer'>('narrated');
  function closeVariant() {
    if (variantMode.current === 'answer') { setVariant(null); return; }   // the answer carries on; the lesson resumes after it
    cues.stop();
    setVariant(null);
    helperSeq.current++;
    setHelperActive(null);
    const after = variantAfter.current;
    variantAfter.current = null;
    // was: if (after) after(); — moving to another slide at once cut the morph back short
    if (after) { if (MORPH_HELPERS) setTimeout(after, MORPH_BACK_MS); else after(); }
    else playerRef.current.resume();
  }

  /* --------------------------------------------- Finn, the AI classmate */
  const classmateTopics = useRef(new Set<number>());   // topics Finn already asked about
  const classmateAsked = useRef<string[]>([]);
  const classmateOnRef = useRef(classmateOn);
  classmateOnRef.current = classmateOn;
  // Finn's line for a topic, fetched (and voiced) while its last slide plays, so he speaks at once
  const finnReady = useRef(new Map<number, Promise<FinnLine | null>>());
  const finnLine = useCallback((topic: number): Promise<FinnLine | null> => {
    if (!finnReady.current.has(topic)) {
      const slides = deck.slides.map((_, i) => i).filter((i) => topicOf[i] === topic);
      // never his first turn: first he shows how to ask, then he sometimes gets it wrong
      const mistake = classmateAsked.current.length > 0 && Math.random() < FINN_MISTAKE_CHANCE;
      finnReady.current.set(topic, fetchClassmate(deck.slides[slides[0]]?.topic ?? '', slides.map(slideText).join(' | '), mistake)
        .then((line) => { if (line) cuesRef.current.preload(line.question, 'classmate'); return line; }));
    }
    return finnReady.current.get(topic)!;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, topicOf, slideText]);
  useEffect(() => {
    const i = player.slideIndex;
    const lastOfTopic = i + 1 >= deck.slides.length || topicOf[i + 1] !== topicOf[i];
    if (started && classmateOn && lastOfTopic && !classmateTopics.current.has(topicOf[i]) && tracking.state().questions === 0) finnLine(topicOf[i]);
  }, [started, classmateOn, player.slideIndex, deck, topicOf, tracking, finnLine]);

  // Finn's turn at a topic's end (his line, the professor's answer); bumped when the learner takes over
  const finnTurn = useRef(0);
  const finnBusy = useRef(false);
  const takeOverFromFinn = useCallback(() => {
    if (!finnBusy.current) return;
    finnBusy.current = false;
    finnTurn.current++;
    setClassmateSaying(false);
  }, []);
  // Finn said something wrong on purpose: waiting for the learner to say if he's right
  // null = called off (the learner moved on, or gave a command instead)
  const finnCheck = useRef<((verdict: string | null) => void) | null>(null);
  const micRef = useRef<{ status: string; talk: () => void }>({ status: 'off', talk: () => {} });   // the mic (set up further down)
  const [finnWaiting, setFinnWaiting] = useState(false);
  const finnVerdict = useCallback((verdict: string | null, how: 'voice' | 'button' | 'typed') => {
    const done = finnCheck.current;
    if (!done) return false;
    finnCheck.current = null;
    setFinnWaiting(false);
    // Answered with a button or typing while the mic listens: stop it, and ignore what it heard
    const mic = micRef.current;
    if (how !== 'voice' && (mic.status === 'listening' || mic.status === 'processing')) {
      skipTranscript.current = true;
      if (mic.status === 'listening') mic.talk();
    }
    done(verdict);
    return true;
  }, []);

  topicEndRef.current = async (from: number, to: number) => {
    const topic = topicOf[from];
    const my = ++finnTurn.current;
    // The learner did something else meanwhile ("I'm lost", a question, a command): their turn now, Finn's is over
    const over = () => finnTurn.current !== my;
    // Finn speaks when the learner didn't ask anything in this topic (once per topic)
    if (classmateOnRef.current && !classmateTopics.current.has(topic) && tracking.state().questions === 0) {
      classmateTopics.current.add(topic);
      finnBusy.current = true;
      try {
      const line = await finnLine(topic);
      if (line && !selfCheckRef.current && !over()) {
        const q = line.question;
        classmateAsked.current.push(q);
        tracking.track('tutor_decision', { action: line.truth ? 'classmate_mistake' : 'classmate', question: q.slice(0, 300) });
        const name = learnerName.trim();
        const turnTo = name ? `Hmm. ${name}, what do you think? Is ${CLASSMATE_NAME} right?` : `Hmm. What do you think, is ${CLASSMATE_NAME} right?`;
        if (line.truth) cues.preload(turnTo);   // ready by the time Finn finishes
        setClassmateSaying(true);
        const said = await cues.play({ text: q, who: 'classmate' });
        setClassmateSaying(false);
        if (said && !over() && !line.truth) await answer(q, { asker: CLASSMATE_NAME, resume: false });
        else if (said && !over() && line.truth) {
          // The professor turns to the learner, and waits for their call (buttons, typing, or the mic)
          if (await cues.play({ text: turnTo }) && !over()) {
            const verdict = await new Promise<string | null>((resolve) => {
              finnCheck.current = resolve;
              setFinnWaiting(true);
              if (interruptOn) { resumeAfterTurn.current = false; micRef.current.talk(); }   // listen for it too
            });
            if (verdict === null) return;   // moved on: no answer, and no "How did that section go?" on another slide
            tracking.track('tutor_decision', { action: 'classmate_mistake_answer', answer: verdict.slice(0, 200) });
            await tutor.ask(q, slideContext() +
              `\n${CLASSMATE_NAME}, a classmate, just said this, and it is WRONG on purpose, to see if the learner catches it. What's actually right: ${line.truth}` +
              `\nYou asked the learner if ${CLASSMATE_NAME} was right. The learner answered: "${verdict || '(nothing)'}".` +
              `\nIf the learner caught the mistake, cheer them on${name ? ` by name (${name})` : ''} and say why in a sentence. If they agreed with ${CLASSMATE_NAME} or weren't sure, ` +
              `kindly say it's an easy mix-up and explain what's right. Talk to both of them, kindly to ${CLASSMATE_NAME} too. 2 to 4 short sentences, no question at the end.`,
              { asker: CLASSMATE_NAME });
          }
        }
      }
      } finally {
        if (!over()) finnBusy.current = false;
      }
    }
    // Interrupted: what the learner did decides what's next (the lesson comes back
    // here afterwards and asks "How did that section go?" then)
    if (over()) return;
    if (playerRef.current.slideIndex !== from) return;   // the learner went somewhere else meanwhile
    setSelfCheck({ from, to });
    cuesRef.current?.play('cue_selfCheck');
  };
  // Leaving the slide (the ⏩/⏮ buttons, keys) during Finn's turn or an answer: it's over, so
  // nobody talks over the new slide (was: the answer went on while the next slide played)
  const { cancel: cancelAnswer } = tutor;
  useEffect(() => {
    if (finnBusy.current) { finnVerdict(null, 'button'); takeOverFromFinn(); cuesRef.current.stop(); }
    if (tutorBusyRef.current) cancelAnswer();
  }, [player.slideIndex, finnVerdict, takeOverFromFinn, cancelAnswer]);

  /** Finn's line about what was just taught (a question, or a mistake to catch), or null (none, too slow, or rate-limited). */
  const fetchClassmate = useCallback(async (topic: string, taught: string, mistake = false): Promise<FinnLine | null> => {
    try {
      const res = await fetch('/api/classmate', {
        method: 'POST',
        headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ topic, slideText: taught.slice(0, 2000), asked: classmateAsked.current, mistake }),
        signal: AbortSignal.timeout(10000),
      });
      const d = res.ok ? await res.json() : null;
      return d?.question ? { question: d.question, truth: d.truth || undefined } : null;
    } catch {
      return null;
    }
  }, []);

  /** The self-check answer: noted for the topic; "lost me" gets another way to see it first. */
  const answerSelfCheck = useCallback((rating: SelfCheckRating) => {
    const sc = selfCheck;
    if (!sc) return;
    tracking.track('self_check', { rating }, { self_check: rating });
    checked.current.add(sc.from);
    setSelfCheck(null);
    cues.stop();
    // Like v2: 'kind of' and 'lost me' both get another way to see it before
    // moving on ('lost me' the gentler, remedial kind)
    if (rating === 'lost') confused(() => playerRef.current.goToSlide(sc.to), 'frustrated');
    else if (rating === 'kind') confused(() => playerRef.current.goToSlide(sc.to), 'confused');
    else playerRef.current.goToSlide(sc.to);
  }, [selfCheck, tracking, cues, confused]);

  // Paused on purpose before talking? Then a turn with nothing in it leaves it paused
  const resumeAfterTurn = useRef(true);
  // The professor asked "You look puzzled…?" and is waiting for the answer
  const checkIn = useRef<LearnerEmotion | null>(null);
  const [askingHelp, setAskingHelp] = useState<LearnerEmotion | null>(null);   // the same, for the Yes / No buttons
  const skipTranscript = useRef(false);   // answered with a button: drop what the mic heard
  /** How the learner answered a check-in (for the editor's heatmap: offered vs accepted). */
  const checkInAnswered = useCallback((state: LearnerEmotion, answer: 'yes' | 'no' | 'other' | 'none', how: 'voice' | 'button') => {
    tracking.track('tutor_decision', { action: 'checkin', state, answer, how });
    setAskingHelp(null);
  }, [tracking]);

  const handleText = useCallback((text: string) => {
    // Their call on Finn's mistake (a command, like "next", calls it off and is done instead)
    if (finnCheck.current) { if (!parseCanvasCommand(text)) { finnVerdict(text, 'typed'); return; } finnVerdict(null, 'typed'); }
    takeOverFromFinn();   // the learner's own question or command during Finn's turn: theirs goes first
    if (selfCheck) {
      const t = text.toLowerCase();
      if (/\b(lost|confus|no\b|nope|didn'?t|don'?t)/.test(t)) return answerSelfCheck('lost');
      if (/\b(kind of|kinda|sort of|sorta|a bit|a little|maybe|so so|okay-ish|meh)\b/.test(t)) return answerSelfCheck('kind');
      if (/\b(got it|yes|yeah|yep|good|great|easy|fine|sure|understood|next|continue|go on)\b/.test(t)) return answerSelfCheck('got');
    }
    const cmd = parseCanvasCommand(text);
    if (variant && variantMode.current === 'narrated') { cues.stop(); setVariant(null); variantAfter.current = null; }
    if (!cmd) { answer(text); return; }
    if (tutorBusy) tutor.cancel();   // a command ends the answer
    const command = (kind: string, patch?: Parameters<typeof tracking.track>[2]) =>
      tracking.track(kind === 'repeat' ? 'repeat_request' : kind === 'simplify' ? 'simplify_request' : 'deck_command', { kind }, patch);
    const p = player;
    switch (cmd.kind) {
      case 'nextClip': command('nextClip', { skips: 1 }); act('cmd_nextClip', () => playerRef.current.nextClip()); break;
      case 'nextSlide': command('nextSlide', { skips: 1 }); act('cmd_nextSlide', () => playerRef.current.nextSlide()); break;
      case 'prevSlide':
        command('prevSlide');
        if (p.slideIndex === 0) act('cmd_atStart', () => playerRef.current.repeat());
        else act('cmd_prevSlide', () => playerRef.current.prevSlide());
        break;
      case 'nextTopic':
        command('nextTopic', { skips: 1 });
        act(p.topicIndex >= p.topicCount - 1 ? 'cmd_wrapUp' : 'cmd_nextTopic', () => playerRef.current.nextTopic());
        break;
      case 'repeat': command('repeat', { repeats: 1 }); act('cmd_repeat', () => playerRef.current.repeat()); break;
      case 'simplify':
        if (CONFUSED.test(text)) { confused(); break; }   // "you lost me": another way to see it
        command('simplify', { simplify_requests: 1 });
        act('cmd_simplify', () => playerRef.current.simplify());
        break;
      case 'showSlide': showSlide(cmd.query); break;
      case 'goTo': {
        const go = (target: number | null) => {
          if (target !== null) { command('goTo', { jumps: 1 }); act('cmd_goto', () => playerRef.current.goToSlide(target)); }
          else if (cmd.soft) answer(text);   // "tell me about X": not on a slide, so the professor answers
          else act('cmd_notFound', () => playerRef.current.resume());
        };
        const quick = findSlide(deck, cmd.query, p.slideIndex);
        if (quick !== null) go(quick);
        else searchByMeaning(deck, cmd.query).then(go);   // keywords weren't sure: search by meaning
        break;
      }
    }
  }, [deck, player, act, answer, confused, showSlide, tutor, tutorBusy, tracking, variant, cues, selfCheck, answerSelfCheck, finnVerdict]);

  // Barge-in: with interruptions on, starting to talk over the professor (or
  // over an answer) makes them finish the sentence, then stop and listen.
  const speakingNow = ['playing', 'loading', 'finishing'].includes(player.status) || tutor.speaking;
  const { status: micStatus, talk, levelRef } = useListener({
    armed: interruptOn && started,
    bargeActive: speakingNow,
    onListenStart: () => {
      resumeAfterTurn.current = playerRef.current.status !== 'paused' || checkIn.current !== null;
      if (tutor.speaking || tutor.thinking) tutor.finishSentence();
      else if (SPEAKING.includes(playerRef.current.status)) {
        tracking.track('barge_in', {}, { barge_ins: 1 });
        playerRef.current.interrupt();
      }
    },
    onTranscript: (text) => {
      if (skipTranscript.current) { skipTranscript.current = false; return; }
      if (text && finnCheck.current && !parseCanvasCommand(text)) { finnVerdict(text, 'voice'); return; }   // their call on Finn's mistake
      const asked = checkIn.current;
      checkIn.current = null;
      if (asked) checkInAnswered(asked, !text ? 'none' : YES.test(text.trim()) ? 'yes' : NO.test(text.trim()) ? 'no' : 'other', 'voice');
      if (asked && text && YES.test(text.trim())) {
        // "Want me to go over that a different way?" → yes
        if (asked === 'confused') confused();
        else act('cmd_nextSlide', () => playerRef.current.nextSlide());
        return;
      }
      if (text) handleText(text);
      // nothing usable (a cough, silence, no answer to a check-in): carry on
      else if (resumeAfterTurn.current && !tutor.thinking) playerRef.current.resume();
    },
  });
  micRef.current = { status: micStatus, talk };

  // The end: "Let's look back…", the recap (with a word for the learner), and a goodbye
  const { play: playCue, stop: stopCue, preload: preloadCue } = cues;   // stable, unlike `cues` (which changes as lines start and stop)
  const { stateOf } = tracking;
  useEffect(() => {
    if (player.status !== 'finished') return;
    let cancelled = false;
    // The recap and the personal line are ONE clip (no gap around the name),
    // made while "Let's look back…" is playing
    const recap = [deck.recap?.trim(), personalRecap(learnerName.trim(), hardestTopic(deck, topicOf, stateOf))].filter(Boolean).join(' ');
    if (recap) preloadCue(recap);
    (async () => {
      if (!(await playCue('cue_conclusionIntro')) || cancelled) return;
      if (recap && (!(await playCue({ text: recap })) || cancelled)) return;
      await playCue('cue_conclusionOutro');
    })();
    return () => { cancelled = true; stopCue(); };
    // learnerName: as it was when the lesson ended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status, deck, topicOf, stateOf, playCue, stopCue, preloadCue]);

  /* ------------------------------------------------ camera: the instructor notices */

  // The mic is mid-turn (it can be 'off' when interruptions are off: that's free)
  const micBusy = micStatus === 'listening' || micStatus === 'processing';

  // Emotion check-in: sustained confusion or boredom on camera → the professor
  // finishes the sentence, asks, and listens; "yes" helps, silence carries on.
  const onEmotion = useCallback((state: LearnerEmotion) => {
    // Puzzled while doing a hands-on box: no interruption, just the hand showing how again
    if (state === 'confused' && yourTurnRef.current) {
      tracking.track('emotion_state', { state, during: 'activity' }, { confusion_marks: 1 });
      tracking.track('tutor_decision', { action: 'activity_hint', why: 'face' });
      setActivityHint((n) => n + 1);
      return;
    }
    const p = playerRef.current;
    if (!started || tutorBusy || variant || checkIn.current || micBusy || !SPEAKING.includes(p.status)) return;
    setMood(state);
    tracking.track('emotion_state', { state }, state === 'confused' ? { confusion_marks: 1 } : undefined);
    p.interrupt(() => {
      cues.play(state === 'confused' ? 'cue_confused' : 'cue_bored').then((ok) => {
        if (!ok) return;
        checkIn.current = state;
        setAskingHelp(state);
        resumeAfterTurn.current = true;
        talk();
      });
    });
  }, [started, tutorBusy, variant, micStatus, tracking, cues, talk]);
  /** The Yes / No buttons under a check-in (for learners without a working mic, or who'd rather click). */
  const answerCheckInButton = (yes: boolean) => {
    const asked = checkIn.current;
    if (!asked) return;
    checkIn.current = null;
    checkInAnswered(asked, yes ? 'yes' : 'no', 'button');
    resumeAfterTurn.current = false;   // the button decides what happens next, not the end of the mic turn
    // The mic is listening for the spoken answer: stop it, and ignore what it heard
    if (micStatus === 'listening' || micStatus === 'processing') {
      skipTranscript.current = true;
      if (micStatus === 'listening') talk();
    }
    if (!yes) playerRef.current.resume();
    else if (asked === 'confused') confused();
    else act('cmd_nextSlide', () => playerRef.current.nextSlide());
  };

  // Busy moments are skipped in onEmotion, so the camera isn't restarted for every answer
  const { ready: emotionReady, error: emotionError, live: liveFace, learning: faceLearning } = useEmotionWatcher(cameraOn && started, onEmotion);

  // Hand raise: stop at the end of the sentence, "Do you have a question?", listen
  const [handUpAt, setHandUpAt] = useState(0);   // for the camera bubble's yellow ring
  const onHandRaised = useCallback(() => {
    setHandUpAt(Date.now());
    if (!started || micBusy || variant) return;
    tracking.track('hand_raise');
    takeOverFromFinn();   // a raised hand during Finn's turn: the learner's question first
    resumeAfterTurn.current = true;
    const ask = () => cues.play('cue_handRaise').then((ok) => { if (ok) talk(); });
    if (tutorBusy) { tutor.finishSentence(); ask(); }
    else playerRef.current.interrupt(ask);
  }, [started, micStatus, variant, tracking, cues, talk, tutorBusy, tutor, takeOverFromFinn]);
  const { progress: handProgress } = useHandRaise(cameraOn && started, onHandRaised);

  // Presence: looked away → pause and wait; back → pick up again
  const { present, error: presenceError } = useFacePresence(cameraOn && started);
  const awayPaused = useRef(false);
  const lastPresent = useRef<boolean | null>(null);
  useEffect(() => {
    if (!cameraOn || !started) { lastPresent.current = null; return; }
    if (lastPresent.current === null) { lastPresent.current = present; return; }   // first reading
    if (present === lastPresent.current) return;
    lastPresent.current = present;
    const p = playerRef.current;
    if (!present) {
      tracking.track('presence_away');
      if (SPEAKING.includes(p.status) && !tutorBusy) {
        p.pause();
        awayPaused.current = true;
        playCue('cue_away');
      }
    } else {
      tracking.track('presence_back');
      if (awayPaused.current) {
        awayPaused.current = false;
        playCue('cue_back').then((ok) => { if (ok) playerRef.current.resume(); });
      }
    }
  }, [present, cameraOn, started, tracking, playCue, tutorBusy]);

  // The laser pointer: while a clip plays, the mark whose phrase is being said
  // (on the lesson's slides, and on a helper while its boxes are narrated)
  const [laser, setLaser] = useState<{ elementId: string; pointer: Pointer } | null>(null);
  const { getAudio: getCueAudio } = cues;
  useEffect(() => {
    const onHelper = !!variant?.slide && !!helperActive;
    const el = onHelper
      ? variant!.slide!.elements.find((e) => e.id === helperActive)
      : player.activeId && !variant ? deck.slides[player.slideIndex]?.elements.find((e) => e.id === player.activeId) : null;
    const live = onHelper || (player.status === 'playing' && player.mode === 'normal');
    if (!live || !el?.pointers?.length) { setLaser(null); return; }
    const t = setInterval(() => {
      const audio = onHelper ? getCueAudio() : player.getAudio();
      const p = audio && !audio.paused ? activePointer(el, spokenText(el), audio.currentTime, audio.duration) : null;
      setLaser((cur) => (p ? (cur?.pointer === p && cur.elementId === el.id ? cur : { elementId: el.id, pointer: p }) : null));
    }, 120);
    return () => clearInterval(t);
  }, [player.status, player.mode, player.activeId, player.slideIndex, player.getAudio, deck, variant, helperActive, getCueAudio]);

  /* ------------------------------------------------ hands-on boxes */
  const praise = learnerName.trim() ? `Nice work, ${learnerName.trim()}!` : 'Nice work!';
  useEffect(() => { if (yourTurn) preloadCue(praise); }, [yourTurn, praise, preloadCue]);   // ready the moment they finish
  const { track } = tracking;   // stable (the tracking object itself is new every render)
  /** Resolves once nobody is talking (the professor's answer, or a line) — so lines don't overlap. At most 15 s. */
  const whenQuiet = useCallback(() => new Promise<void>((resolve) => {
    const t0 = Date.now();
    const check = () => { if ((!tutorBusyRef.current && !cuesRef.current.saying) || Date.now() - t0 > 15000) resolve(); else setTimeout(check, 150); };
    check();
  }), []);
  // The hands-on lines (Finn's go, the professor's replies, the praise) in turn, never over each other
  // (was: "Good catch!" and "Nice work!" both started when fixing Finn's item finished the box)
  const lineChain = useRef<Promise<unknown>>(Promise.resolve());
  const queueLine = useCallback((run: () => Promise<unknown> | void) => {
    const next = lineChain.current.then(whenQuiet).then(run).catch(() => {});
    lineChain.current = next;
    return next;
  }, [whenQuiet]);
  const onBox = (id: string) => playerRef.current.activeId === id;   // still on that hands-on box

  // Mistakes steer the box: the same item wrong twice → the professor explains why it goes where it does,
  // the hand shows that item, and it counts as a struggle for the topic (recap, tutor, editor stats)
  const mistakeCounts = useRef(new Map<string, number>());   // `${box}|${item}` → wrong moves
  const steppedIn = useRef(new Map<string, Set<string>>());  // box → items already explained
  const onActivityMistake = useCallback((id: string, m: ActivityMistake) => {
    track('tutor_decision', { action: 'activity_wrong', item: m.label.slice(0, 80) });
    const key = `${id}|${m.item}`;
    const n = (mistakeCounts.current.get(key) ?? 0) + 1;
    mistakeCounts.current.set(key, n);
    const done = steppedIn.current.get(id) ?? new Set<string>();
    if (n < STEP_IN_AFTER || done.has(m.item) || done.size >= STEP_IN_MAX || yourTurnRef.current !== id || tutorBusyRef.current) return;
    done.add(m.item);
    steppedIn.current.set(id, done);
    const box = deck.slides[playerRef.current.slideIndex]?.elements.find((e) => e.id === id);
    const order = box?.type === 'activity' && box.kind === 'order';
    track('tutor_decision', { action: 'activity_help', item: m.item.slice(0, 80) }, { confusion_marks: 1 });
    setActivityGuides((g) => ({ ...g, [id]: order ? m.correct : m.item }));
    setActivityHint((h) => h + 1);
    cuesRef.current.stop();   // (a line still going, like Finn's)
    tutor.ask(order ? `${m.item} first? (${n} tries)` : `${m.item} → ${m.chosen}? (${n} tries)`,
      slideContext() + (order
        ? `\nThe learner is doing the hands-on activity and has tapped "${m.item}" too early ${n} times; what comes next is "${m.correct}". They're stuck, so this time it's fine to say it: in 1-2 short, kind sentences, explain why "${m.correct}" has to happen before "${m.item}". No question at the end.`
        : `\nThe learner is doing the hands-on activity and has put "${m.item}" in "${m.chosen}" ${n} times; it belongs in "${m.correct}". They're stuck, so this time it's fine to say where it goes: in 1-2 short, kind sentences, explain WHY "${m.item}" belongs in "${m.correct}" (the reason, from the lesson). No question at the end.`),
      { asker: '🖐 Hands-on', remember: `(The learner kept getting "${m.item}" wrong in the hands-on activity; the professor explained it.)` });
  }, [track, deck, tutor, slideContext]);

  // Finn's go in a hands-on box: he says what he did; the professor reacts when the learner sorts it out
  const finnMovesRef = useRef(finnMoves);
  finnMovesRef.current = finnMoves;
  const finnSpoken = useRef(new Set<number>());   // moves already spoken (a box drawn again re-applies its move silently)
  const onFinn = useCallback((id: string, e: FinnEvent) => {
    const name = learnerName.trim();
    if (e.type === 'applied') {
      const nonce = finnMovesRef.current[id]?.nonce;
      if (nonce === undefined || finnSpoken.current.has(nonce)) return;
      finnSpoken.current.add(nonce);
      track('tutor_decision', { action: 'activity_finn', item: e.item.slice(0, 80) });
      // the professor's replies, ready for when the learner gets to it
      if (e.correct) cuesRef.current.preload(goodCatch(e.item, e.correct, name));
      cuesRef.current.preload(e.guess ? NICE_TRY : TAKE_ANOTHER_LOOK);
      queueLine(async () => {
        if (!onBox(id)) return;
        setClassmateSaying(true);
        await cuesRef.current.play({ text: finnHandsOnLine(e), who: 'classmate' });
        setClassmateSaying(false);
      });
    } else if (e.type === 'fixed') {
      track('tutor_decision', { action: 'activity_finn_caught', item: e.item.slice(0, 80) });
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: goodCatch(e.item, e.group, name) }) : undefined));
    } else if (e.type === 'revealed') {
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: NICE_TRY }) : undefined));
    } else if (e.type === 'stuck') {
      setActivityHint((h) => h + 1);
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: TAKE_ANOTHER_LOOK }) : undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerName, track, queueLine]);

  // Finn's plan for each hands-on box on a slide, made when the slide starts (so his line is ready to say)
  const finnPlans = useRef(new Map<string, Omit<FinnMove, 'nonce'>>());
  useEffect(() => {
    const s = deck.slides[player.slideIndex];
    const boxes = (s?.elements ?? []).filter((e): e is ActivityElement => e.type === 'activity' && activityReady(e));
    if (!boxes.length) return;
    // a fresh visit: no move from last time, no guide, mistakes counted again
    setFinnMoves((m) => { const n = { ...m }; for (const b of boxes) delete n[b.id]; return n; });
    setActivityGuides((g) => { const n = { ...g }; for (const b of boxes) delete n[b.id]; return n; });
    for (const b of boxes) {
      finnPlans.current.delete(b.id);
      steppedIn.current.delete(b.id);
      for (const k of [...mistakeCounts.current.keys()]) if (k.startsWith(`${b.id}|`)) mistakeCounts.current.delete(k);
      if (!classmateOnRef.current) continue;
      const items = b.items ?? [];
      const pick = Math.floor(Math.random() * items.length);
      if (b.kind === 'sort' && items.length >= 3 && (b.groups?.length ?? 0) >= 2) {
        const groups = b.groups!;
        const right = items[pick].group ?? 0;
        const group = (right + 1 + Math.floor(Math.random() * (groups.length - 1))) % groups.length;
        finnPlans.current.set(b.id, { item: pick, group });
        cuesRef.current.preload(finnHandsOnLine({ item: items[pick].text, group: groups[group] }), 'classmate');
      } else if (b.kind === 'cards' && items.length >= 2 && items[pick].back) {
        fetch('/api/classmate', {
          method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ guess: { front: items[pick].text, back: items[pick].back } }), signal: AbortSignal.timeout(8000),
        }).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (!d?.guess) return;
          finnPlans.current.set(b.id, { item: pick, guess: d.guess });
          cuesRef.current.preload(finnHandsOnLine({ item: items[pick].text, guess: d.guess }), 'classmate');
        }).catch(() => {});
      }
    }
  }, [player.slideIndex, deck]);

  const onActivityDone = useCallback((id: string) => {
    activitiesDone.current.add(id);
    activitiesSolved.current.add(id);
    setSettledTick((n) => n + 1);
    const began = turnStarted.current.get(id);
    turnStarted.current.delete(id);
    track('tutor_decision', { action: 'activity_done', ...(began ? { seconds: Math.round((Date.now() - began) / 1000) } : {}) });
    if (yourTurnRef.current !== id) return;   // done while the professor was still explaining: the lesson just carries on
    setYourTurn(null);
    // after the professor (an explanation, a reply to Finn) has finished, not over them
    queueLine(() => playCue({ text: praise })).then(() => { if (playerRef.current.activeId === id) playerRef.current.nextClip(); });
  }, [track, playCue, praise, queueLine]);
  const skipActivity = () => {
    const id = yourTurnRef.current;
    if (!id) return;
    tracking.track('tutor_decision', { action: 'activity_skip' });
    activitiesDone.current.add(id);
    setSettledTick((n) => n + 1);
    setYourTurn(null);
    cuesRef.current.stop();   // Finn (or a reply) mid-line: not over what comes next
    playerRef.current.nextClip();
  };
  // Back on a hands-on slide (going back, or starting over): the lesson waits for it again
  useEffect(() => {
    for (const e of deck.slides[player.slideIndex]?.elements ?? []) {
      if (e.type === 'activity') { activitiesDone.current.delete(e.id); activitiesSolved.current.delete(e.id); }
    }
  }, [player.slideIndex, deck]);
  // Moved on some other way (a command, a jump): no longer their turn
  useEffect(() => {
    if (yourTurn && player.activeId !== yourTurn) { setYourTurn(null); cuesRef.current.stop(); }   // (and Finn's hands-on line, if still going)
  }, [yourTurn, player.activeId, player.slideIndex]);

  // The camera bubble: yellow for a raised hand (for a few seconds), then what the face shows
  const [, tick] = useState(0);
  const handShowing = Date.now() - handUpAt < HAND_RING_MS;
  useEffect(() => {
    if (!handUpAt) return;
    const t = setTimeout(() => tick((n) => n + 1), HAND_RING_MS);   // turn the yellow off again
    return () => clearTimeout(t);
  }, [handUpAt]);
  const cameraSees: CameraSees =
    emotionError || presenceError ? 'error'
      : !emotionReady ? 'starting'
        : handShowing ? 'hand'
          : !present ? 'away'
            : faceLearning ? 'learning'   // the first ~10 s: learning their normal face
            : liveFace === 'confused' ? 'confused'
              : liveFace === 'bored' ? 'bored'
                : 'here';

  // Keyboard: → next clip, Shift+→ / PageDown next slide, ← previous slide,
  // space pause/resume, R repeat, S simpler
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      // Typing, or keys meant for a control (Space on a button, a hands-on box): not lesson shortcuts
      const t = e.target as HTMLElement | null;
      // The self-check: 1 got it, 2 kind of, 3 lost me
      if (selfCheck && !variant && ['1', '2', '3'].includes(e.key) && t?.tagName !== 'INPUT') { answerSelfCheck(e.key === '1' ? 'got' : e.key === '2' ? 'kind' : 'lost'); return; }
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest?.('[data-activity]'))) return;
      if (t?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;   // the button's own click (was: clicked AND pause/resume)
      if (e.key === 'ArrowRight' && e.shiftKey) player.nextSlide();
      else if (e.key === 'ArrowRight') player.nextClip();
      else if (e.key === 'PageDown') player.nextSlide();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') player.prevSlide();
      else if (e.key === ' ') { e.preventDefault(); if (player.status === 'paused') player.resume(); else player.pause(); }
      else if (e.key.toLowerCase() === 'r') player.repeat();
      else if (e.key.toLowerCase() === 's') player.simplify();
      else if (e.key.toLowerCase() === 'l') confused();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, player, confused, selfCheck, variant, answerSelfCheck]);

  // What the slide shows right now: the slide, the helper it morphed into, or
  // the element being explained, focused and in plain words
  const baseSlide = deck.slides[player.slideIndex];
  const focusId = player.mode === 'plain' ? player.activeId : null;
  const shownSlide = useMemo(() => {
    if (!MORPH_HELPERS || !baseSlide) return baseSlide;
    if (variant?.slide) return variant.slide;   // the slide's own helper
    if (variant) return helperSlide(baseSlide, variant);
    if (player.mode === 'plain') return focusSlide(baseSlide, focusId) ?? baseSlide;
    return baseSlide;
  }, [baseSlide, variant, player.mode, focusId]);

  function startLesson() {
    setStarted(true);
    const name = learnerName.trim();
    try { localStorage.setItem('learnerName', name); } catch { /* private mode */ }
    // A name: a personal hello (spoken live); otherwise the recorded intro
    (name ? cues.play({ text: greeting(name) }) : cues.play('cue_intro')).finally(() => setIntroDone(true));
  }

  if (!started) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">
        {preview && <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold">{deck.source === 'ai' ? 'Preview of the AI deck' : 'Preview of the saved draft'}</div>}
        <h1 className="text-4xl font-bold text-center">{deck.title}</h1>
        <p className="text-slate-300 text-center max-w-md">Turn your sound on. Ask the professor anything, or say &quot;next&quot;, &quot;next slide&quot;, &quot;repeat&quot; or &quot;simpler please&quot; at any time.</p>
        <label className="flex flex-col items-center gap-1 text-sm text-slate-300">
          What should Professor Marine call you? (optional)
          <input
            value={learnerName}
            onChange={(e) => setLearnerName(e.target.value.replace(/[^\p{L}\p{N} '.-]/gu, '').slice(0, 24))}
            onKeyDown={(e) => { if (e.key === 'Enter') startLesson(); }}
            autoFocus
            placeholder="Your first name"
            maxLength={24}
            className="px-3 py-2 rounded-lg bg-white/10 text-white text-center placeholder:text-white/40 outline-none focus:bg-white/15 w-56"
          />
        </label>
        <button
          onClick={startLesson}
          className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold"
        >
          Start Lesson
        </button>
      </main>
    );
  }

  const slide = deck.slides[player.slideIndex];
  // the end screen: the hardest topic, to go over again
  const hardestName = player.status === 'finished' ? hardestTopic(deck, topicOf, stateOf) : null;
  const finishedHardest = hardestName ? { name: hardestName, index: deck.slides.findIndex((s) => s.topic?.trim() === hardestName) } : null;
  const btn = 'px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white px-4 py-4">
      {showTranscript && (cues.saying
        ? <Transcript speaker={classmateSaying ? `${CLASSMATE_NAME} · classmate` : 'Professor Marine'} text={cues.saying} dialogue={tutor.history} />
        : tutor.speaking || tutor.thinking
          ? <Transcript speaker="Professor Marine · answering" text={tutor.exchange?.answer ?? ''} dialogue={earlierDialogue} />
          : !selfCheck && <Transcript speaker={player.mode === 'plain' ? 'Professor Marine · plain version' : 'Professor Marine'} text={player.captionText} getAudio={player.getAudio} dialogue={tutor.history} />)}
      <div className="text-xs uppercase tracking-widest text-cyan-200/70">
        {preview && <span className="mr-2 text-amber-300">Preview ·</span>}
        Topic {player.topicIndex + 1} of {player.topicCount} · Slide {player.slideIndex + 1} of {deck.slides.length}
        {player.mode === 'plain' && <span className="ml-2 text-amber-300">· plain version</span>}
        {player.status === 'finishing' && <span className="ml-2 text-emerald-300">· finishing the sentence, then listening</span>}
        {/* how far through the lesson */}
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden>
          <div className="h-full bg-cyan-300/70 rounded-full transition-[width] duration-700"
            style={{ width: `${player.status === 'finished' ? 100 : ((player.slideIndex + (player.clipCount ? Math.min(player.clipIndex, player.clipCount) / player.clipCount : 0)) / deck.slides.length) * 100}%` }} />
        </div>
      </div>

      {cameraOn && <CameraBubble sees={cameraSees} progress={handProgress} />}

      <div className="relative" data-bubble-avoid data-bubble-slide>
        {player.status === 'finished' ? (
          <div
            className="flex flex-col items-center justify-center gap-6 bg-white text-slate-900 rounded-2xl p-10 text-center"
            style={{ width: SLIDE_WIDTH, aspectRatio: '16 / 9' }}
          >
            <h2 className="text-3xl font-bold">That&apos;s the lesson{learnerName.trim() ? `, ${learnerName.trim()}` : ''}!</h2>
            {deck.recap && <p className="text-lg max-w-2xl">{deck.recap}</p>}
            {finishedHardest && (
              <p className="text-base text-slate-600 max-w-xl">
                <b>{finishedHardest.name}</b> was the trickiest part.{' '}
                <button className="underline text-cyan-700 hover:text-cyan-600 font-semibold"
                  onClick={() => { cues.stop(); player.goToSlide(finishedHardest.index); }}>Go over it again →</button>
              </p>
            )}
            <button onClick={() => {
              // a fresh lesson: Finn asks again, hands-on boxes wait again
              checked.current.clear(); activitiesDone.current.clear(); activitiesSolved.current.clear(); classmateTopics.current.clear(); classmateAsked.current = []; finnReady.current.clear();
              finnSpoken.current.clear(); mistakeCounts.current.clear(); steppedIn.current.clear();
              setSelfCheck(null); setYourTurn(null); cues.stop(); player.restart();
            }} className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold">Start over</button>
          </div>
        ) : (
          <SlideCanvas slide={shownSlide} width={SLIDE_WIDTH} activeId={variant ? helperActive : player.activeId} morph={MORPH_HELPERS} laser={laser} spotlight={SPOTLIGHT}
            interactive onActivityDone={onActivityDone} activityHint={activityHint}
            solvedActivities={activitiesSolved.current} settledActivities={activitiesDone.current} settledTick={settledTick} activitySounds={soundsOn} onActivityMistake={onActivityMistake}
            finnMoves={finnMoves} onFinn={onFinn} activityGuides={activityGuides} />
        )}
        {variant && !MORPH_HELPERS && <VariantOverlay variant={variant} onDone={closeVariant} />}
        {variant && MORPH_HELPERS && (
          <button
            onClick={closeVariant}
            className="absolute bottom-3 right-3 z-20 px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-semibold shadow-lg"
            aria-label="Another way to see it: back to the lesson"
          >
            Got it, back to the lesson →
          </button>
        )}
        {selfCheck && !variant && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm rounded-2xl" role="dialog" aria-label="How did that go?">
            <div className="bg-white text-slate-900 rounded-2xl p-8 text-center shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">How did that section go?</h3>
              <div className="flex gap-4 justify-center">
                {([['got', '😀', 'Got it'], ['kind', '😐', 'Kind of'], ['lost', '😕', 'Lost me']] as const).map(([r, emoji, label]) => (
                  <button key={r} onClick={() => answerSelfCheck(r)} className="flex flex-col items-center gap-1 px-5 py-4 rounded-xl border-2 border-slate-200 hover:border-cyan-500 hover:bg-cyan-50">
                    <span className="text-4xl">{emoji}</span>
                    <span className="font-semibold">{label}</span>
                    <kbd className="text-[10px] text-slate-400 font-mono">{r === 'got' ? 1 : r === 'kind' ? 2 : 3}</kbd>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">Or just say it (or press 1, 2 or 3).</p>
            </div>
          </div>
        )}
        {askingHelp && !variant && !selfCheck && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 text-white text-sm shadow-lg" role="dialog" aria-label="The professor is checking in">
            <span>{askingHelp === 'confused' ? 'Another way to see it?' : 'Pick up the pace?'}</span>
            <button className="px-3 py-1 rounded-full bg-cyan-500 hover:bg-cyan-400 font-semibold" onClick={() => answerCheckInButton(true)}>
              {askingHelp === 'confused' ? 'Yes, show me' : 'Yes'}
            </button>
            <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => answerCheckInButton(false)}>No thanks</button>
          </div>
        )}
        {/* top-left: the bottom of the slide is where hands-on boxes have their controls (was: Finn's chip covered the slider) */}
        <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5 pointer-events-none">
          {yourTurn && !variant && !selfCheck && (
            <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 text-white text-sm shadow-lg" role="status">
              <span>🖐 Your turn: try it on the slide</span>
              <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={skipActivity}>Skip</button>
            </div>
          )}
          {classmateSaying && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-300 text-slate-900 text-sm font-semibold shadow-lg animate-pulse" role="status">
              <span aria-hidden>🙋</span> {CLASSMATE_NAME} {yourTurn ? 'is having a go…' : 'asks…'}
            </div>
          )}
        </div>
        {finnWaiting && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 text-white text-sm shadow-lg" role="dialog" aria-label={`Is ${CLASSMATE_NAME} right?`}>
            <span>Is {CLASSMATE_NAME} right?</span>
            <button className="px-3 py-1 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold" onClick={() => finnVerdict(`Not quite, ${CLASSMATE_NAME} is wrong.`, 'button')}>Not quite!</button>
            <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => finnVerdict(`Yes, ${CLASSMATE_NAME} is right.`, 'button')}>He&apos;s right</button>
            <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => finnVerdict("I'm not sure.", 'button')}>Not sure</button>
          </div>
        )}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/85 text-white text-sm shadow-lg" role="status">
            {toast}
          </div>
        )}
      </div>

      {/* clip dots: one per spoken element on this slide */}
      <div className="flex gap-1.5 h-2" aria-hidden>
        {Array.from({ length: player.clipCount }, (_, i) => (
          <span key={i} className={`w-6 h-1.5 rounded-full ${i < player.clipIndex ? 'bg-cyan-300' : i === player.clipIndex ? 'bg-cyan-300 animate-pulse' : 'bg-white/20'}`} />
        ))}
      </div>

      {/* The question and the professor's answer, while it's being answered */}
      {tutor.exchange && (
        <div className="w-full max-w-3xl rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-sm relative" role="status" data-bubble-avoid>
          <button className="absolute top-2 right-3 text-white/50 hover:text-white" onClick={tutor.clearExchange} aria-label="Close">✕</button>
          <p className={tutor.exchange.asker ? 'text-amber-200' : 'text-cyan-200/90'}><b>{tutor.exchange.asker ?? 'You'}:</b> {tutor.exchange.question}</p>
          <p className="mt-1 text-white/90">
            <b>Professor Marine:</b>{' '}
            {tutor.thinking && !tutor.exchange.answer ? <span className="animate-pulse">thinking…</span> : tutor.exchange.answer}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2" data-bubble-avoid>
        <button className={btn} onClick={player.prevSlide} disabled={player.slideIndex === 0}>⏮ Previous slide</button>
        {player.status === 'paused'
          ? <button className={btn} onClick={player.resume} disabled={!!yourTurn} title={yourTurn ? 'Your turn: finish the hands-on box, or Skip' : undefined}>▶ Resume</button>
          : <button className={btn} onClick={player.pause} disabled={player.status === 'finished'}>⏸ Pause</button>}
        <button className={btn} onClick={player.nextClip}>⏭ Next</button>
        <button className={btn} onClick={player.nextSlide}>⏩ Next slide</button>
        <button className={btn} onClick={player.repeat}>⟲ Repeat</button>
        <button className={btn} onClick={() => handleText('simpler please')}>Simpler please</button>
        <button className={btn} onClick={() => confused()} title="Another way to see it">😕 I&apos;m lost</button>
        <button
          className={`${btn} ${micStatus === 'listening' ? 'bg-red-500/80 hover:bg-red-500' : ''}`}
          onClick={talk}
          disabled={micStatus === 'processing'}
        >
          {micStatus === 'listening' ? '● Listening…' : micStatus === 'processing' ? '…' : '🎤 Talk'}
        </button>
        {(interruptOn || micStatus === 'listening') && <MicMeter levelRef={levelRef} listening={micStatus === 'listening'} />}
        {cameraOn && (
          <span className="text-xs text-white/70">
            {emotionError || presenceError ? `⚠ camera unavailable (${emotionError || presenceError})` : !emotionReady ? 'starting…' : present ? '👤 here' : '🚫 away'}
            {mood && ` · ${mood === 'confused' ? '😕 puzzled' : mood === 'bored' ? '😐 quiet' : '🙂'}`}
          </span>
        )}
        {/* The on/off switches, in one menu (was: five more buttons, so the controls took two rows) */}
        <div className="relative" ref={optionsRef}>
          <button className={`${btn} ${optionsOpen ? 'bg-white/25' : ''}`} onClick={() => setOptionsOpen((o) => !o)} aria-expanded={optionsOpen}
            title="Interrupt, camera, Finn, sounds, transcript">
            ⚙ Options
            {/* what's on, at a glance */}
            <span className="ml-1.5 text-xs opacity-80">{[interruptOn && '🎙', cameraOn && '📷', classmateOn && '🙋', soundsOn && '🔔', showTranscript && '💬'].filter(Boolean).join('')}</span>
          </button>
          {optionsOpen && (
            <div className="absolute bottom-full mb-2 right-0 z-30 w-72 rounded-xl bg-slate-900/95 border border-white/15 shadow-2xl p-2 flex flex-col gap-1" role="menu">
              {([
                ['🎙', 'Interrupt', 'Talk over the professor any time (uses the microphone)', interruptOn, () => {
                  setInterruptOn((on) => !on);
                  if (!interruptOn) say('Interrupt on: just start talking and the professor will finish the sentence and listen.');
                }],
                ['📷', 'Camera', 'Raise your hand to ask; the professor notices if you look lost or step away. Stays on this device.', cameraOn, () => {
                  setCameraOn((on) => !on);
                  if (!cameraOn) say('Camera on: raise your hand to ask, and the professor notices if you look lost or step away. Nothing leaves your device.');
                }],
                ['🙋', CLASSMATE_NAME, 'Your AI classmate: asks questions, has a go at the hands-on activities', classmateOn, () => setClassmateOn((v) => !v)],
                ['🔔', 'Sounds', 'Little sounds in the hands-on activities', soundsOn, toggleSounds],
                ['💬', 'Transcript', 'The words being said, top right', showTranscript, () => setShowTranscript((v) => !v)],
              ] as const).map(([icon, name, hint, on, toggle]) => (
                <button key={name} role="menuitemcheckbox" aria-checked={on} onClick={toggle}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/10 text-left">
                  <span className="text-lg" aria-hidden>{icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{name}</span>
                    <span className="block text-[11px] text-white/55 leading-tight">{hint}</span>
                  </span>
                  <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-white/20'}`} aria-hidden>
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (typed.trim()) handleText(typed); setTyped(''); }}
          className="flex"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder='Ask a question, or "next"…'
            maxLength={500}
            className="px-3 py-2 rounded-l-lg bg-white/10 placeholder:text-white/40 text-sm outline-none focus:bg-white/15 w-44"
          />
          <button className="px-3 py-2 rounded-r-lg bg-cyan-500/80 hover:bg-cyan-500 text-sm font-medium">Send</button>
        </form>
      </div>
      <footer className="text-xs text-white/40" data-bubble-avoid>
        <Link href="/sources" className="underline hover:text-white/70">View sources</Link>
      </footer>
    </main>
  );
}
