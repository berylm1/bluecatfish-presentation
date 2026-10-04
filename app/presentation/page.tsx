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
import { describeForTutor, type SelfCheckRating } from '@/lib/learnerState';
import { topicIndexes } from '@/lib/canvas/queue';
import { CUE_TEXT, type CueKey } from '@/lib/canvas/cues';
import { loadDeck, type Loaded } from '@/lib/canvas/loadDeck';
import { DEFAULT_LESSON } from '@/lib/canvas/lessons';
import type { Deck } from '@/lib/canvas/types';
import { learnerHeaders } from '@/lib/learnerSession';
import { focusSlide, helperSlide } from '@/lib/canvas/morph';

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lesson = params.get('lesson') || DEFAULT_LESSON.id;
    const pv = params.get('preview');
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
  return <Player deck={loaded.deck} preview={loaded.preview} />;
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

function Player({ deck, preview }: { deck: Deck; preview: boolean }) {
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [interruptOn, setInterruptOn] = useState(false);   // talk over the professor (opt-in: opens the mic)
  const [cameraOn, setCameraOn] = useState(false);         // emotion check-in, presence, hand raise (opt-in)
  const [showTranscript, setShowTranscript] = useState(true);   // top-right text of what's being said
  const [variant, setVariant] = useState<Variant | null>(null);
  const [mood, setMood] = useState<LearnerEmotion | null>(null);
  const [introDone, setIntroDone] = useState(false);
  // Between topics: "How did that section go?" (from = last slide of the topic, to = where next)
  const [selfCheck, setSelfCheck] = useState<{ from: number; to: number } | null>(null);
  const checked = useRef(new Set<number>());   // topic-end slides already asked about
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicOf = useMemo(() => topicIndexes(deck.slides), [deck]);
  const player = useDeckPlayer(deck, started && introDone, {
    holdBefore: (from, to) => !checked.current.has(from) && (to >= deck.slides.length || topicOf[to] !== topicOf[from]),
    onHold: (from, to) => { setSelfCheck({ from, to }); cuesRef.current?.play('cue_selfCheck'); },
  });
  const tutor = useTutor();
  const cues = useCues(started);
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
    return s ? s.elements.map((e) => (e.type === 'text' ? e.text : e.alt ? `[image: ${e.alt}]` : '')).filter(Boolean).join(' | ') : '';
  }, [deck]);
  const slideContext = useCallback(() => {
    const p = playerRef.current;
    const s = deck.slides[p.slideIndex];
    if (!s) return deck.title;
    const speaking = s.elements.find((e) => e.id === p.activeId);
    return `Lesson: ${deck.title}. Topic: ${s.topic ?? ''}. On screen: ${slideText(p.slideIndex)}.` +
      (speaking?.say ? ` The professor was just saying: "${speaking.say}"` : '') +
      describeForTutor(tracking.state());
  }, [deck, slideText, tracking]);

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

  /** A question (not a command): the professor answers, then the lesson carries on. */
  const answer = useCallback(async (question: string) => {
    tracking.track('tutor_question', { question: question.slice(0, 300) }, { questions: 1 });
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    // If the question is about something one of the authored slides covers,
    // show that slide while the professor answers
    findVariant('confused', question, question).then((slide) => {
      if (!slide || !tutorBusyRef.current) return;
      tracking.track('tutor_decision', { action: 'slide_with_answer', title: slide.title });
      variantMode.current = 'answer';
      setVariant(slide);
    });
    const { decision, superseded } = await tutor.ask(question, slideContext());
    if (variantMode.current === 'answer') setVariant(null);
    if (superseded) return;   // talked over the answer: the next turn decides what happens
    if (decision) tracking.track('tutor_decision', { action: decision });
    const now = playerRef.current;
    if (decision === 'simplify') now.simplify();
    else if (decision === 'advance') now.nextSlide();
    else if (decision === 'repeat') now.repeat();
    else now.resume();
  }, [tutor, slideContext, tracking, findVariant]);

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
    // A live explanation (the professor teaches from the slide) beats the stored clip
    const ok = await cues.play(found.live_narration
      ? { text: found.live_narration }
      : { text: found.narration, url: found.audio_url });
    if (ok) closeVariant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues]);

  const confused = useCallback(async (after?: () => void, mood?: 'confused' | 'frustrated') => {
    tracking.track('confusion_click', {}, { confusion_marks: 1 });
    const p = playerRef.current;
    if (SPEAKING.includes(p.status)) p.pause();
    const s = deck.slides[p.slideIndex];
    const state = mood ?? (tracking.state().last_state === 'frustrated' ? 'frustrated' : 'confused');
    const found = await findVariant(state, s?.topic ?? '', slideText(p.slideIndex), true);
    if (found) {
      tracking.track('tutor_decision', { action: 'variant', variant: found.variant, title: found.title, state });
      presentVariant(found, after);
      return;
    }
    tracking.track('tutor_decision', { action: 'plain' });
    act('cmd_simplify', () => playerRef.current.simplify());
  }, [deck, slideText, tracking, act, findVariant, presentVariant]);

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
  // 'narrated': the professor explains the slide itself. 'answer': it's up while
  // the professor answers a question, and goes away with the answer.
  const variantMode = useRef<'narrated' | 'answer'>('narrated');
  function closeVariant() {
    if (variantMode.current === 'answer') { setVariant(null); return; }   // the answer carries on; the lesson resumes after it
    cues.stop();
    setVariant(null);
    const after = variantAfter.current;
    variantAfter.current = null;
    // was: if (after) after(); — moving to another slide at once cut the morph back short
    if (after) { if (MORPH_HELPERS) setTimeout(after, MORPH_BACK_MS); else after(); }
    else playerRef.current.resume();
  }

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
  }, [deck, player, act, answer, confused, showSlide, tutor, tutorBusy, tracking, variant, cues, selfCheck, answerSelfCheck]);

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

  // The end: "Let's look back…", the recap, and a goodbye
  const { play: playCue, stop: stopCue } = cues;   // stable, unlike `cues` (which changes as lines start and stop)
  useEffect(() => {
    if (player.status !== 'finished') return;
    let cancelled = false;
    (async () => {
      if (!(await playCue('cue_conclusionIntro')) || cancelled) return;
      if (deck.recap && (!(await playCue({ text: deck.recap })) || cancelled)) return;
      await playCue('cue_conclusionOutro');
    })();
    return () => { cancelled = true; stopCue(); };
  }, [player.status, deck.recap, playCue, stopCue]);

  /* ------------------------------------------------ camera: the instructor notices */

  // The mic is mid-turn (it can be 'off' when interruptions are off: that's free)
  const micBusy = micStatus === 'listening' || micStatus === 'processing';

  // Emotion check-in: sustained confusion or boredom on camera → the professor
  // finishes the sentence, asks, and listens; "yes" helps, silence carries on.
  const onEmotion = useCallback((state: LearnerEmotion) => {
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
  const { ready: emotionReady, error: emotionError, live: liveFace } = useEmotionWatcher(cameraOn && started, onEmotion);

  // Hand raise: stop at the end of the sentence, "Do you have a question?", listen
  const [handUpAt, setHandUpAt] = useState(0);   // for the camera bubble's yellow ring
  const onHandRaised = useCallback(() => {
    setHandUpAt(Date.now());
    if (!started || micBusy || variant) return;
    tracking.track('hand_raise');
    resumeAfterTurn.current = true;
    const ask = () => cues.play('cue_handRaise').then((ok) => { if (ok) talk(); });
    if (tutorBusy) { tutor.finishSentence(); ask(); }
    else playerRef.current.interrupt(ask);
  }, [started, micStatus, variant, tracking, cues, talk, tutorBusy, tutor]);
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
            : liveFace === 'confused' ? 'confused'
              : liveFace === 'bored' ? 'bored'
                : 'here';

  // Keyboard: → next clip, Shift+→ / PageDown next slide, ← previous slide,
  // space pause/resume, R repeat, S simpler
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
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
  }, [started, player, confused]);

  // What the slide shows right now: the slide, the helper it morphed into, or
  // the element being explained, focused and in plain words
  const baseSlide = deck.slides[player.slideIndex];
  const focusId = player.mode === 'plain' ? player.activeId : null;
  const shownSlide = useMemo(() => {
    if (!MORPH_HELPERS || !baseSlide) return baseSlide;
    if (variant) return helperSlide(baseSlide, variant);
    if (player.mode === 'plain') return focusSlide(baseSlide, focusId) ?? baseSlide;
    return baseSlide;
  }, [baseSlide, variant, player.mode, focusId]);

  if (!started) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">
        {preview && <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold">{deck.source === 'ai' ? 'Preview of the AI deck' : 'Preview of the saved draft'}</div>}
        <h1 className="text-4xl font-bold text-center">{deck.title}</h1>
        <p className="text-slate-300 text-center max-w-md">Turn your sound on. Ask the professor anything, or say &quot;next&quot;, &quot;next slide&quot;, &quot;repeat&quot; or &quot;simpler please&quot; at any time.</p>
        <button
          onClick={() => {
            setStarted(true);
            cues.play('cue_intro').finally(() => setIntroDone(true));
          }}
          className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold"
        >
          Start Lesson
        </button>
      </main>
    );
  }

  const slide = deck.slides[player.slideIndex];
  const btn = 'px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white px-4 py-4">
      {showTranscript && (cues.saying
        ? <Transcript speaker="Professor Marine" text={cues.saying} dialogue={tutor.history} />
        : tutor.speaking || tutor.thinking
          ? <Transcript speaker="Professor Marine · answering" text={tutor.exchange?.answer ?? ''} dialogue={earlierDialogue} />
          : !selfCheck && <Transcript speaker={player.mode === 'plain' ? 'Professor Marine · plain version' : 'Professor Marine'} text={player.captionText} getAudio={player.getAudio} dialogue={tutor.history} />)}
      <div className="text-xs uppercase tracking-widest text-cyan-200/70">
        {preview && <span className="mr-2 text-amber-300">Preview ·</span>}
        Topic {player.topicIndex + 1} of {player.topicCount} · Slide {player.slideIndex + 1} of {deck.slides.length}
        {player.mode === 'plain' && <span className="ml-2 text-amber-300">· plain version</span>}
        {player.status === 'finishing' && <span className="ml-2 text-emerald-300">· finishing the sentence, then listening</span>}
      </div>

      {cameraOn && <CameraBubble sees={cameraSees} progress={handProgress} />}

      <div className="relative" data-bubble-avoid data-bubble-slide>
        {player.status === 'finished' ? (
          <div
            className="flex flex-col items-center justify-center gap-6 bg-white text-slate-900 rounded-2xl p-10 text-center"
            style={{ width: 'min(80vw, calc(80vh * 16 / 9))', aspectRatio: '16 / 9' }}
          >
            <h2 className="text-3xl font-bold">That&apos;s the lesson!</h2>
            {deck.recap && <p className="text-lg max-w-2xl">{deck.recap}</p>}
            <button onClick={() => { checked.current.clear(); setSelfCheck(null); cues.stop(); player.restart(); }} className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold">Start over</button>
          </div>
        ) : (
          <SlideCanvas slide={shownSlide} activeId={variant ? null : player.activeId} morph={MORPH_HELPERS} />
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
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">Or just say it.</p>
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
          <p className="text-cyan-200/90"><b>You:</b> {tutor.exchange.question}</p>
          <p className="mt-1 text-white/90">
            <b>Professor Marine:</b>{' '}
            {tutor.thinking && !tutor.exchange.answer ? <span className="animate-pulse">thinking…</span> : tutor.exchange.answer}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2" data-bubble-avoid>
        <button className={btn} onClick={player.prevSlide} disabled={player.slideIndex === 0}>⏮ Previous slide</button>
        {player.status === 'paused'
          ? <button className={btn} onClick={player.resume}>▶ Resume</button>
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
        <button
          className={`${btn} ${interruptOn ? 'bg-emerald-500/70 hover:bg-emerald-500' : ''}`}
          onClick={() => {
            setInterruptOn((on) => !on);
            if (!interruptOn) say('Interrupt on: just start talking and the professor will finish the sentence and listen.');
          }}
          title="Talk over the professor any time (uses the microphone)"
        >
          🎙 Interrupt {interruptOn ? 'on' : 'off'}
        </button>
        {(interruptOn || micStatus === 'listening') && <MicMeter levelRef={levelRef} listening={micStatus === 'listening'} />}
        <button
          className={`${btn} ${cameraOn ? 'bg-emerald-500/70 hover:bg-emerald-500' : ''}`}
          onClick={() => {
            setCameraOn((on) => !on);
            if (!cameraOn) say('Camera on: raise your hand to ask, and the professor notices if you look lost or step away. Nothing leaves your device.');
          }}
          title="Hand raise, “you look puzzled” check-ins and pause-when-away (camera stays on this device)"
        >
          📷 Camera {cameraOn ? 'on' : 'off'}
        </button>
        {cameraOn && (
          <span className="text-xs text-white/70">
            {emotionError || presenceError ? `⚠ camera unavailable (${emotionError || presenceError})` : !emotionReady ? 'starting…' : present ? '👤 here' : '🚫 away'}
            {mood && ` · ${mood === 'confused' ? '😕 puzzled' : mood === 'bored' ? '😐 quiet' : '🙂'}`}
          </span>
        )}
        <button className={`${btn} ${showTranscript ? 'bg-white/20' : ''}`} onClick={() => setShowTranscript((v) => !v)} title="Show the words being said (top right)">
          💬 Transcript {showTranscript ? 'on' : 'off'}
        </button>
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
