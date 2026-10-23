'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { useDeckPlayer } from '@/components/canvas/useDeckPlayer';
import { useListener } from '@/components/canvas/useListener';
import Transcript from '@/components/canvas/Transcript';
import ClassChat, { ClassmatesPanel, speakerOf, Avatar, type ChatEntry, type Speaker } from '@/components/canvas/ClassChat';
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
import { CLASSMATES, classmateNamed, type ClassmateId } from '@/lib/classmates';
import type { ActivityMistake, FinnEvent, FinnMove } from '@/components/canvas/Activity';
import { focusSlide, helperSlide, ownHelper } from '@/lib/canvas/morph';
import { isIntroId } from '@/lib/canvas/intro';
import { activityReady, shownWords, speakingOrder, spokenText } from '@/lib/canvas/queue';
import { answerBasis, currentAudio, QUIZ_ASKED } from '@/lib/canvas/aiFields';
import { activePointer } from '@/lib/canvas/laser';
import type { ActivityElement, BankQuestion, Pointer, QuizQuestion, Slide, SlideElement } from '@/lib/canvas/types';
import { VOICE_SPEEDS, loadVoiceSpeed, setVoiceSpeed, type VoiceSpeed } from '@/lib/voiceSpeed';
import { lessonLength } from '@/lib/canvas/lessonLength';
import Quiz, { pickQuiz } from '@/components/canvas/Quiz';
import { lessonParts } from '@/lib/canvas/parts';
import { answerGist, areaIds, setAreaText, togetherSlide, TOGETHER_ID } from '@/lib/canvas/together';
import { preloadedDeck, studyLesson, studyPost, writeStudy, type StudyRecord } from '@/lib/study/client';
import { signals } from '@/lib/signals';
import { ConfusionMeter, questionSignal, snapshotPoints, type ConfusionLevel, type ConfusionSignal, type SavedMeter } from '@/lib/confusion';

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
  const [study, setStudy] = useState<StudyRecord | null>(null);   // in the online study (app/study): ?study=<their id>
  const [studyReady, setStudyReady] = useState(true);   // (in the study: the lesson waits for the group from the server)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('study')) {
      const s = studyLesson();
      if (!s) { setError('This lesson link is part of the study: start it from the study page (/study) on this browser.'); return; }
      // the group the server gave them (not what this browser says: it could be edited); offline: the browser's
      setStudyReady(false);
      studyPost<{ group?: StudyRecord['group'] }>('get', { id: s.id })
        .then((d) => setStudy(d.group ? { ...s, group: d.group } : s))
        .catch(() => setStudy(s))
        .finally(() => setStudyReady(true));
    }
    const lesson = params.get('lesson') || DEFAULT_LESSON.id;
    const pv = params.get('preview');
    const at = Number(params.get('slide'));
    if (Number.isInteger(at) && at > 1) setStartAt(at - 1);
    // (the study: the deck was loaded during the checks and quiz 1, app/study)
    const ahead = params.get('study') && !pv ? preloadedDeck(lesson) : null;
    (ahead ? Promise.resolve({ deck: ahead, preview: false }) : loadDeck(lesson, pv === 'ai' ? 'ai' : pv ? 'draft' : null))
      .then(setLoaded)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error || !loaded || !studyReady) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6 text-center">
        {error ? (
          <>
            <p className="text-lg text-red-200 max-w-md">{error}</p>
            {/study/.test(error) && <Link href="/study" className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold">Go to the study</Link>}
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-4 border-cyan-300/30 border-t-cyan-300 animate-spin" />
            <p className="text-slate-300">Getting the lesson ready… (the first time, this can take a few minutes)</p>
          </>
        )}
      </main>
    );
  }
  return <Player deck={loaded.deck} preview={loaded.preview} startAt={Math.min(startAt, loaded.deck.slides.length - 1)} study={study} />;
}

// "You lost me" and friends: the learner is confused, not just asking for simpler words
const CONFUSED = /\blost me\b|\bi'?m lost\b|\b(?:don'?t|do not|didn'?t) (?:understand|get it|get that|get this|follow)\b|\bconfus|\bwhat does (?:that|this|it) (?:even )?mean\b|^huh\b/i;
/**
 * The learner's call on Finn's deliberate mistake: caught it, agreed with it
 * (fooled), not sure, or something else (said in their own words: the
 * professor decides). The buttons say "Not quite, Finn is wrong.",
 * "Yes, Finn is right." and "I'm not sure.".
 */
function finnVerdictKind(verdict: string): 'caught' | 'fooled' | 'unsure' | 'other' {
  const t = verdict.toLowerCase().trim();
  if (!t || /\b(?:not sure|unsure|don'?t know|no idea|dunno|maybe|i guess|not certain)\b/.test(t)) return 'unsure';
  if (/\b(?:wrong|not (?:quite|right|true|correct)|isn'?t (?:right|true|correct)|incorrect|false|mistake|nope|nah)\b|^no\b/.test(t)) return 'caught';
  if (/\b(?:right|yes|yeah|yep|true|correct|agree)\b/.test(t)) return 'fooled';
  return 'other';
}

type FinnKind = 'caught' | 'fooled' | 'unsure';
// Follow-ups to a one-click answer on Finn (they say which, not why); then the learner's words lead
const FINN_FOLLOWUPS = 2;
const FINN_ASK: Record<FinnKind, string[]> = {
  caught: ['What makes you say that?', "Ooh, what do you think is actually true?", 'Interesting! What do you think the real answer is?'],
  fooled: ['What makes you think he’s right?', 'Tell me more. Why do you think so?'],
  unsure: ["That's okay! What's your best guess?", 'No problem. Which part are you not sure about?'],
};
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
// The learner caught Finn AND said what's right: the professor confirms it, without saying it all again (was: the AI was
// told not to repeat them, and still did: "Good catch! Actually, blue catfish are native to the Mississippi, Missouri…")
const FINN_CAUGHT_RIGHT = (you: string) => pickOne([
  `Good catch${you}! That's exactly right.`,
  `Good catch${you}! You've got it exactly right.`,
  `Spot on${you}! Good catch.`,
]) + ' ' + pickOne([`Easy mix-up, ${CLASSMATE_NAME}!`, `Nice try, ${CLASSMATE_NAME}. That one trips people up.`, `Don't worry, ${CLASSMATE_NAME}, easy one to mix up.`]);

/** Is the learner's answer on Finn's mistake complete, or is there a follow-up to ask? (On any failure: complete.) */
async function judgeFinn(mistake: string, truth: string, turns: { who: 'professor' | 'learner'; text: string }[]): Promise<{ kind: FinnKind | null; complete: boolean; said?: boolean; ask?: string }> {
  try {
    const res = await fetch('/api/classmate', {
      method: 'POST',
      headers: learnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ followup: { mistake, truth, turns } }),
      signal: AbortSignal.timeout(8000),
    });
    const d = res.ok ? await res.json() : null;
    return d ? { kind: d.kind ?? null, complete: d.complete !== false, said: d.said === true, ask: d.ask } : { kind: null, complete: true };
  } catch {
    return { kind: null, complete: true };
  }
}

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
// How often Finn's turn at a topic's end is a mistake for the learner to catch (else a question; 0 = never).
// The classmates take turns there (lib/classmates.ts turnAt): Maya, Finn, Leo, Finn… so Maya shows how asking goes first.
// was: 0.5 (only Finn, never his first turn)
// const FINN_MISTAKE_CHANCE = 1;   // (was: Finn's turns came in a fixed rotation, Maya, Finn, Leo, Finn (turnAt), and were always mix-ups; now classmateTurn and classmateLine decide, below)
// The question bank: how close (meaning, 0-1) a learner's question must be to a bank question for its answer
// slide to play, and to count as related (a classmate asks it next); up to BANK_FOLLOW_UPS related ones
const BANK_ANSWER_MIN = 0.62;
const BANK_RELATED_MIN = 0.42;
const BANK_FOLLOW_UPS = 2;
// "Back to the lesson" this soon after the answers began: the slide they asked on picks up where it was
// (they didn't stay for the answers); later, on to what comes next
const BACK_QUICK_MS = 5000;
// After a question, straight to the slide's hands-on box when the learner seems to get it (no instructions again)
const QUICK_TURN = 'Your turn! Give this one a go.';

/**
 * How often the classmates join in, from how often the learner asks (questions per topic so far this
 * lesson): a learner who rarely asks gets them at every topic's end, and two questions after one of
 * theirs; one who asks a lot, every third topic and one question after (a boost, not a crowd: was 3/2/1).
 * (learner_state: questions, classmate_turns)
 */
function classmateBudget(questions: number, topics: number): { every: number; followUps: number } {
  const rate = questions / Math.max(1, topics);
  if (rate < 0.5) return { every: 1, followUps: 2 };
  if (rate < 1.5) return { every: 2, followUps: 1 };
  return { every: 3, followUps: 1 };
}
/*
 * A classmate's turn at a topic's end, on top of that rhythm (classmateTurn, classmateLine):
 *   - the learner asked nothing in the topic and the bank has a question on it nobody asked: a classmate asks it
 *     (a good question they didn't think of, or didn't dare ask)
 *   - they asked: their question's follow-ups were the classmates' part; now and then one is still just curious
 *   - what's asked helps most where the learner is: if they struggled in the topic (mistakes in a hands-on box,
 *     "simpler please", "I'm lost", a puzzled face) the open question closest to what they struggled with, a
 *     checking or curious one first, and never a mix-up; if it went well, now and then Finn's mix-up to catch
 *     (a challenge), else a question from whoever has spoken least
 */
const CURIOUS_CHANCE = 0.25;   // a topic end that doesn't call for a classmate: how often one is curious anyway
const MIX_UP_EVERY = 3;        // Finn's mix-ups: at most every 3rd classmate turn (from the 2nd on), and only when the topic went well
/*
 * A classmate's moment in the middle of a topic (classmateMid), after a box's sentence is finished (the player waits there,
 * as for a hands-on box), when something calls for it:
 *   - they struggled on this slide ("simpler please", "I'm lost", "again", hands-on mistakes, a puzzled face): the topic's open
 *     question closest to it
 *   - the slide is about a question nobody has asked: now and then a classmate is curious (more often for a learner who rarely asks)
 * ("Kind of" / "Lost me" about a topic: its leftover question comes at that topic's end, after "another way?": lostQuestion.)
 * At most one a topic, never on its last slide (the topic's end has its own turn), and not soon after the learner asked or a
 * classmate spoke (a helping moment waits less than a curious one). Its question's answer slide plays, then the lesson carries on with the next box.
 */
const MID_COOLDOWN_MS = 45_000;        // a curious moment
const MID_HELP_COOLDOWN_MS = 12_000;   // one that helps (struggling here): sooner
// "Another way to see it": watched to the end, or this long before "back to the lesson", counts as using it
const HELPER_USED_MS = 8000;
const MID_RELATED_MIN = 0.45;   // how close (meaning, 0-1) the slide and the question must be for a curious moment
const MID_CHANCE: Record<number, number> = { 1: 0.3, 2: 0.18, 3: 0.08 };   // per box, by classmateBudget's rhythm (every 1, 2 or 3 topics)
// Short reactions, no AI: the classmates are in the room too
const FINN_THANKS = ['Oh! Right, thanks!', 'Ohh, I mixed that up. Thanks!', 'Got it. Thanks for catching that!'];
const FINN_OOPS = ['Oops, my bad!', 'Oh no, I got that one wrong. Sorry!'];
const SAME_QUESTION = ['Ooh, I was wondering that too!', 'Thanks, that helped me too.', 'Oh, cool. I didn\'t know that!'];
const REACT_CHANCE = 0.4;   // after the learner's question is answered (with no classmates' follow-ups), a classmate says so
const MIN_VISUAL_MS = 3000;
// The slide as big as fits with the header and the controls under it (was 80% of the screen height,
// so on a 1366×768 laptop the controls pushed the top of the slide off the screen)
/** Whether a CSS media query matches, kept up to date (false until mounted). */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setOn(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [query]);
  return on;
}

// (the two sizes are set in globals.css: wider on a phone, taller on a phone turned sideways)
// (--slide-max-w is narrower with the class chat beside the slide; --peek-h is the chat's latest line under the slide)
const SLIDE_WIDTH = 'min(var(--slide-max-w, 88vw), calc((100vh - var(--slide-chrome, 190px) - var(--peek-h, 0px)) * 16 / 9))';
// The top-right transcript: off, the class chat (ClassChat) has everything that's said, as a conversation
const SHOW_FLOATING_TRANSCRIPT = false;
/** The chat's latest slide entry, skipping the professor's own lines after it (its index, or -1) */
function slideEntryAt(c: ChatEntry[]): number {
  let j = c.length - 1;
  while (j >= 0 && c[j].kind === 'line' && (c[j] as { who: Speaker }).who === 'professor') j--;
  return j >= 0 && c[j].kind === 'slide' ? j : -1;
}
const SELF_CHECK_SAID: Record<SelfCheckRating, string> = { got: '😀 Got it', kind: '😐 Kind of', lost: '😕 Lost me' };
// The question + answer box under the slide: off, the transcript (top right) shows them instead
// (was: it made the page taller than the screen, so it scrolled). Still shown with the transcript off.
const ANSWER_BOX_UNDER_SLIDE = false;
// The recap's text on the end screen: off, the achievements are there instead (the professor says the recap, and the transcript shows it)
const SHOW_RECAP_ON_END = false;
// The spoken ending: false = the quick one (what they covered, their achievements, "Marine out!"); true = the old long recap
const SPOKEN_FULL_RECAP = false;

/** What the learner covered, in one quick line: the lesson's recap if it's the short kind, else its parts by name */
function shortRecap(deck: Deck): string {
  const r = deck.recap?.replace(/\s+/g, ' ').trim() ?? '';
  if (r && r.length <= 260 && /^you\b/i.test(r)) return /[.!?]$/.test(r) ? r : `${r}.`;
  const parts = [...new Set(deck.slides.map((s) => s.topic?.trim()).filter((t): t is string => !!t))];
  if (!parts.length) return '';
  return `You covered ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`;
}
const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '');

/** The ending, said once: what they covered, what they did, how long, and a sign-off */
function endingLine(a: { name: string; covered: string; solved: number; quiz: { right: number; of: number } | null; finn: boolean[]; questions: number; minutes: number }): string {
  const did: string[] = [];
  if (a.solved) did.push(a.solved === 1 ? 'solved a hands-on activity' : `solved ${a.solved} hands-on activities`);
  if (a.quiz) did.push(a.quiz.right === a.quiz.of ? 'got the entire quiz right' : `got ${a.quiz.right} of ${a.quiz.of} on the quiz`);
  const caught = a.finn.filter(Boolean).length;
  if (caught) did.push(caught === a.finn.length ? (caught === 1 ? `caught ${CLASSMATE_NAME}'s mix-up` : `caught all ${caught} of ${CLASSMATE_NAME}'s mix-ups`) : `caught ${caught} of ${CLASSMATE_NAME}'s ${a.finn.length} mix-ups`);
  if (a.questions) did.push(a.questions === 1 ? 'asked a great question' : `asked ${a.questions} great questions`);
  return [
    a.name ? `Great work, ${a.name}!` : 'Great work!',
    a.covered,
    did.length ? `You ${listed(did)}.` : '',
    a.minutes ? `You stayed locked in for ${a.minutes === 1 ? 'a whole minute' : `a big ${a.minutes} minutes`}.` : '',
    'Marine out!',
  ].filter(Boolean).join(' ');
}
// After "kind of" / "lost me" at the end of a part
const REPLAY_ASK_KIND = 'No problem. Want to see that part a different way?';
const REPLAY_ASK_LOST = "That's okay, it happens. Want me to show you that part a different way?";
// Cards, when the instructions don't already ask for a guess (said once per box)
const THINK_LINE = 'Before you flip one, take a second to guess the answer in your head.';
const EXCHANGE_HIDE_MS = 12000;   // the question + answer box under the slide goes away this long after the answer
const SKIP_LINE = "No problem. Here's how it goes.";
const SKIP_LOOK_MS = 1800;   // after that line, a moment to look at the answers before the lesson goes on
const FINN_HANDS_ON_DELAY_MS = 900;   // Finn's go in a hands-on box, this long after the learner's turn begins
const STEP_IN_AFTER = 2;              // the same item wrong this many times: the professor explains it
const STEP_IN_MAX = 2;                // at most this many explanations per hands-on box   // a board (or slide) shown with an answer stays up at least this long

/** How the learner did on Finn's deliberate mistake in a topic (for the ending). */
type FinnResult = { kind: 'caught' | 'fooled' | 'unsure' | 'other'; truth: string };

/** The topic the learner found hardest (by self-checks, "I'm lost"s, simpler/repeat requests, Finn's mistakes believed), or null if none was hard. */
function hardestTopic(deck: Deck, topicOf: number[], stateOf: (topic: number) => SectionState, finn?: ReadonlyMap<number, FinnResult>): string | null {
  let best: { name: string; score: number } | null = null;
  for (const topic of new Set(topicOf)) {
    const st = stateOf(topic);
    const fk = finn?.get(topic)?.kind;
    const score = (st.self_check === 'lost' ? 3 : st.self_check === 'kind' ? 1.5 : 0)
      + st.confusion_marks + 0.5 * (st.simplify_requests + st.repeats)
      + (fk === 'fooled' ? 1.5 : fk === 'unsure' ? 1 : 0);
    const name = deck.slides[topicOf.indexOf(topic)]?.topic?.trim();
    if (name && score >= 1 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

/** What a classmate says at a topic's end: a question, or (truth set: Finn) a mistake for the learner to catch. */
type FinnLine = { question: string; truth?: string; who: ClassmateId; bank?: BankQuestion };

/** What Finn says when he has a go in a hands-on box */
function finnHandsOnLine(e: { item: string; group?: string; guess?: string }): string {
  return e.guess ? `Ooh, I know this one! I bet it's ${e.guess}!` : `Ooh, let me help! ${e.item} goes in ${e.group}!`;
}
const goodCatch = (item: string, group: string, name: string) => `Good catch${name ? `, ${name}` : ''}! ${item} goes in ${group}.`;
const NICE_TRY = `Nice try, ${CLASSMATE_NAME}! Not quite.`;
const TAKE_ANOTHER_LOOK = `Hmm, almost! Take another look at where ${CLASSMATE_NAME} put his.`;

/** The hello with the learner's name: one clip, so there's no gap around the name. */
const greeting = (name: string) => `Hey ${name}! I'm Professor Marine. Let's dive in.`;

/** How the learner did on Finn's mistakes, in a few words for the end screen ("You caught 2 of Finn's 3 mix-ups"), or ''. */
function finnScore(finn: ReadonlyMap<number, FinnResult>): string {
  const all = [...finn.values()].filter((r) => r.kind !== 'other');   // (in their own words: the professor judged it, the page didn't)
  const caught = all.filter((r) => r.kind === 'caught').length;
  if (!all.length) return '';
  if (caught === all.length) return all.length === 1 ? `You caught ${CLASSMATE_NAME}'s mix-up.` : `You caught ${all.length === 2 ? 'both' : `all ${all.length}`} of ${CLASSMATE_NAME}'s mix-ups.`;
  return caught ? `You caught ${caught} of ${CLASSMATE_NAME}'s ${all.length} mix-ups.` : '';
}

/**
 * The end of the recap: the learner's name, how they did on Finn's mistakes,
 * what to look at again, and the right fact for a mistake they believed.
 */
function personalRecap(name: string, hardest: string | null, finn: ReadonlyMap<number, FinnResult> = new Map()): string {
  const results = [...finn.values()].filter((r) => r.kind !== 'other');
  const missed = results.filter((r) => r.kind === 'fooled' || r.kind === 'unsure');
  const caught = results.length - missed.length;
  const bits: string[] = [];
  bits.push(name ? `Nice work today, ${name}!` : '');
  if (results.length && !missed.length) bits.push(results.length === 1 ? `You caught ${CLASSMATE_NAME}'s mix-up, too. Sharp eyes!` : `And you caught every one of ${CLASSMATE_NAME}'s mix-ups. Sharp eyes!`);
  else if (caught) bits.push(`You caught ${caught} of ${CLASSMATE_NAME}'s ${results.length} mix-ups.`);
  if (hardest) bits.push(`${hardest} was the trickiest part${name ? ' for you' : ''}, so that's a great one to look at again.`);
  // One reminder (the first mistake they believed), in the professor's words: "Remember: <what's right>"
  const fact = missed[0]?.truth.trim().replace(/\s+/g, ' ');
  if (fact) bits.push(`And remember: ${/[.!?]$/.test(fact) ? fact : `${fact}.`}`);
  if (name && bits.length === 1) bits.push('You stuck with it the whole way.');
  return bits.filter(Boolean).join(' ');
}

/*
 * Continue where you left off: the slide a learner got to, kept in this
 * browser (per lesson) so closing the tab doesn't mean starting over. Also
 * how they did on Finn's mistakes (for the ending) and the topics Finn
 * already asked about. Never for editor previews; cleared at the end.
 */
const PROGRESS_DAYS = 14;   // older than this: start fresh
type Progress = { slideId: string; at: number; finn: [number, FinnResult][]; asked: number[]; mates?: MatesMemory; meter?: SavedMeter };
/** What the classmates remember (picked up with "Continue where you left off"; was: forgotten, so who spoke and what was hard started over) */
type MatesMemory = { who: ClassmateId[]; mixUp: number; struggles: [number, string[]][]; mid: number[]; shaky: number[]; carried: number[]; used?: number[] };
// (in the study: its own, so a lesson someone went through before isn't picked up again)
const progressKey = (lessonId: string) => { const s = studyLesson(); return `lessonProgress:${lessonId}${s ? `:study:${s.id}` : ''}`; };
function readProgress(deck: Deck): (Progress & { index: number }) | null {
  try {
    const p = JSON.parse(localStorage.getItem(progressKey(deck.lessonId)) ?? 'null') as Progress | null;
    if (!p || typeof p.slideId !== 'string' || Date.now() - p.at > PROGRESS_DAYS * 86_400_000) return null;
    // by id: if the lesson was edited since, the same slide wherever it is now (gone: start fresh)
    const index = deck.slides.findIndex((s) => s.id === p.slideId);
    // (what comes back from storage is checked: a broken or edited entry can't break the lesson)
    const KINDS = ['caught', 'fooled', 'unsure', 'other'];
    const finn = (Array.isArray(p.finn) ? p.finn : []).filter((e): e is [number, FinnResult] =>
      Array.isArray(e) && Number.isInteger(e[0]) && KINDS.includes(e[1]?.kind) && typeof e[1]?.truth === 'string')
      .map(([t, r]) => [t, { kind: r.kind, truth: r.truth.slice(0, 300) }] as [number, FinnResult]);
    const asked = (Array.isArray(p.asked) ? p.asked : []).filter((t) => Number.isInteger(t));
    const m = p.mates;
    const ints = (v: unknown) => (Array.isArray(v) ? v.filter((t) => Number.isInteger(t)).slice(0, 100) as number[] : []);
    const mates: MatesMemory | undefined = m && typeof m === 'object' ? {
      who: (Array.isArray(m.who) ? m.who : []).filter((w): w is ClassmateId => w === 'maya' || w === 'finn' || w === 'leo').slice(-100),
      mixUp: Number.isInteger(m.mixUp) ? m.mixUp : -2,
      struggles: (Array.isArray(m.struggles) ? m.struggles : []).filter((e): e is [number, string[]] => Array.isArray(e) && Number.isInteger(e[0]) && Array.isArray(e[1]))
        .slice(0, 100).map(([t, l]) => [t, l.filter((x) => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 200))]),
      mid: ints(m.mid), shaky: ints(m.shaky), carried: ints(m.carried), used: ints(m.used),
    } : undefined;
    // (the confusion meter checks its own: ConfusionMeter.restore)
    return index > 0 ? { slideId: p.slideId, at: p.at, finn, asked, index, mates, meter: p.meter } : null;
  } catch {
    return null;
  }
}
const welcomeBack = (name: string) => `Welcome back${name ? `, ${name}` : ''}! Let's pick up where we left off.`;

function Player({ deck, preview, startAt = 0, study = null }: { deck: Deck; preview: boolean; startAt?: number; study?: StudyRecord | null }) {
  // The study's group without the classmates: no Maya, Finn or Leo anywhere (and no switch to bring them in)
  const matesAllowed = !study || study.group === 'classmates';
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [interruptOn, setInterruptOn] = useState(false);   // talk over the professor (opt-in: opens the mic)
  const [cameraOn, setCameraOn] = useState(!!study?.camera);   // emotion check-in, presence, hand raise (opt-in; on in the study when they allowed it in the check)
  // The class chat: beside the slide on a computer (✕ hides it), a pull-out on a phone (the latest line shows under the slide)
  const [chatOpen, setChatOpen] = useState(true);
  const showTranscript = chatOpen;   // (the old top-right transcript's switch: SHOW_FLOATING_TRANSCRIPT)
  const [pulled, setPulled] = useState<null | 'chat' | 'mates'>(null);   // a phone (or a small screen): the panel pulled out
  const desk = useMedia('(min-width: 1024px)');    // room for the chat beside the slide
  const wide = useMedia('(min-width: 1600px)') && matesAllowed;    // room for the chat on the left and the classmates on the right
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const chatSeq = useRef(0);
  const [chatSeenId, setChatSeenId] = useState(0);     // the last entry seen in the chat (newer ones: a dot on 💬)
  const [matesSeenId, setMatesSeenId] = useState(0);
  /** Something said (or typed, or clicked) goes into the class chat */
  const addLine = useCallback((who: Speaker, text: string, to?: string) => {
    const t = text.trim();
    if (t) setChat((c) => [...c.slice(-199), { id: ++chatSeq.current, kind: 'line', who, text: t, ...(to ? { to } : {}) }]);
  }, []);
  // Who the professor is answering now, when several questions are answered together ("→ Maya" in the chat)
  const answerTo = useRef<string | null>(null);
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
  const [classmateOn, setClassmateOn] = useState(matesAllowed);         // the AI classmates (Maya, Finn, Leo) ask at topic ends; Finn plays in hands-on boxes
  const [classmateSaying, setClassmateSaying] = useState<ClassmateId | null>(null);   // who's talking now
  // Hands-on sounds (pop, bonk, chime): on unless turned off (remembered on this browser)
  const [soundsOn, setSoundsOn] = useState(true);
  const lessonStartedAt = useRef(0);   // for the end screen's "you stuck with it for N minutes"
  // The end-of-lesson quiz: QUIZ_ASKED questions from the deck's pool, picked when the lesson ends
  const [quiz, setQuiz] = useState<{ state: 'waiting' | 'asking' | 'done' | 'skipped'; questions: QuizQuestion[]; right: number }>({ state: 'waiting', questions: [], right: 0 });
  // A phone held upright (the "turn it sideways" tip), and a short screen (a phone turned sideways)
  const phonePortrait = useMedia('(orientation: portrait) and (max-width: 640px)');
  const shortScreen = useMedia('(max-height: 500px)');
  const [rotateClosed, setRotateClosed] = useState<ReadonlySet<string>>(new Set());   // closed for: 'lesson', and hands-on boxes' ids
  // How fast the voices talk (remembered on this browser)
  const [voiceSpeed, setSpeed] = useState<VoiceSpeed>(1);
  useEffect(() => { setSpeed(loadVoiceSpeed()); }, []);
  const chooseSpeed = (v: VoiceSpeed) => { setVoiceSpeed(v); setSpeed(v); };
  useEffect(() => { try { setSoundsOn(localStorage.getItem('handsOnSounds') !== 'off'); } catch { /* private mode */ } }, []);
  const toggleSounds = () => setSoundsOn((on) => {
    try { localStorage.setItem('handsOnSounds', on ? 'off' : 'on'); } catch { /* private mode */ }
    return !on;
  });
  // What to call the learner (optional, asked on the start screen; remembered on this browser)
  const [learnerName, setLearnerName] = useState('');
  useEffect(() => { if (study) return; try { setLearnerName(localStorage.getItem('learnerName') ?? ''); } catch { /* private mode */ } }, [study]);   // (the study is anonymous: no name)
  // Where they left off last time (not for previews, or a link to a given slide)
  const [resume, setResume] = useState<(Progress & { index: number }) | null>(null);
  useEffect(() => { if (!preview && !startAt) setResume(readProgress(deck)); }, [deck, preview, startAt]);
  const forgetProgress = useCallback(() => {
    try { localStorage.removeItem(progressKey(deck.lessonId)); } catch { /* private mode */ }
    setResume(null);
  }, [deck.lessonId]);
  const topicEndRef = useRef<(from: number, to: number) => void>(() => {});
  // A classmate's moment after a box's sentence (classmateMid, set further down)
  const midRef = useRef<{ due: (el: SlideElement) => boolean; run: () => void }>({ due: () => false, run: () => {} });
  // Hands-on boxes: the ones finished this lesson, and the one it's waiting on now
  const activitiesDone = useRef(new Set<string>());
  const activitiesSolved = useRef(new Set<string>());
  const activitiesRevealed = useRef(new Set<string>());   // skipped: shown with the answers filled in
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
  const variantNow = useRef<Variant | null>(null);
  variantNow.current = variant;
  const [mood, setMood] = useState<LearnerEmotion | null>(null);
  const [introDone, setIntroDone] = useState(false);
  // Between topics: "How did that section go?" (from = last slide of the topic, to = where next)
  const [selfCheck, setSelfCheck] = useState<{ from: number; to: number } | null>(null);
  const selfCheckRef = useRef(selfCheck);
  selfCheckRef.current = selfCheck;
  const checked = useRef(new Set<number>());   // topic-end slides already asked about
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicOf = useMemo(() => topicIndexes(deck.slides), [deck]);
  // The lesson's first clip waits while something else is talking: an answer (a question asked
  // during the hello) or a helper ("I'm lost" during the hello). Was: the lesson started the
  // moment the hello ended, over them. Once begun it stays begun (later on, those pause the
  // lesson themselves, and it carries on after them).
  const tutor = useTutor();
  const [begun, setBegun] = useState(false);
  const busyElsewhere = tutor.thinking || tutor.speaking || !!variant;
  useEffect(() => { if (started && introDone && !busyElsewhere) setBegun(true); }, [started, introDone, busyElsewhere]);
  const player = useDeckPlayer(deck, begun, {
    holdBefore: (from, to) => !checked.current.has(from) && (to >= deck.slides.length || topicOf[to] !== topicOf[from]),
    // End of a topic: maybe Finn asks something first, then "How did that section go?"
    onHold: (from, to) => { topicEndRef.current(from, to); },
    // A hands-on box: after the professor says what to do, the learner's turn (until done or skipped)
    waitAfter: (el) => (el.type === 'activity' && activityReady(el) && !activitiesDone.current.has(el.id)) || midRef.current.due(el),
    onWait: (el) => {
      if (el.type !== 'activity') { midRef.current.run(); return; }   // (a classmate's moment: the lesson carries on after it)
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
  /** A classmate's short line (their voice, their chip on the slide) */
  const mateSays = useCallback(async (who: ClassmateId, text: string) => {
    setClassmateSaying(who);
    const ok = await cuesRef.current.play({ text, who });
    setClassmateSaying(null);
    return ok;
  }, []);
  const tracking = useLessonTracking(deck, started, player.slideIndex, player.status === 'finished');
  // The study: when the lesson started (and this start's session, to join what they did), and when it ended
  useEffect(() => {
    if (!study || !started) return;
    studyPost('save', { id: study.id, lessonStarted: true, lessonSession: signals.session }).catch(() => { /* not worth stopping the lesson */ });
  }, [study, started]);
  const studyFinished = !!study && started && player.status === 'finished';
  useEffect(() => {
    if (!studyFinished || !study) return;
    writeStudy({ ...study, step: 'post' });
    studyPost('save', { id: study.id, lessonFinished: true, step: 'post' }).catch(() => { /* the study page carries on from the browser's step */ });
  }, [studyFinished, study]);
  // Async steps (an answer or a cue finished) must act on the latest player, not the one from when they began
  const playerRef = useRef(player);
  playerRef.current = player;
  // What the learner struggled with, per topic (a hands-on item they kept getting wrong, the slide they were lost on):
  // the classmates' question at the topic's end is the one closest to it
  const struggles = useRef(new Map<number, string[]>());
  const struggleSlide = useRef(-1);   // the slide they last struggled on (a classmate's moment there helps)
  /** here: a classmate may help right after this box (classmateMid); false: at the topic's end (after "another way to see it") */
  const noteStruggle = useCallback((what?: string, here = true) => {
    const i = playerRef.current.slideIndex;
    if (here) struggleSlide.current = i;
    const text = (what ?? deck.slides[i]?.elements.map(shownWords).join(' ') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const topic = topicOf[i] ?? 0;
    const list = struggles.current.get(topic) ?? [];
    if (!list.includes(text)) struggles.current.set(topic, [...list, text].slice(-6));
  }, [deck, topicOf]);
  /*
   * The confusion meter (lib/confusion.ts): every learner action adds points at the box where it happened.
   * The reactions read its levels (point, topic, overall); its level changes and each topic's snapshot are
   * logged for the study (confusion_level, confusion_topic). Never shown to the learner.
   */
  const meter = useRef(new ConfusionMeter());
  const liveLevel = useRef<ConfusionLevel>('clear');
  /** The level right now changed (a box got confusing, or faded): logged, for "minutes spent confused" */
  const checkLive = useCallback(() => {
    const i = playerRef.current.slideIndex;
    if (i < 0 || i >= deck.slides.length) return;
    const topic = topicOf[i] ?? 0;
    const level = meter.current.live(topic);
    if (level === liveLevel.current) return;
    const from = liveLevel.current;
    liveLevel.current = level;
    const hot = meter.current.hotPoint(topic);
    tracking.track('confusion_level', { level, from, topicScore: meter.current.topic(topic).score, box: hot?.box || null, now: hot?.now ?? 0, overall: meter.current.overall().score });
  }, [deck, topicOf, tracking]);
  /**
   * An action into the meter: at the box being said now (or `box`; null: the slide itself), on this slide
   * (or `slide`). `same`: what makes two of them the same action (a hands-on item), else one per 10 s.
   */
  const feel = useCallback((signal: ConfusionSignal, at: { box?: string | null; slide?: number; same?: string } = {}) => {
    const p = playerRef.current;
    const slide = at.slide ?? p.slideIndex;
    if (!started || slide < 0 || slide >= deck.slides.length) return;
    const box = 'box' in at ? at.box ?? null : p.activeId && !isIntroId(p.activeId) ? p.activeId : null;
    meter.current.record(signal, { topic: topicOf[slide] ?? 0, slide, box }, Date.now(), at.same);
    checkLive();
  }, [started, deck, topicOf, checkLive]);
  // (a confusing moment fades: the level is checked now and then too)
  useEffect(() => {
    if (!started) return;
    const t = setInterval(checkLive, 5000);
    return () => clearInterval(t);
  }, [started, checkLive]);
  // A topic is left (on to another, or the lesson's end): it joins the overall level, and its snapshot is logged
  // (left before its end, the tab hidden: a snapshot marked partial; the latest per topic is the one that counts)
  const topicLeft = useRef<number | null>(null);   // the topic being taught now
  const topicSnapshot = useCallback((topic: number, partial: boolean) => {
    const r = partial ? meter.current.topic(topic) : meter.current.endTopic(topic);
    const o = meter.current.overall();
    const slideId = (i: number) => deck.slides[i]?.id;
    signals.track('confusion_topic', { section: topic, value: {
      lesson: deck.lessonId, topic, name: deck.slides[topicOf.indexOf(topic)]?.topic?.trim().slice(0, 80) ?? '', partial,
      score: r.score, level: r.level, overall: o.score, overallLevel: o.level,
      hardest: r.hardest ? { slide: slideId(r.hardest.slide) ?? null, box: r.hardest.box || null, total: r.hardest.total } : null,
      signals: r.signals, points: snapshotPoints(meter.current.pointsOf(topic), slideId),
    } });
  }, [deck, topicOf]);
  useEffect(() => {
    if (!started) return;
    const topic = player.status === 'finished' ? null : topicOf[player.slideIndex] ?? 0;
    if (topicLeft.current !== null && topicLeft.current !== topic) topicSnapshot(topicLeft.current, false);
    topicLeft.current = topic;
  }, [started, player.slideIndex, player.status, topicOf, topicSnapshot]);
  useEffect(() => {
    if (!started) return;
    const onHide = () => { if (document.visibilityState === 'hidden' && topicLeft.current !== null) topicSnapshot(topicLeft.current, true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [started, topicSnapshot]);
  const tutorBusy = tutor.thinking || tutor.speaking;
  // The conversation for the transcript, minus the answer being spoken right now
  const lastTalk = tutor.history[tutor.history.length - 1];
  const earlierDialogue = lastTalk && tutor.exchange?.done && lastTalk.question === tutor.exchange.question ? tutor.history.slice(0, -1) : tutor.history;
  // Keep where they are, for "Continue where you left off" (cleared when the lesson ends)
  const lessonOver = player.status === 'finished';
  useEffect(() => {
    if (!started || !introDone || preview) return;
    if (lessonOver) { forgetProgress(); return; }
    const progress: Progress = { slideId: deck.slides[player.slideIndex]?.id ?? '', at: Date.now(), finn: [...finnResults.current], asked: [...classmateTopics.current],
      mates: { who: classmateWho.current, mixUp: lastMixUp.current, struggles: [...struggles.current], mid: [...midTopics.current], shaky: [...shaky.current], carried: [...carried.current], used: [...helperUsed.current] },
      meter: meter.current.save() };
    try { localStorage.setItem(progressKey(deck.lessonId), JSON.stringify(progress)); } catch { /* private mode: nothing kept */ }
  }, [started, introDone, preview, lessonOver, player.slideIndex, deck, forgetProgress]);
  const exchangeRef = useRef(tutor.exchange);
  exchangeRef.current = tutor.exchange;
  const detourBusy = useRef(false);   // answers to questions in class are being given (runTogether / runDetour)
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

  /* ------------------------------------------------ the class chat: what's said, as it's said */
  // The slide's narration: one entry per slide (picked up after a question: a new entry), a line per clip
  useEffect(() => {
    // (when it's actually being said: a clip loading during the hello isn't said yet)
    if (!started || player.status !== 'playing' || !player.activeId || !player.captionText || variant) return;
    const key = `${player.activeId}|${player.mode}`;
    const text = player.captionText;
    const slide = player.slideIndex;
    const s = deck.slides[slide];
    const heading = s?.elements.find((e) => e.type === 'text' && e.style === 'title');
    const title = (heading?.type === 'text' ? heading.text : s?.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    setChat((c) => {
      // the slide's entry, if only the professor's own short lines came after it ("Nice work!"); after a
      // question or a classmate, a new entry, so the chat reads in order
      const j = slideEntryAt(c);
      const last = c[j];
      if (last?.kind === 'slide' && last.slide === slide) {
        if (last.lines.some((l) => l.key === key && l.text === text)) return c;
        const n = c.slice();
        n[j] = { ...last, lines: [...last.lines, { key, text }] };
        return n;
      }
      return [...c.slice(-199), { id: ++chatSeq.current, kind: 'slide', slide, title, lines: [{ key, text }] }];
    });
  }, [started, player.status, player.activeId, player.mode, player.captionText, player.slideIndex, variant, deck]);
  // The page's own lines (the professor's cues and replies, a classmate's question or mix-up)
  const lastSaying = useRef('');
  useEffect(() => {
    const t = cues.saying;
    if (t && t !== lastSaying.current) addLine(classmateSaying ?? 'professor', t, classmateSaying ? undefined : answerTo.current ?? undefined);
    lastSaying.current = t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues.saying]);
  // A question to the professor and the answer, as it streams in. The question only if it isn't
  // there already (typed or said by the learner, or a classmate's line just before); none for the
  // professor's help in a hands-on box (no one asked)
  useEffect(() => {
    const x = tutor.exchange;
    if (!x || x.id === undefined) return;
    const id = x.id;
    setChat((c) => {
      const i = c.findIndex((e) => e.kind === 'answer' && e.exchange === id);
      if (i >= 0) {
        const e = c[i];
        if (e.kind !== 'answer' || (e.text === x.answer && e.done === x.done)) return c;
        const n = c.slice();
        n[i] = { ...e, text: x.answer, done: x.done };
        return n;
      }
      // (the answer's bubble once it has words: an answer held back while classmates ask comes in after them)
      if (!x.answer && !x.done) return c;
      const out = c.slice(-198);
      const mate = classmateNamed(x.asker);
      const who: Speaker | null = x.asker && !mate ? null : mate ?? 'you';
      const q = x.question.trim();
      if (who && !out.slice(-12).some((e) => e.kind === 'line' && e.who === who && e.text === q)) out.push({ id: ++chatSeq.current, kind: 'line', who, text: q });
      out.push({ id: ++chatSeq.current, kind: 'answer', exchange: id, text: x.answer, done: x.done });
      return out;
    });
  }, [tutor.exchange]);
  // What's on screen counts as seen (no dot on 💬 / 🙋 for it)
  useEffect(() => {
    const last = chat[chat.length - 1]?.id ?? 0;
    if ((desk && chatOpen) || pulled === 'chat') setChatSeenId(last);
    if ((wide && chatOpen) || pulled === 'mates') setMatesSeenId(last);
  }, [chat, desk, wide, chatOpen, pulled]);

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

  // The lesson's ready-made parts (texts, pictures, charts, numbered), for a slide made on the spot
  const parts = useMemo(() => lessonParts(deck), [deck]);
  /** A slide for the question from the lesson's own parts (/api/tutor/compose), or null (nothing fits, too slow, or rate-limited) */
  const composeSlide = useCallback(async (question: string): Promise<Slide | null> => {
    if (parts.length < 2) return null;
    try {
      const res = await fetch('/api/tutor/compose', {
        method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, parts }), signal: AbortSignal.timeout(12000),
      });
      return res.ok ? ((await res.json()).slide ?? null) : null;
    } catch {
      return null;
    }
  }, [parts]);

  /** A question (not a command): the professor answers, then the lesson carries on. Resolves false if it was talked over. */
  const answer = useCallback(async (question: string, opts: {
    /** A classmate asked it (their name): not counted as the learner's question */
    asker?: string;
    /** false: don't carry on with the lesson afterwards (the caller decides what's next) */
    resume?: boolean;
    /** Already counted (the question bank looked it up first) */
    counted?: boolean;
  } = {}): Promise<boolean> => {
    if (!opts.asker && !opts.counted) learnerQuestions.current++;
    if (!opts.counted) tracking.track('tutor_question', { question: question.slice(0, 300), ...(opts.asker ? { asker: opts.asker } : {}) }, opts.asker ? undefined : { questions: 1 });
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
        // a slide from the lesson's own parts (quick: the AI only picks and places them), else a board drawn from scratch
        wantBoard ? composeSlide(question).then((made) => made ?? fetchBoard(question, base.topic ?? '', slideText(playerRef.current.slideIndex))) : Promise.resolve(null),
        // Not for Finn's questions: the authored slide is the "I'm lost" help slide, and the
        // learner isn't lost when a classmate asks (was: Finn spoke, the help slide came up)
        opts.asker ? Promise.resolve(null) : findVariant('confused', question, question),
      ]).then(([board, slide]) => {
        if (!answering) return;
        variantMode.current = 'answer';
        if (board || slide) shownAt = Date.now();
        if (board) {
          tracking.track('tutor_decision', { action: 'board', title: String(board.elements[0]?.type === 'text' ? board.elements[0].text : '') });
          // keeps the slide's background, so it's the slide turning into the board (a slide from parts keeps its own: its text is dark)
          setVariant({ title: '', body: '', narration: '', variant: 'board', slide: { ...board, id: `${base.id}~board`, background: board.id === 'spot' ? board.background : base.background } });
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
    if (superseded) return false;   // talked over the answer: the next turn decides what happens
    // The caller goes on to something else (Finn's turn → "How did that section go?"): let the
    // board morph back first (was: the self-check popped up mid-morph over a redrawing slide)
    if (opts.resume === false) { if (shownAt) await new Promise((r) => setTimeout(r, MORPH_BACK_MS + 250)); return true; }
    if (decision) tracking.track('tutor_decision', { action: decision });
    const now = playerRef.current;
    if (decision === 'simplify') now.simplify();
    else if (decision === 'advance') now.nextSlide();
    else if (decision === 'repeat') now.repeat();
    else now.resume();
    return true;
  }, [tutor, slideContext, tracking, findVariant, finishThenPause, deck, slideText, learnerName, composeSlide]);

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
    // (a helper that says nothing isn't used: it sat there silent until "Got it". The other ways to see it come next)
    const speaks = (h: Slide | null) => (h && speakingOrder(h).length ? h : null);
    const own = s ? speaks(ownHelper(s)) : null;
    if (own || !s?.elements.some((e) => e.type === 'activity')) return own;
    for (let j = i - 1; j >= 0 && topicOf[j] === topicOf[i]; j--) {
      const h = speaks(ownHelper(deck.slides[j]));
      if (h) return h;
    }
    return null;
  }, [deck, topicOf]);

  /** count: false when the learner already said so another way (the section check's "another way?" offer) */
  const confused = useCallback(async (after?: () => void, mood?: 'confused' | 'frustrated', count = true) => {
    tracking.track('confusion_click', {}, { confusion_marks: 1 });
    if (count) feel('lost');
    noteStruggle(undefined, false);   // ("I'm lost": another way to see it now; a classmate's question at the topic's end, not right after it)
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
  }, [deck, slideText, tracking, act, findVariant, presentVariant, helperFor, noteStruggle, feel]);

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
    // Answer slides (the question bank): the answers stop, and the lesson moves on to what comes next
    // (was: back to the slide it came from, where the learner heard again what had just been answered)
    const answers = variant?.variant === 'answer';
    if (answers && (tutorBusyRef.current || tutor.speaking || tutor.thinking)) tutor.cancel();
    answerTo.current = null;
    cues.stop();
    setVariant(null);
    helperSeq.current++;
    setHelperActive(null);
    const after = variantAfter.current;
    variantAfter.current = null;
    // was: if (after) after(); — moving to another slide at once cut the morph back short
    if (after) { if (MORPH_HELPERS) setTimeout(after, MORPH_BACK_MS); else after(); }
    else if (answers && midResume.current) {
      // a classmate's mid-topic question: on to the next box of the slide
      midResume.current = false;
      setTimeout(() => playerRef.current.nextClip(), MORPH_BACK_MS);
    }
    else if (answers) {
      askTurn.current++;
      // back at once (they didn't stay for the answers): the slide they asked on picks up where it was
      if (Date.now() - detourAt.current < BACK_QUICK_MS) setTimeout(() => playerRef.current.resume(), MORPH_BACK_MS);
      else setTimeout(moveOn, MORPH_BACK_MS);
    }
    else playerRef.current.resume();
  }

  /* --------------------------------------------- the question bank (lib/canvas/bank.ts) */
  const askTurn = useRef(0);   // bumped by every learner turn: an older question's follow-ups stop
  const detourAt = useRef(0);  // when the answers (the question bank's) began
  const learnerQuestions = useRef(0);   // asked this lesson (the end screen)
  // Questions with an answer slide that says something
  const bankList = useMemo(() => (deck.bank && !deck.bank.off ? deck.bank.questions : [])
    .filter((q) => q.slide.elements.some((e) => !e.silent && spokenText(e))), [deck]);
  const bankAsked = useRef(new Set<string>());   // asked this lesson (by anyone): not asked again by a classmate
  /** The bank question closest to the learner's (close enough to answer it), and related ones for the classmates to ask */
  const matchBank = useCallback(async (question: string, followUps = BANK_FOLLOW_UPS): Promise<{ best: BankQuestion | null; related: BankQuestion[] }> => {
    const none = { best: null, related: [] };
    if (!bankList.length) return none;
    try {
      const res = await fetch('/api/bank/match', {
        method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, items: bankList.map((q) => ({ id: q.id, q: q.q })) }), signal: AbortSignal.timeout(5000),
      });
      const scores: { id: string; score: number }[] = res.ok ? (await res.json()).scores ?? [] : [];
      const byId = new Map(bankList.map((q) => [q.id, q]));
      const top = scores[0] && scores[0].score >= BANK_ANSWER_MIN ? byId.get(scores[0].id) ?? null : null;
      // related: not the answer, not asked yet, one per classmate (in closeness order), up to followUps
      const related: BankQuestion[] = [];
      const askers = new Set<string>();
      for (const sc of scores) {
        const q = byId.get(sc.id);
        if (!q || q === top || sc.score < BANK_RELATED_MIN || bankAsked.current.has(q.id) || askers.has(q.asker)) continue;
        if (top && sc.score >= BANK_ANSWER_MIN) continue;   // (the same question in other words: its answer is the one they're getting)
        related.push(q);
        askers.add(q.asker);
        if (related.length >= followUps) break;
      }
      return { best: top, related };
    } catch {
      return none;
    }
  }, [bankList]);
  /** The topic's bank questions nobody has asked yet */
  const openQuestions = useCallback((topicName: string): BankQuestion[] =>
    bankList.filter((q) => q.topic === topicName && !bankAsked.current.has(q.id)), [bankList]);
  /** Questions in order of closeness to `about` (what the learner struggled with); as they are when the lookup fails */
  const closestTo = useCallback(async (about: string, items: BankQuestion[]): Promise<BankQuestion[]> => {
    if (items.length < 2) return items;
    try {
      const res = await fetch('/api/bank/match', {
        method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question: about.slice(0, 300), items: items.map((q) => ({ id: q.id, q: q.q })) }), signal: AbortSignal.timeout(4000),
      });
      const scores: { id: string }[] = res.ok ? (await res.json()).scores ?? [] : [];
      const rank = new Map(scores.map((sc, n) => [sc.id, n]));
      return [...items].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    } catch {
      return items;
    }
  }, []);
  /**
   * Answer slides, one after another: a classmate asks (when it's theirs), then the slide turns into the
   * answer and the professor says it, box by box. Resolves true when all were said; false when cut short
   * ("Back to the lesson", a question, a command). The caller ends it (endDetour) and says what's next.
   */
  const runDetour = useCallback(async (steps: { q: BankQuestion; ask: boolean }[]): Promise<boolean> => {
    detourBusy.current = true;
    try { return await detourSteps(steps); } finally { detourBusy.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues, tracking]);
  const detourSteps = async (steps: { q: BankQuestion; ask: boolean }[]): Promise<boolean> => {
    const seq = ++helperSeq.current;
    const live = () => seq === helperSeq.current;
    for (const { q, ask } of steps) {
      if (!live()) return false;
      bankAsked.current.add(q.id);
      if (ask) {
        setClassmateSaying(q.asker);
        const ok = await cues.play({ text: q.q, who: q.asker });
        setClassmateSaying(null);
        if (!ok || !live()) return false;
      }
      tracking.track('tutor_decision', { action: 'bank_answer', q: q.q.slice(0, 120), asker: ask ? q.asker : 'learner' });
      variantMode.current = 'narrated';
      variantAfter.current = null;
      setVariant({ title: '', body: '', narration: '', slide: q.slide, variant: 'answer' });
      if (steps[0].q === q) detourAt.current = Date.now();   // (the clock for a quick "Back to the lesson")
      for (const el of speakingOrder(q.slide)) {
        if (!live()) return false;
        setHelperActive(el.id);
        const ok = await cues.play({ text: spokenText(el), url: currentAudio(el, 'normal') });
        if (!ok || !live()) { setHelperActive(null); return false; }
      }
      setHelperActive(null);
    }
    return live();
  };
  /** The answer slides go (the slide morphs back); resolves once it has */
  const endDetour = useCallback(() => {
    helperSeq.current++;
    setHelperActive(null);
    setVariant(null);
    return new Promise<void>((r) => setTimeout(r, MORPH_BACK_MS));
  }, []);
  /**
   * After a question: on to what comes next, not back into the slide it was asked on (the learner would hear
   * again what was just answered). A hands-on box still to do on the slide: straight to it; with no
   * instructions again when the learner seems to get it (no "I'm lost", repeats or simpler-please here).
   */
  const moveOn = useCallback(() => {
    const p = playerRef.current;
    const box = deck.slides[p.slideIndex]?.elements.find((e) => e.type === 'activity' && activityReady(e) && !activitiesDone.current.has(e.id));
    if (box && p.clipOf(box.id) >= 0) {
      const st = tracking.state();
      const getsIt = !st.confusion_marks && !st.simplify_requests && !st.repeats && st.self_check !== 'lost' && st.self_check !== 'kind';
      tracking.track('tutor_decision', { action: 'to_hands_on', quick: getsIt });
      p.jumpTo(box.id, getsIt);
      if (getsIt) queueLine(() => playCue({ text: QUICK_TURN }));
      return;
    }
    p.endSlide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, tracking]);

  /** A library picture for the learner's question (when the bank has no answer for it): quick, or null */
  const pictureFor = useCallback(async (question: string, exclude: string[]) => {
    try {
      const res = await fetch('/api/bank/picture', {
        method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question, exclude }), signal: AbortSignal.timeout(4000),
      });
      return res.ok ? ((await res.json()).picture ?? null) as { url: string; description: string } | null : null;
    } catch {
      return null;
    }
  }, []);
  // The combined answer slide while the professor's live answer to the learner comes in: its words go in their area
  const together = useRef<{ question: string; live: boolean } | null>(null);
  useEffect(() => {
    const t = together.current;
    const x = tutor.exchange;
    if (!t?.live || !x || x.question !== t.question || !x.answer) return;
    const gist = answerGist(x.answer);
    if (gist) setVariant((v) => (v?.slide?.id === TOGETHER_ID ? { ...v, slide: setAreaText(v.slide, 0, gist) } : v));
  }, [tutor.exchange]);

  /**
   * The learner asked: the classmates ask their related questions (if any), then ONE slide answers them all,
   * laid out at once (lib/canvas/together.ts) from their answer slides. The learner's question first: its
   * recorded answer (the bank), else the professor's live answer (asked for at once, said after the
   * classmates) with a library picture; then each classmate's, recorded. That answer's part of the slide
   * is lit while it's said. Resolves true when all were said; false when cut short.
   */
  const runTogether = useCallback(async (question: string, best: BankQuestion | null, related: BankQuestion[],
    picture: Promise<{ url: string; description: string } | null>): Promise<boolean> => {
    const seq = ++helperSeq.current;
    const live = () => seq === helperSeq.current;
    // the live answer is written while the classmates ask, and said after them
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const liveAnswer = best ? null : tutor.ask(question, slideContext() + (related.length ? '\nAnswer in 2 or 3 short sentences: classmates asked questions too, and you answer theirs next.' : ''), { holdUntil: gate });
    together.current = { question, live: !best };
    detourBusy.current = true;
    const turn = askTurn.current;
    let finished = false;
    try {
      for (const q of related) {
        bankAsked.current.add(q.id);
        tracking.track('tutor_decision', { action: 'classmate_follow_up', q: q.q.slice(0, 120), who: q.asker }, { classmate_turns: 1 });
        classmateWho.current.push(q.asker);   // (counts for who has spoken least)
        mateTalkAt.current = Date.now();
        setClassmateSaying(q.asker);
        const ok = await cues.play({ text: q.q, who: q.asker });
        setClassmateSaying(null);
        if (!ok || !live()) return false;
      }
      // (the picture has been looking while they asked)
      const pic = best ? null : await Promise.race([picture, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
      if (!live()) return false;
      const you = learnerName.trim() || 'You';
      const slide = togetherSlide([
        { who: you, q: question, from: best?.slide ?? null, picture: pic },
        ...related.map((q) => ({ who: CLASSMATES[q.asker].name, q: q.q, from: q.slide })),
      ]);
      tracking.track('tutor_decision', { action: 'bank_together', questions: 1 + related.length, learnerFromBank: !!best });
      variantMode.current = 'narrated';
      variantAfter.current = null;
      setVariant({ title: '', body: '', narration: '', slide, variant: 'answer' });
      detourAt.current = Date.now();   // (the clock for a quick "Back to the lesson")
      const lit = (i: number) => { const ids = areaIds(i); return slide.elements.some((e) => e.id === ids.text) ? ids.text : ids.media; };
      const say = async (q: BankQuestion, i: number, to: string) => {
        bankAsked.current.add(q.id);
        answerTo.current = to;
        setHelperActive(lit(i));
        for (const el of speakingOrder(q.slide)) {
          if (!live()) return false;
          if (!(await cues.play({ text: spokenText(el), url: currentAudio(el, 'normal') })) || !live()) return false;
        }
        return true;
      };
      if (best) { if (!(await say(best, 0, you))) return false; }
      else {
        answerTo.current = you;
        setHelperActive(lit(0));
        release();
        let { superseded } = await liveAnswer!;
        // cut off, but nothing took over (no new question, not "Back to the lesson"): asked again, once
        if (superseded && live() && turn === askTurn.current) {
          ({ superseded } = await tutor.ask(question, slideContext() + (related.length ? '\nAnswer in 2 or 3 short sentences: classmates asked questions too, and you answer theirs next.' : '')));
        }
        if (superseded || !live()) return false;
      }
      for (const [i, q] of related.entries()) if (!(await say(q, i + 1, CLASSMATES[q.asker].name))) return false;
      finished = live();
      return finished;
    } finally {
      release();
      // (cut short: the held answer isn't said later; unless a newer question's answer is the one going now)
      if (!finished && liveAnswer && exchangeRef.current?.question === question) tutor.cancel();
      together.current = null;
      answerTo.current = null;
      detourBusy.current = false;
      setHelperActive(null);
    }
  }, [cues, tutor, slideContext, tracking, learnerName]);

  /**
   * The learner asks: the classmates may ask related questions (fewer the more the learner asks), and one
   * slide answers them all (runTogether). Alone, a close bank question: its own answer slide, at once.
   * Then on to what comes next (moveOn).
   */
  const askClass = useCallback(async (question: string) => {
    // (in the middle of a hands-on box the slide stays put: turning it into another slide would start the box over)
    if (!bankList.length || yourTurnRef.current) { answer(question); return; }
    learnerQuestions.current++;
    mateTalkAt.current = Date.now();
    tracking.track('tutor_question', { question: question.slice(0, 300) }, { questions: 1 });
    const quiet = finishThenPause();
    const my = ++askTurn.current;
    const budget = classmateBudget(learnerQuestions.current - 1, topicsSeen.current.size);
    const exclude = deck.slides.flatMap((sl) => sl.elements.flatMap((e) => (e.type === 'image' ? [e.src] : [])));
    const picture = pictureFor(question, exclude);   // (only used if the bank has no answer for it)
    const { best, related } = await matchBank(question, classmateOnRef.current ? budget.followUps : 0);
    if (my !== askTurn.current) return;   // another question (or command) came meanwhile
    if (best) tracking.track('tutor_decision', { action: 'bank_match', q: best.q.slice(0, 120) }, { bank_answers: 1 });
    await quiet;
    if (my !== askTurn.current) return;
    const done = best && !related.length ? await runDetour([{ q: best, ask: false }]) : await runTogether(question, best, related, picture);
    if (my !== askTurn.current) return;
    if (!done) {
      // cut short by something that didn't take over (no new question, not "Back to the lesson"): the answer
      // slide doesn't stay up on its own (was: left there, "…", with the lesson stopped)
      if (variantNow.current?.variant === 'answer') { await endDetour(); if (my === askTurn.current) playerRef.current.resume(); }
      return;
    }
    await endDetour();
    // now and then a classmate says it helped them too (not after their own follow-ups: they've spoken)
    if (my === askTurn.current && classmateOnRef.current && !related.length && Math.random() < REACT_CHANCE) {
      const who: ClassmateId = Math.random() < 0.5 ? 'maya' : 'leo';
      classmateWho.current.push(who);
      tracking.track('tutor_decision', { action: 'classmate_react', who });
      await mateSays(who, pickOne(SAME_QUESTION));
    }
    if (my === askTurn.current) moveOn();
  }, [bankList, answer, tracking, finishThenPause, matchBank, runDetour, runTogether, endDetour, moveOn, pictureFor, deck]);

  /* --------------------------------------------- Finn, the AI classmate */
  // Topics the learner has been in (for how often they ask), and topic ends since a classmate last spoke
  const topicsSeen = useRef(new Set<number>());
  useEffect(() => { if (started) topicsSeen.current.add(topicOf[player.slideIndex] ?? 0); }, [started, player.slideIndex, topicOf]);
  const endsSinceTurn = useRef(0);
  const endsCounted = useRef(new Set<number>());
  const curious = useRef(new Map<number, boolean>());   // topic → is a classmate curious there anyway (rolled once)
  const classmateWho = useRef<ClassmateId[]>([]);         // who spoke at each classmate turn so far
  const lastMixUp = useRef(-2);                            // the turn of Finn's last mix-up (none yet: the 2nd turn can be one)
  const topicName = useCallback((topic: number) => deck.slides[topicOf.indexOf(topic)]?.topic?.trim() ?? '', [deck, topicOf]);
  /** Did the learner struggle in the topic? ("simpler please", "I'm lost", "again", a puzzled face, the professor stepping in on a hands-on item, or 2+ hands-on mistakes) */
  const struggled = useCallback((topic: number) => {
    const st = tracking.stateOf(topic);
    return st.confusion_marks + st.simplify_requests + st.repeats > 0 || (struggles.current.get(topic)?.length ?? 0) >= 2
      || shaky.current.has(topic - 1)   // (the topic before: "Kind of" or "Lost me", so go gently here too)
      || helperUsed.current.has(topic);  // (they used "another way to see it" here)
  }, [tracking]);
  /**
   * Does a classmate speak at this topic's end, and why (null: not this time). The rhythm is the learner's asking
   * (classmateBudget); a topic where they asked nothing gets the question they didn't ask, when the bank has one.
   */
  const classmateTurn = useCallback((topic: number): { why: 'quiet' | 'due' | 'curious'; struggling: boolean } | null => {
    // (a classmate already spoke mid-topic: like the learner asking, that was the classmates' part)
    const asked = tracking.stateOf(topic).questions > 0 || midTopics.current.has(topic);
    const open = openQuestions(topicName(topic)).length > 0;
    const b = classmateBudget(learnerQuestions.current, topicsSeen.current.size);
    const struggling = struggled(topic);
    if (!curious.current.has(topic)) curious.current.set(topic, Math.random() < CURIOUS_CHANCE);
    if (!asked && open) return { why: 'quiet', struggling };
    if (!asked && endsSinceTurn.current + 1 >= b.every) return { why: 'due', struggling };
    // (they asked here: the follow-ups after their question were the classmates' part; a learner who asks a lot gets no extra)
    return open && curious.current.get(topic) && (!asked || b.every === 1) ? { why: 'curious', struggling } : null;
  }, [tracking, openQuestions, topicName, struggled]);
  /** Who has spoken least so far (Finn last on a tie: he has his mix-ups and the hands-on boxes) */
  const leastSpoken = useCallback((): ClassmateId[] => {
    const n = (id: ClassmateId) => classmateWho.current.filter((w) => w === id).length;
    return (['maya', 'leo', 'finn'] as ClassmateId[]).sort((a, b) => n(a) - n(b));
  }, []);
  /** What the classmate says: the question that helps most where the learner is (see classmateTurn above) */
  const classmateLine = useCallback(async (topic: number, plan: { why: string; struggling: boolean }): Promise<FinnLine | null> => {
    const name = topicName(topic);
    const slides = deck.slides.map((_, i) => i).filter((i) => topicOf[i] === topic);
    const taught = slides.map(slideText).join(' | ');
    const open = openQuestions(name);
    const fromBank = (q: BankQuestion): FinnLine => ({ question: q.q, who: q.asker, bank: q });
    // Struggled here: the open question closest to what they struggled with, a checking (Finn) or curious (Maya) one first: it clears it up
    if (plan.struggling && open.length) {
      const ranked = await closestTo(struggles.current.get(topic)?.join('; ') || taught, open);
      return fromBank(ranked.find((q) => q.asker !== 'leo') ?? ranked[0]);
    }
    // Went well: now and then Finn's mix-up to catch (a challenge; never when it would confuse, nor right after Finn spoke)
    const turn = classmateWho.current.length;
    if (!plan.struggling && plan.why !== 'curious' && turn - lastMixUp.current >= MIX_UP_EVERY && classmateWho.current[turn - 1] !== 'finn') {
      const mix = await fetchClassmate(name, taught, true, 'finn');
      if (mix) return mix;
    }
    // A question: a curious moment is Maya's kind; otherwise whoever has spoken least asks one of theirs
    if (open.length) {
      const order = plan.why === 'curious' ? (['maya', 'leo', 'finn'] as ClassmateId[]) : leastSpoken();
      return fromBank(order.map((w) => open.find((q) => q.asker === w)).find(Boolean) ?? open[0]);
    }
    // None left in the bank: one written now (a question, not a mix-up)
    return fetchClassmate(name, taught, false, leastSpoken()[0]);
    // (fetchClassmate is further down: only called later)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, topicOf, slideText, openQuestions, closestTo, topicName, leastSpoken]);
  const midTopics = useRef(new Set<number>());   // topics a classmate already spoke in, mid-topic
  const mateTalkAt = useRef(0);                    // when the learner last asked or a classmate last spoke (a mid-topic moment waits after)
  const shaky = useRef(new Set<number>());         // topics the learner rated "Kind of" or "Lost me"
  const carried = useRef(new Set<number>());       // ...whose leftover question a classmate already asked (lostQuestion)
  const midMatch = useRef(new Map<number, { q: BankQuestion; score: number } | null>());   // slide → the open question closest to it
  const midPending = useRef<{ why: 'struggle' | 'curious'; from: number; q?: BankQuestion } | null>(null);
  const midResume = useRef(false);                 // a mid-topic answer is up: "Back to the lesson" goes on to the next box
  // Each slide, as it starts: the topic's open question closest to it (for a curious moment there)
  useEffect(() => {
    const i = player.slideIndex;
    if (!started || !classmateOn || midMatch.current.has(i) || !deck.slides[i]) return;
    const open = openQuestions(topicName(topicOf[i] ?? 0));
    midMatch.current.set(i, null);
    if (!open.length) return;
    fetch('/api/bank/match', {
      method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: slideText(i).slice(0, 300), items: open.map((q) => ({ id: q.id, q: q.q })) }), signal: AbortSignal.timeout(5000),
    }).then((res) => (res.ok ? res.json() : null)).then((d) => {
      const top = d?.scores?.[0];
      const q = top && open.find((x) => x.id === top.id);
      if (q) midMatch.current.set(i, { q, score: top.score });
    }).catch(() => { /* no curious moment on this slide */ });
  }, [started, classmateOn, player.slideIndex, deck, topicOf, openQuestions, topicName, slideText]);
  midRef.current = {
    /** Does a classmate speak up after this box's sentence? (classmateMid, above MID_COOLDOWN_MS) */
    due: (el) => {
      if (!started || !classmateOnRef.current || el.type === 'activity' || isIntroId(el.id)) return false;
      if (detourBusy.current || variantNow.current || finnBusy.current || tutorBusyRef.current || yourTurnRef.current || selfCheckRef.current) return false;
      const i = playerRef.current.slideIndex;
      const topic = topicOf[i] ?? 0;
      const lastOfTopic = i + 1 >= deck.slides.length || topicOf[i + 1] !== topic;
      if (lastOfTopic || midTopics.current.has(topic)) return false;
      const since = Date.now() - mateTalkAt.current;
      if (since < MID_HELP_COOLDOWN_MS) return false;
      if (struggleSlide.current === i && openQuestions(topicName(topic)).length) {
        midPending.current = { why: 'struggle', from: topic };
        return true;
      }
      if (since < MID_COOLDOWN_MS) return false;
      const m = midMatch.current.get(i);
      const every = classmateBudget(learnerQuestions.current, topicsSeen.current.size).every;
      if (m && !bankAsked.current.has(m.q.id) && m.score >= MID_RELATED_MIN && Math.random() < (MID_CHANCE[every] ?? 0.1)) {
        midPending.current = { why: 'curious', from: topic, q: m.q };
        return true;
      }
      return false;
    },
    run: async () => {
      const mid = midPending.current;
      midPending.current = null;
      const at = playerRef.current.slideIndex;
      const go = () => { if (playerRef.current.slideIndex === at) playerRef.current.nextClip(); };
      if (!mid) { go(); return; }
      midTopics.current.add(topicOf[at] ?? 0);
      let q = mid.q ?? null;
      if (!q) {
        // the open question closest to what they struggled with: a checking (Finn) or curious (Maya) one first, it clears it up
        const ranked = await closestTo(struggles.current.get(mid.from)?.join('; ') || slideText(at), openQuestions(topicName(mid.from)));
        q = ranked.find((x) => x.asker !== 'leo') ?? ranked[0] ?? null;
      }
      if (!q || bankAsked.current.has(q.id) || playerRef.current.slideIndex !== at) { go(); return; }
      mateTalkAt.current = Date.now();
      classmateWho.current.push(q.asker);
      tracking.track('tutor_decision', { action: 'classmate_mid', why: mid.why, question: q.q.slice(0, 300), who: q.asker }, { classmate_turns: 1 });
      midResume.current = true;
      const said = await mateSays(q.asker, q.q);
      if (!said || playerRef.current.slideIndex !== at) {
        // cut off (the learner spoke, asked, or moved): what they did decides; nothing taking over: on with the lesson
        midResume.current = false;
        setTimeout(() => { if (!detourBusy.current && !tutorBusyRef.current && !variantNow.current && playerRef.current.status === 'paused') go(); }, 400);
        return;
      }
      // its answer slide (cut short: "Back to the lesson" goes on to the next box, a question or a command decides)
      if (!(await runDetour([{ q, ask: false }]))) return;
      midResume.current = false;
      await endDetour();
      go();
    },
  };
  const classmateTopics = useRef(new Set<number>());   // topics a classmate already spoke at the end of
  const classmateAsked = useRef<string[]>([]);
  const finnResults = useRef(new Map<number, FinnResult>());   // topic → how the learner did on Finn's mistake there
  const classmateOnRef = useRef(classmateOn);
  classmateOnRef.current = classmateOn;
  // The classmate's line for a topic, fetched (and voiced) while its last slide plays, so they speak at once
  const finnReady = useRef(new Map<number, { struggling: boolean; line: Promise<FinnLine | null> }>());
  const finnLine = useCallback((topic: number, plan: { why: string; struggling: boolean }): Promise<FinnLine | null> => {
    // (picked again when the learner started struggling since: what helps them is different now)
    if (finnReady.current.get(topic)?.struggling !== plan.struggling) {
      finnReady.current.set(topic, { struggling: plan.struggling, line: classmateLine(topic, plan)
        .then((line) => { if (line) cuesRef.current.preload(line.question, line.who); return line; }) });
    }
    return finnReady.current.get(topic)!.line;
  }, [classmateLine]);
  useEffect(() => {
    const i = player.slideIndex;
    const lastOfTopic = i + 1 >= deck.slides.length || topicOf[i + 1] !== topicOf[i];
    if (!started || !classmateOn || !lastOfTopic || classmateTopics.current.has(topicOf[i])) return;
    const plan = classmateTurn(topicOf[i]);
    if (plan) finnLine(topicOf[i], plan);
  }, [started, classmateOn, player.slideIndex, deck, topicOf, classmateTurn, finnLine]);

  // Finn's turn at a topic's end (his line, the professor's answer); bumped when the learner takes over
  const finnTurn = useRef(0);
  const finnBusy = useRef(false);
  const takeOverFromFinn = useCallback(() => {
    if (!finnBusy.current) return;
    finnBusy.current = false;
    finnTurn.current++;
    setClassmateSaying(null);
  }, []);
  // Finn said something wrong on purpose: waiting for the learner to say if he's right
  // null = called off (the learner moved on, or gave a command instead)
  const finnCheck = useRef<((verdict: string | null) => void) | null>(null);
  const micRef = useRef<{ status: string; talk: () => void }>({ status: 'off', talk: () => {} });   // the mic (set up further down)
  // Waiting for the learner's call on Finn: 'buttons' (Not quite! / He's right / Not sure), then 'open' (the professor
  // asked them to say more: no one-click answers, just their words, typed or said)
  const [finnWaiting, setFinnWaiting] = useState<false | 'buttons' | 'open'>(false);
  const [finnReply, setFinnReply] = useState('');
  const finnHow = useRef<'voice' | 'button' | 'typed'>('button');   // how the last answer came (a button has no reasons in it)
  const finnVerdict = useCallback((verdict: string | null, how: 'voice' | 'button' | 'typed', inChat = false) => {
    const done = finnCheck.current;
    if (!done) return false;
    if (verdict && !inChat) addLine('you', verdict);   // (typed in the ask box: already in the chat)
    finnCheck.current = null;
    setFinnWaiting(false);
    setFinnReply('');
    finnHow.current = how;
    // Answered with a button or typing while the mic listens: stop it, and ignore what it heard
    const mic = micRef.current;
    if (how !== 'voice' && (mic.status === 'listening' || mic.status === 'processing')) {
      skipTranscript.current = true;
      if (mic.status === 'listening') mic.talk();
    }
    done(verdict);
    return true;
  }, [addLine]);

  topicEndRef.current = async (from: number, to: number) => {
    const topic = topicOf[from];
    const my = ++finnTurn.current;
    // The learner did something else meanwhile ("I'm lost", a question, a command): their turn now, Finn's is over
    const over = () => finnTurn.current !== my;
    // A classmate speaks (once per topic) when the learner's asking and the topic call for it (classmateTurn)
    const plan = classmateOnRef.current && !classmateTopics.current.has(topic) ? classmateTurn(topic) : null;
    if (!endsCounted.current.has(topic)) { endsCounted.current.add(topic); endsSinceTurn.current = plan ? 0 : endsSinceTurn.current + 1; }
    if (plan) {
      classmateTopics.current.add(topic);
      finnBusy.current = true;
      try {
      let line = await finnLine(topic, plan);
      // (picked while the topic's last slide played, and its question has been asked since: picked again)
      if (line?.bank && bankAsked.current.has(line.bank.id)) {
        finnReady.current.delete(topic);
        line = await finnLine(topic, plan);
      }
      if (line && !selfCheckRef.current && !over()) {
        const q = line.question;
        const mate = CLASSMATES[line.who];
        if (line.truth) lastMixUp.current = classmateWho.current.length;
        classmateWho.current.push(line.who);
        mateTalkAt.current = Date.now();
        classmateAsked.current.push(q);
        tracking.track('tutor_decision', { action: line.truth ? 'classmate_mistake' : 'classmate', question: q.slice(0, 300), who: line.who, why: plan.why, struggling: plan.struggling }, { classmate_turns: 1 });
        const name = learnerName.trim();
        const turnTo = name ? `Hmm. ${name}, what do you think? Is ${CLASSMATE_NAME} right?` : `Hmm. What do you think, is ${CLASSMATE_NAME} right?`;
        if (line.truth) cues.preload(turnTo);   // ready by the time Finn finishes
        setClassmateSaying(line.who);
        const said = await cues.play({ text: q, who: line.who });
        setClassmateSaying(null);
        if (said && !over() && line.bank) {
          // a bank question: its answer slide (cut short: whatever cut it decides what's next)
          if (!(await runDetour([{ q: line.bank, ask: false }]))) return;
          await endDetour();
        } else if (said && !over() && !line.truth) await answer(q, { asker: mate.name, resume: false });
        else if (said && !over() && line.truth) {
          // The professor turns to the learner, and waits for their call (buttons, typing, or the mic)
          if (await cues.play({ text: turnTo }) && !over()) {
            const wait = (mode: 'buttons' | 'open') => new Promise<string | null>((resolve) => {
              finnCheck.current = resolve;
              setFinnWaiting(mode);
              if (interruptOn) { resumeAfterTurn.current = false; micRef.current.talk(); }   // listen for it too
            });
            const first = await wait('buttons');
            if (first === null) return;   // moved on: no answer, and no "How did that section go?" on another slide
            // A back-and-forth: a one-click answer, or one with nothing to go on, gets "What makes you say
            // that?"; the learner's words then decide if there's more to ask (up to FINN_FOLLOWUPS times)
            const turns: { who: 'professor' | 'learner'; text: string }[] = [{ who: 'learner', text: first }];
            let judged: FinnKind | null = null;
            let saidRight = false;   // they've already said what's actually right (the judge's read)
            for (let round = 0; round < FINN_FOLLOWUPS && !over(); round++) {
              let ask: string | undefined;
              if (round === 0 && finnHow.current === 'button') {
                ask = pickOne(FINN_ASK[finnVerdictKind(first) === 'other' ? 'unsure' : finnVerdictKind(first) as FinnKind]);
              } else {
                const j = await judgeFinn(q, line.truth, turns);
                if (j.kind) judged = j.kind;
                saidRight = !!j.said;
                if (j.complete || !j.ask) break;
                ask = j.ask;
              }
              if (over()) return;
              turns.push({ who: 'professor', text: ask });
              tracking.track('tutor_decision', { action: 'classmate_followup', round });
              if (!(await cues.play({ text: ask })) || over()) return;
              const more = await wait('open');
              if (more === null) return;
              turns.push({ who: 'learner', text: more });
            }
            const verdict = turns.filter((t) => t.who === 'learner').map((t) => t.text).join(' … ');
            const kind = judged ?? finnVerdictKind(first);
            tracking.track('tutor_decision', { action: 'classmate_mistake_answer', answer: verdict.slice(0, 200), kind });
            finnResults.current.set(topic, { kind, truth: line.truth });   // for the ending
            if (kind !== 'other') feel(kind === 'caught' ? 'finn_caught' : kind === 'fooled' ? 'finn_fooled' : 'finn_unsure', { slide: from, box: null });
            // Fooled or unsure: after the explanation, the topic's helper ("another way to see it")
            const helper = kind === 'fooled' || kind === 'unsure' ? (MORPH_HELPERS ? helperFor(from) : null) : null;
            const you = name ? `, ${name}` : '';
            const how = kind === 'caught'
              ? `The learner CAUGHT the mistake. Start with "Good catch${you}!". If the learner already said what's actually right, tell them they're ` +
                `exactly right in a few words and DON'T repeat the facts they just said (they know them: repeating sounds like you didn't hear them); ` +
                `at most one small new detail. If they didn't say what's right, say it in one short sentence. ` +
                `Then a kind word to ${CLASSMATE_NAME} (it's an easy mix-up). 2 or 3 short sentences.`
              : kind === 'fooled'
                ? `The learner AGREED with ${CLASSMATE_NAME}, so they believe the mistake too. Start with "Actually${you}, that isn't true." Kindly explain what's right and why, ` +
                  `and say it's an easy mix-up, kindly to ${CLASSMATE_NAME} too. 3 or 4 short sentences.`
                : kind === 'unsure'
                  ? `The learner WASN'T SURE. Start with "That's a tricky one${you}." Say ${CLASSMATE_NAME} wasn't right, then explain what's right and why. 3 or 4 short sentences.`
                  : `Decide from the answer whether the learner caught the mistake. If they did, start with "Good catch${you}!" and say why in a sentence. ` +
                    `If not, start with "Actually${you}, that isn't true." and kindly explain what's right. Kindly to ${CLASSMATE_NAME} too. 2 to 4 short sentences.`;
            // Caught it and said what's right: a quick "exactly right", no explanation they already gave
            const confirmOnly = kind === 'caught' && saidRight;
            if (confirmOnly) tracking.track('tutor_decision', { action: 'classmate_caught_confirmed' });
            const { superseded } = confirmOnly ? { superseded: !(await cues.play({ text: FINN_CAUGHT_RIGHT(you) })) } : await tutor.ask(q, slideContext() +
              `\n${CLASSMATE_NAME}, a classmate, just said this, and it is WRONG on purpose, to see if the learner catches it. What's actually right: ${line.truth}` +
              `\nYou asked the learner if ${CLASSMATE_NAME} was right. ${turns.length > 1
                ? `You talked it through:\n${turns.map((t) => `${t.who === 'professor' ? 'You' : 'Learner'}: ${t.text}`).join('\n')}\nRespond to what they said, building on their reasons.`
                : `The learner answered: "${verdict || '(nothing)'}".`}` +
              `\n${how}${helper ? ' End with one short sentence saying you\'ll show it another way.' : ''} No question at the end.`,
              { asker: CLASSMATE_NAME });
            // Finn takes it well: thanks for the catch, or owns the mix-up
            if (!superseded && !over() && (kind === 'caught' || kind === 'fooled' || kind === 'unsure')) await mateSays('finn', pickOne(kind === 'caught' ? FINN_THANKS : FINN_OOPS));
            // (not when the learner talked over the answer: what they said decides what's next)
            if (helper && !superseded && !over() && playerRef.current.slideIndex === from) {
              // Then the topic's helper; "How did that section go?" after it (if the learner is still here)
              finnBusy.current = false;
              tracking.track('tutor_decision', { action: 'helper', why: 'classmate_mistake', kind });
              presentVariant({ title: '', body: '', narration: '', slide: helper, variant: 'helper' }, () => {
                if (over() || playerRef.current.slideIndex !== from) return;
                setSelfCheck({ from, to });
                cuesRef.current?.play('cue_selfCheck');
              });
              return;
            }
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
    midResume.current = false;   // (a classmate's mid-topic answer was for the slide they left)
    if (tutorBusyRef.current) cancelAnswer();
    // Answer slides (a classmate's question, the learner's) end too: was, they went on talking over the new slide
    if (detourBusy.current || variantNow.current?.variant === 'answer') {
      helperSeq.current++;
      setHelperActive(null);
      setVariant(null);
      setClassmateSaying(null);
      cuesRef.current.stop();
    }
  }, [player.slideIndex, finnVerdict, takeOverFromFinn, cancelAnswer]);
  // "Another way to see it" (a helper, or another kind of view): how long they stayed on it. Long enough to have used it:
  // the topic counts as a hard one (the classmates' question at its end clears it up). Each time is recorded for the study
  const helperOpen = useRef<{ at: number; slide: number } | null>(null);
  const helperUsed = useRef(new Set<number>());
  const closedByLearner = useRef(false);   // the "back to the lesson" button (else it finished by itself: watched to the end)
  useEffect(() => {
    const another = !!variant && variant.variant !== 'answer' && variant.variant !== 'board';
    if (another && !helperOpen.current) helperOpen.current = { at: Date.now(), slide: playerRef.current.slideIndex };
    else if (!another && helperOpen.current) {
      const { at, slide } = helperOpen.current;
      helperOpen.current = null;
      const ms = Date.now() - at;
      // watched to the end, or stayed a while before going back
      const used = !closedByLearner.current || ms >= HELPER_USED_MS;
      closedByLearner.current = false;
      tracking.track('tutor_decision', { action: used ? 'helper_used' : 'helper_left_quickly', ms, slide: deck.slides[slide]?.id });
      feel(used ? 'helper_watched' : 'helper_left', { slide, box: null });
      if (used) {
        helperUsed.current.add(topicOf[slide] ?? 0);
        noteStruggle(deck.slides[slide]?.elements.map(shownWords).join(' '), false);
      }
    }
  }, [variant, tracking, deck, topicOf, noteStruggle, feel]);
  // "How did that section go?" is up: nobody is still talking (an answer, answer slides) under it
  useEffect(() => {
    if (!selfCheck) return;
    if (tutorBusyRef.current) cancelAnswer();
    if (detourBusy.current || variantNow.current?.variant === 'answer') { helperSeq.current++; setHelperActive(null); setVariant(null); setClassmateSaying(null); }
  }, [selfCheck, cancelAnswer]);

  /** Finn's line about what was just taught (a question, or a mistake to catch), or null (none, too slow, or rate-limited). */
  const fetchClassmate = useCallback(async (topic: string, taught: string, mistake: boolean, who: ClassmateId): Promise<FinnLine | null> => {
    if (mistake) who = 'finn';   // (only Finn makes mix-ups)
    try {
      const res = await fetch('/api/classmate', {
        method: 'POST',
        headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ topic, slideText: taught.slice(0, 2000), asked: classmateAsked.current, mistake, who }),
        signal: AbortSignal.timeout(10000),
      });
      const d = res.ok ? await res.json() : null;
      return d?.question ? { question: d.question, truth: d.truth || undefined, who } : null;
    } catch {
      return null;
    }
  }, []);

  /** "Kind of" / "Lost me" on a topic: a classmate asks its leftover question closest to what was hard (its answer slide), once */
  const lostQuestion = useCallback(async (from: number) => {
    const topic = topicOf[from] ?? 0;
    if (!classmateOnRef.current || carried.current.has(topic)) return;
    const open = openQuestions(topicName(topic));
    if (!open.length) return;
    carried.current.add(topic);
    const ranked = await closestTo(struggles.current.get(topic)?.join('; ') || slideText(from), open);
    const q = ranked.find((x) => x.asker !== 'leo') ?? ranked[0];
    if (!q || playerRef.current.slideIndex !== from) return;
    mateTalkAt.current = Date.now();
    classmateWho.current.push(q.asker);
    tracking.track('tutor_decision', { action: 'classmate_lost', question: q.q.slice(0, 300), who: q.asker }, { classmate_turns: 1 });
    if (!(await mateSays(q.asker, q.q)) || playerRef.current.slideIndex !== from) return;
    if (await runDetour([{ q, ask: false }])) await endDetour();
  }, [topicOf, openQuestions, topicName, closestTo, slideText, tracking, mateSays, runDetour, endDetour]);

  /** The self-check answer: noted for the topic; "lost me" gets another way to see it first. */
  const answerSelfCheck = useCallback((rating: SelfCheckRating, inChat = false) => {
    const sc = selfCheck;
    if (!sc) return;
    if (!inChat) addLine('you', SELF_CHECK_SAID[rating]);
    tracking.track('self_check', { rating }, { self_check: rating });
    feel(rating === 'got' ? 'check_got' : rating === 'kind' ? 'check_kind' : 'check_lost', { slide: sc.from, box: null });
    checked.current.add(sc.from);
    if (rating === 'lost' || rating === 'kind') shaky.current.add(topicOf[sc.from] ?? 0);   // (the next topic: its classmates go gently, and bring this one's leftover question up)
    setSelfCheck(null);
    cues.stop();
    // 'kind of' and 'lost me': the professor offers another way to see it first ('lost me' the
    // gentler, remedial kind). Was: shown straight away, even to a learner who was only a bit unsure
    if (rating === 'lost' || rating === 'kind') {
      setReplayOffer({ to: sc.to, from: sc.from, mood: rating === 'lost' ? 'frustrated' : 'confused', rating });
      cues.play({ text: rating === 'lost' ? REPLAY_ASK_LOST : REPLAY_ASK_KIND });
    } else playerRef.current.goToSlide(sc.to);
  }, [selfCheck, tracking, cues, addLine, feel]);

  // "Want to see that part a different way?" after "kind of" / "lost me": a button, or said / typed
  const [replayOffer, setReplayOffer] = useState<{ to: number; from: number; mood: 'confused' | 'frustrated'; rating: SelfCheckRating } | null>(null);
  const answerReplay = useCallback((yes: boolean, how: 'button' | 'said') => {
    const offer = replayOffer;
    if (!offer) return;
    tracking.track('tutor_decision', { action: 'replay_offer', rating: offer.rating, answer: yes ? 'yes' : 'no', how });
    if (how === 'button') addLine('you', yes ? 'Yes, show me' : 'No, keep going');
    setReplayOffer(null);
    cues.stop();
    // then (another way to see it, or not) a classmate asks the topic's leftover question closest to what was hard, before
    // moving on: about this topic, here (was: in the middle of the next topic, where it didn't fit the slide)
    const next = () => { void lostQuestion(offer.from).then(() => { if (playerRef.current.slideIndex === offer.from) playerRef.current.goToSlide(offer.to); }); };
    if (yes) confused(next, offer.mood, false);   // (the section check counted it)
    else next();
  }, [replayOffer, tracking, cues, confused, addLine, lostQuestion]);

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
    addLine('you', text);
    if (finnCheck.current) { if (!parseCanvasCommand(text)) { finnVerdict(text, 'typed', true); return; } finnVerdict(null, 'typed'); }
    takeOverFromFinn();   // the learner's own question or command during Finn's turn: theirs goes first
    if (replayOffer) {
      // "yes" / "show me" or "no" / "keep going"; anything else (a question) is handled as usual, and the offer stays
      const t = text.trim();
      if (YES.test(t) || /\b(show me|another way|again)\b/i.test(t)) return answerReplay(true, 'said');
      if (NO.test(t) || /\b(next|move on|keep going|continue)\b/i.test(t)) return answerReplay(false, 'said');
    }
    if (selfCheck) {
      const t = text.toLowerCase();
      if (/\b(lost|confus|no\b|nope|didn'?t|don'?t)/.test(t)) return answerSelfCheck('lost', true);
      if (/\b(kind of|kinda|sort of|sorta|a bit|a little|maybe|so so|okay-ish|meh)\b/.test(t)) return answerSelfCheck('kind', true);
      if (/\b(got it|yes|yeah|yep|good|great|easy|fine|sure|understood|next|continue|go on)\b/.test(t)) return answerSelfCheck('got', true);
    }
    const cmd = parseCanvasCommand(text);
    if (variant && variantMode.current === 'narrated') { cues.stop(); setVariant(null); variantAfter.current = null; }
    askTurn.current++;   // (a newer turn: an older question's follow-ups stop)
    if (!cmd) { feel(questionSignal(text)); askClass(text); return; }   // (a question: curiosity, unless it asks what something means)
    if (tutorBusy) tutor.cancel();   // a command ends the answer
    const command = (kind: string, patch?: Parameters<typeof tracking.track>[2]) => {
      if (kind.startsWith('next')) feel('skip');   // (skipping ahead: disengagement, not confusion)
      return tracking.track(kind === 'repeat' ? 'repeat_request' : kind === 'simplify' ? 'simplify_request' : 'deck_command', { kind }, patch);
    };
    const p = player;
    switch (cmd.kind) {
      case 'nextClip': command('nextClip', { skips: 1 }); act('cmd_nextClip', () => playerRef.current.nextClip()); break;
      case 'nextSlide': command('nextSlide', { skips: 1 }); act('cmd_nextSlide', () => playerRef.current.nextSlide()); break;
      case 'prevSlide':
        command('prevSlide');
        if (p.slideIndex === 0) act('cmd_atStart', () => playerRef.current.repeat());
        else { feel('went_back', { slide: p.slideIndex - 1, box: null }); act('cmd_prevSlide', () => playerRef.current.prevSlide()); }
        break;
      case 'nextTopic':
        command('nextTopic', { skips: 1 });
        act(p.topicIndex >= p.topicCount - 1 ? 'cmd_wrapUp' : 'cmd_nextTopic', () => playerRef.current.nextTopic());
        break;
      case 'repeat': command('repeat', { repeats: 1 }); noteStruggle(); feel('again'); act('cmd_repeat', () => playerRef.current.repeat()); break;
      case 'simplify':
        if (CONFUSED.test(text)) { confused(); break; }   // "you lost me": another way to see it
        command('simplify', { simplify_requests: 1 });
        noteStruggle();
        feel('simpler');
        act('cmd_simplify', () => playerRef.current.simplify());
        break;
      case 'showSlide': showSlide(cmd.query); break;
      case 'goTo': {
        const go = (target: number | null) => {
          if (target !== null) { command('goTo', { jumps: 1 }); act('cmd_goto', () => playerRef.current.goToSlide(target)); }
          else if (cmd.soft) askClass(text);   // "tell me about X": not on a slide, so the professor answers
          else act('cmd_notFound', () => playerRef.current.resume());
        };
        const quick = findSlide(deck, cmd.query, p.slideIndex);
        if (quick !== null) go(quick);
        else searchByMeaning(deck, cmd.query).then(go);   // keywords weren't sure: search by meaning
        break;
      }
    }
  }, [deck, player, act, askClass, confused, showSlide, tutor, tutorBusy, tracking, variant, cues, selfCheck, answerSelfCheck, finnVerdict, replayOffer, answerReplay, noteStruggle, feel]);

  // Barge-in: with interruptions on, starting to talk over the professor (or
  // over an answer) makes them finish the sentence, then stop and listen.
  const speakingNow = ['playing', 'loading', 'finishing'].includes(player.status) || tutor.speaking;
  const { status: micStatus, talk, levelRef } = useListener({
    armed: interruptOn && started,
    bargeActive: speakingNow,
    onListenStart: () => {
      resumeAfterTurn.current = playerRef.current.status !== 'paused' || checkIn.current !== null;
      // (while answers to class questions are being given, a noise as the answer is still being written doesn't
      // cancel it: was the answer slide left up on "…". Words they actually say still take over, as a new question)
      if (tutor.speaking || (tutor.thinking && !detourBusy.current)) tutor.finishSentence();
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
      // (not under answer slides, or a helper: the lesson would play over them)
      else if (resumeAfterTurn.current && !tutor.thinking && !detourBusy.current && !variantNow.current) playerRef.current.resume();
    },
  });
  micRef.current = { status: micStatus, talk };

  // The end, first: the quiz (if the lesson has one, and it hasn't been done or skipped this time through)
  // (not in the study: its own quizzes come after the lesson, and this one would show answers to them)
  const quizPool = !study && deck.quiz && !deck.quiz.off && deck.quiz.questions.length >= QUIZ_ASKED ? deck.quiz.questions : null;
  useEffect(() => {
    if (player.status !== 'finished' || !quizPool) return;
    setQuiz((q) => (q.state === 'waiting' ? { state: 'asking', questions: pickQuiz(quizPool, QUIZ_ASKED), right: 0 } : q));
  }, [player.status, quizPool]);
  const quizShowing = player.status === 'finished' && !!quizPool && (quiz.state === 'waiting' || quiz.state === 'asking');
  const endQuiz = (how: 'done' | 'skipped', right = 0) => {
    cues.stop();
    tracking.track('tutor_decision', how === 'done' ? { action: 'quiz_done', right, of: quiz.questions.length } : { action: 'quiz_skip' });
    setQuiz((q) => ({ ...q, state: how, right }));
  };

  // The end, quick and about the learner: one line on what they covered, what they did (hands-on, the quiz, Finn's
  // mix-ups, questions, minutes), "Marine out!". One clip. (was: "Let's look back…", a 60-100 word recap of the facts,
  // the trickiest part and a reminder, and a goodbye: SPOKEN_FULL_RECAP)
  const { play: playCue, stop: stopCue, preload: preloadCue } = cues;   // stable, unlike `cues` (which changes as lines start and stop)
  const { stateOf } = tracking;
  useEffect(() => {
    if (player.status !== 'finished' || quizShowing) return;   // (after the quiz)
    let cancelled = false;
    // The recap and the personal line are ONE clip (no gap around the name),
    // made while "Let's look back…" is playing
    if (!SPOKEN_FULL_RECAP) {
      const solved = [...activitiesSolved.current].filter((id) => !activitiesRevealed.current.has(id)).length;
      const minutes = lessonStartedAt.current ? Math.max(1, Math.round((Date.now() - lessonStartedAt.current) / 60000)) : 0;
      const line = endingLine({
        name: learnerName.trim(), covered: shortRecap(deck), solved,
        quiz: quiz.state === 'done' ? { right: quiz.right, of: quiz.questions.length } : null,
        finn: [...finnResults.current.values()].filter((r) => r.kind !== 'other').map((r) => r.kind === 'caught'),
        questions: learnerQuestions.current, minutes,
      });
      preloadCue(line);
      playCue({ text: line });
      return () => { cancelled = true; stopCue(); };
    }
    const recap = [deck.recap?.trim(), personalRecap(learnerName.trim(), hardestTopic(deck, topicOf, stateOf, finnResults.current), finnResults.current)].filter(Boolean).join(' ');
    if (recap) preloadCue(recap);
    (async () => {
      if (!(await playCue('cue_conclusionIntro')) || cancelled) return;
      if (recap && (!(await playCue({ text: recap })) || cancelled)) return;
      await playCue('cue_conclusionOutro');
    })();
    return () => { cancelled = true; stopCue(); };
    // learnerName: as it was when the lesson ended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status, quizShowing, deck, topicOf, stateOf, playCue, stopCue, preloadCue]);

  /* ------------------------------------------------ camera: the instructor notices */

  // The mic is mid-turn (it can be 'off' when interruptions are off: that's free)
  const micBusy = micStatus === 'listening' || micStatus === 'processing';

  // Emotion check-in: sustained confusion or boredom on camera → the professor
  // finishes the sentence, asks, and listens; "yes" helps, silence carries on.
  const onEmotion = useCallback((state: LearnerEmotion) => {
    // (into the meter whatever's going on: a camera guess, low weight; a bored face counts apart)
    if (state === 'confused' || state === 'bored') feel(state === 'confused' ? 'puzzled' : 'bored');
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
    if (state === 'confused') noteStruggle();
    p.interrupt(() => {
      cues.play(state === 'confused' ? 'cue_confused' : 'cue_bored').then((ok) => {
        if (!ok) return;
        checkIn.current = state;
        setAskingHelp(state);
        resumeAfterTurn.current = true;
        talk();
      });
    });
  }, [started, tutorBusy, variant, micStatus, tracking, cues, talk, noteStruggle, feel]);
  /** The Yes / No buttons under a check-in (for learners without a working mic, or who'd rather click). */
  const answerCheckInButton = (yes: boolean) => {
    const asked = checkIn.current;
    if (!asked) return;
    checkIn.current = null;
    checkInAnswered(asked, yes ? 'yes' : 'no', 'button');
    addLine('you', yes ? 'Yes' : 'No thanks');
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
    noteStruggle(`${m.item} (goes with ${m.correct})`);
    const key = `${id}|${m.item}`;
    const n = (mistakeCounts.current.get(key) ?? 0) + 1;
    mistakeCounts.current.set(key, n);
    feel(n >= 2 ? 'wrong_again' : 'wrong_move', { box: id, same: m.item });
    const done = steppedIn.current.get(id) ?? new Set<string>();
    if (n < STEP_IN_AFTER || done.has(m.item) || done.size >= STEP_IN_MAX || yourTurnRef.current !== id || tutorBusyRef.current) return;
    done.add(m.item);
    steppedIn.current.set(id, done);
    const box = deck.slides[playerRef.current.slideIndex]?.elements.find((e) => e.id === id);
    const order = box?.type === 'activity' && box.kind === 'order';
    track('tutor_decision', { action: 'activity_help', item: m.item.slice(0, 80) }, { confusion_marks: 1 });
    feel('stepped_in', { box: id, same: m.item });
    setActivityGuides((g) => ({ ...g, [id]: order ? m.correct : m.item }));
    setActivityHint((h) => h + 1);
    cuesRef.current.stop();   // (a line still going, like Finn's)
    stepInFor.current = id;
    tutor.ask(order ? `${m.item} first? (${n} tries)` : `${m.item} → ${m.chosen}? (${n} tries)`,
      slideContext() + (order
        ? `\nThe learner is doing the hands-on activity and has tapped "${m.item}" too early ${n} times; what comes next is "${m.correct}". They're stuck, so this time it's fine to say it: in 1-2 short, kind sentences, explain why "${m.correct}" has to happen before "${m.item}". No question at the end.`
        : `\nThe learner is doing the hands-on activity and has put "${m.item}" in "${m.chosen}" ${n} times; it belongs in "${m.correct}". They're stuck, so this time it's fine to say where it goes: in 1-2 short, kind sentences, explain WHY "${m.item}" belongs in "${m.correct}" (the reason, from the lesson). No question at the end.`),
      { asker: '🖐 Hands-on', remember: `(The learner kept getting "${m.item}" wrong in the hands-on activity; the professor explained it.)` })
      .finally(() => { if (stepInFor.current === id) stepInFor.current = null; });
  }, [track, deck, tutor, slideContext, noteStruggle, feel]);
  const stepInFor = useRef<string | null>(null);   // the box the professor is explaining right now (after repeated mistakes)

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
        setClassmateSaying('finn');
        await cuesRef.current.play({ text: finnHandsOnLine(e), who: 'finn' });
        setClassmateSaying(null);
      });
    } else if (e.type === 'fixed') {
      track('tutor_decision', { action: 'activity_finn_caught', item: e.item.slice(0, 80) });
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: goodCatch(e.item, e.group, name) }) : undefined));
    } else if (e.type === 'revealed') {
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: NICE_TRY }) : undefined));
    } else if (e.type === 'stuck') {
      feel('hint', { box: id });
      setActivityHint((h) => h + 1);
      queueLine(() => (onBox(id) ? cuesRef.current.play({ text: TAKE_ANOTHER_LOOK }) : undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerName, track, queueLine, feel]);

  // Finn's plan for each hands-on box on a slide, made when the slide starts (so his line is ready to say)
  const finnPlans = useRef(new Map<string, Omit<FinnMove, 'nonce'>>());
  useEffect(() => {
    const s = deck.slides[player.slideIndex];
    const boxes = (s?.elements ?? []).filter((e): e is ActivityElement => e.type === 'activity' && activityReady(e));
    if (!boxes.length) return;
    preloadCue(praise);   // (a box can be finished before its turn: the praise is ready then too)
    // a fresh visit: no move from last time, no guide, mistakes counted again
    setFinnMoves((m) => { const n = { ...m }; for (const b of boxes) delete n[b.id]; return n; });
    setActivityGuides((g) => { const n = { ...g }; for (const b of boxes) delete n[b.id]; return n; });
    for (const b of boxes) {
      finnPlans.current.delete(b.id);
      steppedIn.current.delete(b.id);
      for (const k of [...mistakeCounts.current.keys()]) if (k.startsWith(`${b.id}|`)) mistakeCounts.current.delete(k);
      if (!classmateOnRef.current) continue;
      // Finn plays against the answer key: not on a box whose key the knowledge base didn't back up
      // (or that changed since it was checked). Older lessons, never checked, he still plays.
      if (b.answerCheck && (!b.answerCheck.ok || b.answerCheck.from !== answerBasis(b))) continue;
      const items = b.items ?? [];
      const pick = Math.floor(Math.random() * items.length);
      if (b.kind === 'sort' && items.length >= 3 && (b.groups?.length ?? 0) >= 2) {
        const groups = b.groups!;
        const right = items[pick].group ?? 0;
        const group = (right + 1 + Math.floor(Math.random() * (groups.length - 1))) % groups.length;
        finnPlans.current.set(b.id, { item: pick, group });
        cuesRef.current.preload(finnHandsOnLine({ item: items[pick].text, group: groups[group] }), 'finn');
      } else if (b.kind === 'cards' && items.length >= 2 && items[pick].back) {
        fetch('/api/classmate', {
          method: 'POST', headers: learnerHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ guess: { front: items[pick].text, back: items[pick].back } }), signal: AbortSignal.timeout(8000),
        }).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (!d?.guess) return;
          finnPlans.current.set(b.id, { item: pick, guess: d.guess });
          cuesRef.current.preload(finnHandsOnLine({ item: items[pick].text, guess: d.guess }), 'finn');
        }).catch(() => {});
      }
    }
  }, [player.slideIndex, deck]);

  const onActivityDone = useCallback((id: string) => {
    // Solved while the professor explains the item they kept getting wrong: the explanation stops (they've got
    // it), so it doesn't carry on over the praise and what comes next (was: the two overlapped)
    if (stepInFor.current === id) { stepInFor.current = null; tutor.cancel(); }
    activitiesDone.current.add(id);
    activitiesSolved.current.add(id);
    setSettledTick((n) => n + 1);
    const began = turnStarted.current.get(id);
    turnStarted.current.delete(id);
    track('tutor_decision', { action: 'activity_done', ...(began ? { seconds: Math.round((Date.now() - began) / 1000) } : {}) });
    // solved on the first try (no wrong move, hint or "I'm lost" at it): a good sign
    const i = playerRef.current.slideIndex;
    if (!meter.current.point({ topic: topicOf[i] ?? 0, slide: i, box: id })?.total) feel('solved', { box: id });
    if (yourTurnRef.current !== id) {
      // Done before its turn (while the professor says what to do, or before he gets to it): no sitting
      // through instructions they no longer need. He stops, the praise, then on past the box.
      // (was: the lesson just carried on, and the learner waited out the explanation)
      const p = playerRef.current;
      const at = p.clipOf(id);
      if (at < 0 || at < p.clipIndex || p.status === 'finished') return;   // (its turn has been and gone)
      track('tutor_decision', { action: 'activity_done_early' });
      p.hold();
      cuesRef.current.stop();
      const slide = p.slideIndex;
      queueLine(() => playCue({ text: praise })).then(() => { if (playerRef.current.slideIndex === slide) playerRef.current.skipPast(id); });
      return;
    }
    setYourTurn(null);
    // after the professor (an explanation, a reply to Finn) has finished, not over them
    queueLine(() => playCue({ text: praise })).then(() => { if (playerRef.current.activeId === id) playerRef.current.nextClip(); });
  }, [track, playCue, praise, queueLine, tutor, topicOf, feel]);
  /** Skip: the box fills in its answers (so the learner still sees how it goes), a word from the professor, then on. */
  const skipActivity = () => {
    const id = yourTurnRef.current;
    if (!id) return;
    tracking.track('tutor_decision', { action: 'activity_skip' });   // a skip, not a solve (learner stats)
    feel('skip', { box: id });
    activitiesDone.current.add(id);
    activitiesSolved.current.add(id);
    activitiesRevealed.current.add(id);
    setSettledTick((n) => n + 1);
    setYourTurn(null);
    cuesRef.current.stop();   // Finn (or a reply) mid-line: not over what comes next
    // a moment to look at the answers while it's said, then the lesson goes on (if still on that box)
    queueLine(() => playCue({ text: SKIP_LINE })).then(() => new Promise((r) => setTimeout(r, SKIP_LOOK_MS)))
      .then(() => { if (playerRef.current.activeId === id) playerRef.current.nextClip(); });
  };
  // Cards: the box waits a moment for a guess (Activity.tsx); said once, unless the instructions already ask for a guess
  useEffect(() => {
    if (!yourTurn) return;
    const el = deck.slides[player.slideIndex]?.elements.find((e) => e.id === yourTurn);
    if (el?.type !== 'activity' || el.kind !== 'cards' || /\bguess/i.test(spokenText(el))) return;
    queueLine(() => (yourTurnRef.current === yourTurn ? playCue({ text: THINK_LINE }) : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTurn]);
  // Back on a hands-on slide (going back, or starting over): the lesson waits for it again
  useEffect(() => {
    for (const e of deck.slides[player.slideIndex]?.elements ?? []) {
      if (e.type === 'activity') { activitiesDone.current.delete(e.id); activitiesSolved.current.delete(e.id); activitiesRevealed.current.delete(e.id); }
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
      if (replayOffer && !variant && ['y', 'n'].includes(e.key.toLowerCase()) && t?.tagName !== 'INPUT') { answerReplay(e.key.toLowerCase() === 'y', 'button'); return; }
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest?.('[data-activity]'))) return;
      if (t?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;   // the button's own click (was: clicked AND pause/resume)
      if (e.key === 'ArrowRight' && e.shiftKey) skipTo(player.nextSlide);
      else if (e.key === 'ArrowRight') skipTo(player.nextClip);
      else if (e.key === 'PageDown') skipTo(player.nextSlide);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goBack();
      else if (e.key === ' ') { e.preventDefault(); if (player.status === 'paused') resumeLesson(); else player.pause(); }
      else if (e.key.toLowerCase() === 'r') { feel('again'); player.repeat(); }
      else if (e.key.toLowerCase() === 's') { feel('simpler'); player.simplify(); }
      else if (e.key.toLowerCase() === 'l') confused();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, player, confused, selfCheck, variant, answerSelfCheck, replayOffer, answerReplay, feel]);

  // What the slide shows right now: the slide, the helper it morphed into, or
  // the element being explained, focused and in plain words
  const baseSlide = deck.slides[player.slideIndex];
  const focusId = player.mode === 'plain' ? player.activeId : null;
  const shownSlide = useMemo(() => {
    if (!MORPH_HELPERS || !baseSlide) return baseSlide;
    if (variant?.slide) return variant.slide;   // the slide's own helper
    if (variant) return helperSlide(baseSlide, variant);
    // (never for a topic introduction: it isn't on the slide, so there's nothing to focus)
    if (player.mode === 'plain') return isIntroId(focusId) ? baseSlide : focusSlide(baseSlide, focusId) ?? baseSlide;
    return baseSlide;
  }, [baseSlide, variant, player.mode, focusId]);

  /**
   * ▶ Resume (the button, Space): the lesson goes on, and whatever is talking now stops first: the
   * professor's answer, or Finn's turn. Was: the answer went on and the slide's audio started over it.
   */
  function resumeLesson() {
    if (variant?.variant === 'answer') { closeVariant(); return; }   // answer slides up: like "Back to the lesson" (on to what's next)
    if (finnBusy.current) { finnVerdict(null, 'button'); takeOverFromFinn(); finnTurn.current++; finnBusy.current = false; }
    if (tutorBusyRef.current || tutor.speaking || tutor.thinking) cancelAnswer();
    cues.stop();
    playerRef.current.resume();
  }
  /** ⏮ / ←: back a slide (into the meter: maybe unclear, maybe just curious) */
  function goBack() {
    const i = playerRef.current.slideIndex;
    if (i > 0) feel('went_back', { slide: i - 1, box: null });
    playerRef.current.prevSlide();
  }
  /** ⏭ ⏩ / →: skipping ahead (into the meter, apart: disengagement, not confusion) */
  function skipTo(move: () => void) {
    feel('skip');
    move();
  }

  /** A fresh lesson from the first slide: Finn asks again, hands-on boxes wait again (the end screen, and ↺ at the top left). */
  function startOver() {
    // whatever is going on now stops: an answer, Finn's turn, a helper
    // (always, not only when they look busy: an answer still loading its first sentence, or Finn's
    // turn between his line and the answer, didn't, and went on over the restarted lesson)
    finnVerdict(null, 'button');
    takeOverFromFinn();
    finnTurn.current++;   // a Finn turn in progress sees it's over at its next step
    finnBusy.current = false;
    cancelAnswer();
    setClassmateSaying(null);
    if (variant) { variantAfter.current = null; variantMode.current = 'answer'; setVariant(null); helperSeq.current++; setHelperActive(null); }
    checked.current.clear(); activitiesDone.current.clear(); activitiesSolved.current.clear(); activitiesRevealed.current.clear(); classmateTopics.current.clear(); classmateAsked.current = []; finnReady.current.clear(); finnResults.current.clear();
    classmateWho.current = []; lastMixUp.current = -2; curious.current.clear(); struggles.current.clear();
    midTopics.current.clear(); shaky.current.clear(); carried.current.clear(); helperUsed.current.clear(); midMatch.current.clear(); midPending.current = null; midResume.current = false; struggleSlide.current = -1; mateTalkAt.current = 0;
    finnSpoken.current.clear(); mistakeCounts.current.clear(); steppedIn.current.clear();
    meter.current.reset(); liveLevel.current = 'clear'; topicLeft.current = null;
    // (a preview never touches the learner's saved place in this browser)
    setSelfCheck(null); setYourTurn(null); cues.stop(); if (!preview) forgetProgress(); player.restart();
    lessonStartedAt.current = Date.now();
    setQuiz({ state: 'waiting', questions: [], right: 0 });
    setReplayOffer(null);
    setChat([]);   // a fresh lesson: a fresh chat
    bankAsked.current.clear();
    learnerQuestions.current = 0;
    topicsSeen.current.clear(); endsSinceTurn.current = 0; endsCounted.current.clear();
  }

  function startLesson(from?: Progress & { index: number }) {
    if (from) {
      // back where they were, with Finn's turns as they were
      finnResults.current = new Map(from.finn);
      classmateTopics.current = new Set(from.asked);
      if (from.mates) {
        classmateWho.current = from.mates.who; lastMixUp.current = from.mates.mixUp; struggles.current = new Map(from.mates.struggles);
        midTopics.current = new Set(from.mates.mid); shaky.current = new Set(from.mates.shaky); carried.current = new Set(from.mates.carried); helperUsed.current = new Set(from.mates.used ?? []);
      }
      if (from.meter) meter.current.restore(from.meter);
      player.goToSlide(from.index);
    }
    setStarted(true);
    lessonStartedAt.current = Date.now();
    const name = learnerName.trim();
    if (!study) try { localStorage.setItem('learnerName', name); } catch { /* private mode */ }
    // A name: a personal hello (spoken live); otherwise the recorded intro. Coming back: "Welcome back"
    (from ? cues.play({ text: welcomeBack(name) }) : name ? cues.play({ text: greeting(name) }) : cues.play('cue_intro')).finally(() => setIntroDone(true));
  }

  if (!started) {
    const length = lessonLength(deck.slides);
    const plan = {
      minutes: Math.max(1, Math.round(length.total / 60)),
      topics: length.topics.map((t) => deck.slides[t.start]?.topic?.trim()).filter((t): t is string => !!t),
    };
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">
        {preview && <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold">{deck.source === 'ai' ? 'Preview of the AI deck' : 'Preview of the saved draft'}</div>}
        <h1 className="text-4xl font-bold text-center">{deck.title}</h1>
        {/* What's ahead: the parts and about how long (learners who know where they're going take in more) */}
        {plan.topics.length > 0 && (
          <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 px-5 py-4" data-lesson-goals>
            <p className="text-sm font-semibold text-cyan-200">In about {plan.minutes} minute{plan.minutes === 1 ? '' : 's'} you&apos;ll learn:</p>
            <ol className="mt-2 flex flex-col gap-1.5">
              {plan.topics.map((t, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-200 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-slate-300 text-center max-w-md">🔊 Turn your sound on. Ask the professor anything, or say &quot;next&quot;, &quot;next slide&quot;, &quot;repeat&quot; or &quot;simpler please&quot; at any time.</p>
        {/* (the study is anonymous: no name) */}
        {!study && <label className="flex flex-col items-center gap-1 text-sm text-slate-300">
          What should Professor Marine call you? (optional)
          <input
            value={learnerName}
            onChange={(e) => setLearnerName(e.target.value.replace(/[^\p{L}\p{N} '.-]/gu, '').slice(0, 24))}
            onKeyDown={(e) => { if (e.key === 'Enter') startLesson(resume ?? undefined); }}
            autoFocus
            placeholder="Your first name"
            maxLength={24}
            className="px-3 py-2 rounded-lg bg-white/10 text-white text-center placeholder:text-white/40 outline-none focus:bg-white/15 w-56"
          />
        </label>}
        {resume ? (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => startLesson(resume)}
              className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold"
            >
              Continue where you left off
            </button>
            <span className="text-sm text-slate-300">Slide {resume.index + 1} of {deck.slides.length}{deck.slides[resume.index].topic ? ` · ${deck.slides[resume.index].topic}` : ''}</span>
            <button onClick={() => { forgetProgress(); startLesson(); }} className="text-sm text-slate-300 underline hover:text-white">Start from the beginning</button>
          </div>
        ) : (
          <button
            onClick={() => startLesson()}
            className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold"
          >
            Start Lesson
          </button>
        )}
      </main>
    );
  }

  const slide = deck.slides[player.slideIndex];
  // the end screen: the hardest topic, to go over again
  const hardestName = player.status === 'finished' ? hardestTopic(deck, topicOf, stateOf, finnResults.current) : null;
  const finnSummary = player.status === 'finished' ? finnScore(finnResults.current) : '';
  const finishedHardest = hardestName ? { name: hardestName, index: deck.slides.findIndex((s) => s.topic?.trim() === hardestName) } : null;
  // What the learner did, for the end screen
  const achievements: { icon: string; text: React.ReactNode }[] = [];
  if (player.status === 'finished') {
    const topics = lessonLength(deck.slides).topics.map((t) => deck.slides[t.start]?.topic?.trim()).filter(Boolean);
    achievements.push({ icon: '📚', text: topics.length > 1 ? <>You finished every part: <b>{topics.join(', ')}</b></> : <>You finished the lesson{topics[0] ? <>: <b>{topics[0]}</b></> : ''}</> });
    const handsOn = [...activitiesSolved.current].filter((id) => !activitiesRevealed.current.has(id)).length;
    if (handsOn) achievements.push({ icon: '🖐', text: <>You solved <b>{handsOn}</b> hands-on activit{handsOn === 1 ? 'y' : 'ies'} yourself</> });
    if (quiz.state === 'done') achievements.push({ icon: '🧠', text: <>Quiz: <b>{quiz.right}</b> of <b>{quiz.questions.length}</b> right{quiz.right === quiz.questions.length ? '. Perfect!' : ''}</> });
    if (finnSummary) achievements.push({ icon: '🙋', text: finnSummary });
    const asked = learnerQuestions.current;
    if (asked) achievements.push({ icon: '✋', text: <>You asked <b>{asked}</b> question{asked === 1 ? '' : 's'}: curious minds learn more</> });
    const minutes = lessonStartedAt.current ? Math.max(1, Math.round((Date.now() - lessonStartedAt.current) / 60000)) : 0;
    if (minutes) achievements.push({ icon: '⏱', text: <>You stuck with it for <b>{minutes}</b> minute{minutes === 1 ? '' : 's'}</> });
  }
  const btn = 'px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40';
  const group = 'flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10';
  // a button's name: hidden (but read out) on a phone, and on a phone turned sideways
  const label = 'max-sm:sr-only [@media(max-height:500px)]:sr-only';
  const ctl = (icon: string, name: string, props: { onClick: () => void; disabled?: boolean; title?: string }) => (
    <button className={btn} onClick={props.onClick} disabled={props.disabled} title={props.title ?? name} aria-label={name}>
      <span aria-hidden>{icon}</span><span className={label}> {name}</span>
    </button>
  );

  // The class chat and the classmates: beside the slide when there's room (the chat on the right; on a wide
  // screen the chat on the left and the classmates on the right), else pull-outs from the left and right
  const chatDocked = desk && chatOpen;
  const matesDocked = wide && chatOpen;
  const chatShown = chatDocked || pulled === 'chat';
  const matesShown = matesDocked || pulled === 'mates';
  const talking: Speaker | null = classmateSaying ?? (cues.saying || tutor.speaking || ['playing', 'finishing'].includes(player.status) ? 'professor' : null);
  const lastChat = chat[chat.length - 1];
  const slideEntry = chat[slideEntryAt(chat)];
  const liveSlide = slideEntry?.kind === 'slide' && slideEntry.slide === player.slideIndex && !variant ? slideEntry.id : null;
  const chatUnread = !chatShown && chat.some((e) => e.id > chatSeenId && e.kind !== 'slide');
  const matesUnread = !matesShown && chat.some((e) => e.id > matesSeenId && e.kind === 'line' && e.who !== 'professor' && e.who !== 'you');
  // The chat's latest line under the slide, when the chat isn't showing (tap it for the whole chat)
  const peekShown = !chatShown && (desk || chatOpen) && player.status !== 'finished' && !(shortScreen && yourTurn) && !!lastChat;
  const openChat = () => { if (desk) setChatOpen(true); else setPulled('chat'); };
  const mainStyle = {
    ...(chatDocked ? { '--slide-max-w': wide ? 'calc(100vw - 40rem - 4.5rem)' : 'calc(100vw - 22rem - 3rem)' } : {}),
    '--peek-h': peekShown ? '3.75rem' : '0px',
    paddingLeft: chatDocked && wide ? 'calc(22rem + 1.5rem)' : undefined,
    paddingRight: chatDocked ? (wide ? 'calc(18rem + 1.5rem)' : 'calc(22rem + 1.5rem)') : undefined,
  } as React.CSSProperties;
  const edgeBtn = 'relative px-2.5 py-1 max-sm:w-8 max-sm:h-8 max-sm:px-0 max-sm:text-base rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors normal-case tracking-normal';
  const dot = <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" aria-label="new" />;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white px-4 py-4 max-sm:px-2 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:py-2" style={mainStyle}>
      {/* (a phone turned sideways: out of the way while it's the learner's turn, so the hands-on box has the screen, and on the end screen) */}
      {SHOW_FLOATING_TRANSCRIPT && showTranscript && !(shortScreen && (yourTurn || player.status === 'finished')) && (cues.saying
        ? <Transcript speaker={classmateSaying ? `${CLASSMATES[classmateSaying].name} · classmate` : 'Professor Marine'} text={cues.saying} dialogue={tutor.history} />
        : tutor.speaking || tutor.thinking
          ? <Transcript speaker="Professor Marine · answering" text={tutor.exchange?.answer || (tutor.thinking ? 'thinking…' : '')} dialogue={earlierDialogue}
              question={tutor.exchange ? { text: tutor.exchange.question, asker: tutor.exchange.asker } : undefined} />
          : !selfCheck && <Transcript speaker={player.mode === 'plain' ? 'Professor Marine · plain version' : 'Professor Marine'} text={player.captionText} getAudio={player.getAudio} dialogue={tutor.history} />)}
      <div className="w-full max-w-5xl flex items-start gap-2">
      {/* left: the chat (when it isn't showing) and start over; right: the classmates (when they aren't showing) */}
      <div className="flex-1 flex items-center gap-1 min-w-0">
        {!chatShown && (
          <button className={edgeBtn} onClick={openChat} aria-label="Open the class chat" title="The class chat">💬<span className={label}> Chat</span>{chatUnread && dot}</button>
        )}
        {/* Start over from the first slide: small and out of the way (the lesson may have picked up where they left off).
            (was: fixed at the top left, where the chat now goes on a wide screen) */}
        {player.status !== 'finished' && !study && (
          <button onClick={() => { if (window.confirm('Start the lesson over from the first slide?')) startOver(); }} className={edgeBtn}
            title="Start the lesson over from the first slide" aria-label="↺ Start over">↺<span className={label}> Start over</span></button>
        )}
      </div>
      <div className="text-xs uppercase tracking-widest text-cyan-200/70 text-center">
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
      <div className="flex-1 flex items-center justify-end min-w-0">
        {!matesShown && matesAllowed && (
          <button className={edgeBtn} onClick={() => setPulled('mates')} aria-label="Open the classmates" title="Your classmates: Maya, Finn and Leo">🙋<span className={label}> Classmates</span>{matesUnread && dot}</button>
        )}
      </div>
      </div>

      {cameraOn && <CameraBubble sees={cameraSees} progress={handProgress} />}

      {/* A phone held upright: the slide (and a hands-on box) is small, so suggest turning it.
          Shown again when a hands-on box starts, if it was closed */}
      {phonePortrait && !rotateClosed.has(yourTurn ?? 'lesson') && player.status !== 'finished' && (
        <div className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-white/10 border border-white/15 text-sm" role="note" data-rotate-hint>
          <span aria-hidden className="inline-block animate-[rotate-hint_2.4s_ease-in-out_infinite]">📱</span>
          <span>{yourTurn ? 'Turn your phone sideways: the hands-on box gets bigger' : 'Turn your phone sideways for a bigger slide'}</span>
          <button className="w-7 h-7 rounded-full hover:bg-white/15 text-white/70" onClick={() => setRotateClosed((c) => new Set(c).add(yourTurn ?? 'lesson'))} aria-label="Close">✕</button>
        </div>
      )}
      <div className="relative" data-bubble-avoid data-bubble-slide>
        {quizShowing ? (
          quiz.state === 'asking' && (
            <Quiz questions={quiz.questions} width={SLIDE_WIDTH} say={(text) => playCue({ text })}
              onAnswer={(i, right) => tracking.track('tutor_decision', { action: 'quiz_answer', right, q: quiz.questions[i]?.q.slice(0, 120) })}
              onDone={(right) => endQuiz('done', right)} onSkip={() => endQuiz('skipped')} />
          )
        ) : player.status === 'finished' ? (
          // The end: what the learner did, as achievements popping in one by one (was: the recap's
          // text again, which Professor Marine says anyway, and only "Start over")
          <div
            className="flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-cyan-50 to-white text-slate-900 rounded-2xl p-6 sm:p-10 text-center max-sm:!aspect-auto [@media(max-height:500px)]:!aspect-auto [@media(max-height:500px)]:p-4"
            style={{ width: SLIDE_WIDTH, aspectRatio: '16 / 9' }} data-end-screen
          >
            <div aria-hidden className="text-4xl sm:text-5xl animate-[pop-in_500ms_ease-out_both]">🎉</div>
            <h2 className="text-2xl sm:text-3xl font-bold">That&apos;s the lesson{learnerName.trim() ? `, ${learnerName.trim()}` : ''}!</h2>
            {SHOW_RECAP_ON_END && deck.recap && <p className="text-lg max-w-2xl">{deck.recap}</p>}
            <ul className="w-full max-w-lg flex flex-col gap-2 text-left">
              {achievements.map((a, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-white border border-cyan-100 shadow-sm px-4 py-2.5 animate-[pop-in_450ms_ease-out_both]"
                  style={{ animationDelay: `${300 + i * 350}ms` }}>
                  <span aria-hidden className="text-2xl leading-none mt-0.5">{a.icon}</span>
                  <span className="text-sm sm:text-base">{a.text}</span>
                </li>
              ))}
            </ul>
            {finishedHardest && !study && (
              <p className="text-sm sm:text-base text-slate-600 max-w-xl">
                <b>{finishedHardest.name}</b> was the trickiest part.{' '}
                <button className="underline text-cyan-700 hover:text-cyan-600 font-semibold"
                  onClick={() => { cues.stop(); player.goToSlide(finishedHardest.index); }}>Go over it again →</button>
              </p>
            )}
            {study ? (
              // the study: on to the second quiz
              <Link href="/study" onClick={() => cues.stop()} className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold" data-study-next>Continue to Quiz 2 →</Link>
            ) : (
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={startOver} className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold">↺ Start over</button>
              <Link href="/" onClick={() => cues.stop()} className="px-6 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 font-semibold">⌂ Back to home</Link>
            </div>
            )}
          </div>
        ) : (
          <SlideCanvas slide={shownSlide} width={SLIDE_WIDTH} activeId={variant ? helperActive : player.activeId} morph={MORPH_HELPERS} laser={laser} spotlight={SPOTLIGHT}
            interactive onActivityDone={onActivityDone} activityHint={activityHint}
            solvedActivities={activitiesSolved.current} revealedActivities={activitiesRevealed.current} settledActivities={activitiesDone.current} settledTick={settledTick} activitySounds={soundsOn} onActivityMistake={onActivityMistake}
            finnMoves={finnMoves} onFinn={onFinn} activityGuides={activityGuides} yourTurn={variant || selfCheck ? null : yourTurn} />
        )}
        {/* A topic's introduction is being said: a small title card for the part that's starting */}
        {isIntroId(player.activeId) && !variant && deck.slides[player.slideIndex]?.topic && (
          // the slide waits behind, softly dimmed, until the introduction is over
          <div key={player.slideIndex} className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-950/45 backdrop-blur-[2px] animate-[intro-fade_500ms_ease-out]" role="status">
            <div className="px-8 py-5 rounded-2xl bg-slate-900/90 text-white shadow-2xl text-center animate-[intro-card_600ms_ease-out]">
              <div className="text-xs uppercase tracking-widest text-cyan-300/90">Part {player.topicIndex + 1} of {player.topicCount}</div>
              <div className="text-2xl font-bold mt-1">{deck.slides[player.slideIndex].topic}</div>
            </div>
          </div>
        )}
        {variant && !MORPH_HELPERS && <VariantOverlay variant={variant} onDone={closeVariant} />}
        {variant && MORPH_HELPERS && (
          <button
            onClick={() => { closedByLearner.current = true; closeVariant(); }}
            className="absolute bottom-3 right-3 z-20 px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-semibold shadow-lg"
            aria-label={variant.variant === 'answer' || variant.variant === 'board' ? 'Back to the lesson' : 'Another way to see it: back to the lesson'}
          >
            {variant.variant === 'answer' || variant.variant === 'board' ? 'Back to the lesson →' : 'Got it, back to the lesson →'}
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
        {/* Low-key, like "Is Finn right?": a pill at the bottom of the slide (was: a blurred pop-up over the slide) */}
        {replayOffer && !variant && !selfCheck && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 text-white text-sm shadow-lg whitespace-nowrap max-sm:whitespace-normal max-sm:flex-wrap max-sm:justify-center max-sm:rounded-2xl max-sm:w-[94%] max-sm:bottom-2" role="dialog" aria-label="See it a different way?">
            <span>See that part a different way?</span>
            <button className="px-3 py-1 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold" onClick={() => answerReplay(true, 'button')}>Yes, show me</button>
            <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => answerReplay(false, 'button')}>No, keep going</button>
            <button className={`w-8 h-8 rounded-full ${micStatus === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-white/15 hover:bg-white/25'}`}
              onClick={talk} disabled={micStatus === 'processing'} title="Or say it: “yes” or “no”" aria-label={micStatus === 'listening' ? 'Listening' : 'Or say it'}>
              {micStatus === 'listening' ? '●' : '🎤'}
            </button>
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
        {/* Under the slide, in the gap above the buttons (was: on the slide's top-left, over its title) */}
        {yourTurn && !variant && !selfCheck && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 flex items-center gap-2 pl-4 pr-1 py-1 rounded-full bg-cyan-950/90 border border-cyan-300/30 text-white text-sm shadow-lg whitespace-nowrap
            [@media(max-height:500px)]:fixed [@media(max-height:500px)]:top-2 [@media(max-height:500px)]:right-2 [@media(max-height:500px)]:left-auto [@media(max-height:500px)]:translate-x-0 [@media(max-height:500px)]:mt-0" role="status" data-your-turn>
            <span>🖐 Your turn: try it on the slide</span>
            <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={skipActivity}>Skip</button>
          </div>
        )}
        {/* top-left: the bottom of the slide is where hands-on boxes have their controls (was: Finn's chip covered the slider) */}
        <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5 pointer-events-none">
          {classmateSaying && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-semibold shadow-lg animate-pulse" style={{ background: CLASSMATES[classmateSaying].color }} role="status">
              <span aria-hidden>🙋</span> {CLASSMATES[classmateSaying].name} {yourTurn ? 'is having a go…' : 'asks…'}
            </div>
          )}
        </div>
        {/* "Is Finn right?": a quick answer, or their own words (typed, or the mic). Was: only the three buttons */}
        {finnWaiting === 'buttons' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(36rem,92%)] flex flex-col gap-2 px-3 py-2.5 rounded-2xl bg-slate-900/90 text-white text-sm shadow-lg" role="dialog" aria-label={`Is ${CLASSMATE_NAME} right?`}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span>Is {CLASSMATE_NAME} right?</span>
              <button className="px-3 py-1 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold" onClick={() => finnVerdict(`Not quite, ${CLASSMATE_NAME} is wrong.`, 'button')}>Not quite!</button>
              <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => finnVerdict(`Yes, ${CLASSMATE_NAME} is right.`, 'button')}>He&apos;s right</button>
              <button className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25" onClick={() => finnVerdict("I'm not sure.", 'button')}>Not sure</button>
            </div>
            <form className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-white/10"
              onSubmit={(e) => { e.preventDefault(); if (finnReply.trim()) finnVerdict(finnReply.trim().slice(0, 400), 'typed'); }}>
              <input value={finnReply} onChange={(e) => setFinnReply(e.target.value)} maxLength={400}
                placeholder="Or say what you think, and why…" aria-label="Your answer"
                className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-white/45" />
              <button type="button" className={`w-8 h-8 shrink-0 rounded-full ${micStatus === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-white/15 hover:bg-white/25'}`}
                onClick={talk} disabled={micStatus === 'processing'} aria-label={micStatus === 'listening' ? 'Listening' : 'Say it'} title="Say it instead">
                {micStatus === 'listening' ? '●' : '🎤'}
              </button>
              <button className="px-3 py-1.5 shrink-0 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold disabled:opacity-40" disabled={!finnReply.trim()}>Send</button>
            </form>
          </div>
        )}
        {/* The professor asked them to say more: their own words now (typed, or the mic; talking over works too) */}
        {finnWaiting === 'open' && (
          <form className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(36rem,92%)] flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full bg-slate-900/90 text-white text-sm shadow-lg max-sm:rounded-2xl"
            role="dialog" aria-label="Tell the professor what you think"
            onSubmit={(e) => { e.preventDefault(); if (finnReply.trim()) finnVerdict(finnReply.trim().slice(0, 400), 'typed'); }}>
            <input value={finnReply} onChange={(e) => setFinnReply(e.target.value)} maxLength={400} autoFocus
              placeholder="Type what you think…" aria-label="Your answer"
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-white/45" />
            <button type="button" className={`w-8 h-8 shrink-0 rounded-full ${micStatus === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-white/15 hover:bg-white/25'}`}
              onClick={talk} disabled={micStatus === 'processing'} aria-label={micStatus === 'listening' ? 'Listening' : 'Say it'} title="Say it instead">
              {micStatus === 'listening' ? '●' : '🎤'}
            </button>
            <button className="px-3 py-1.5 shrink-0 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold disabled:opacity-40" disabled={!finnReply.trim()}>Send</button>
          </form>
        )}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/85 text-white text-sm shadow-lg" role="status">
            {toast}
          </div>
        )}
      </div>

      {/* The chat's latest line (the chat itself is put away): tap for the whole conversation */}
      {peekShown && lastChat && (() => {
        const who: Speaker = lastChat.kind === 'line' ? lastChat.who : 'professor';
        const text = lastChat.kind === 'slide' ? lastChat.lines[lastChat.lines.length - 1]?.text ?? '' : lastChat.text || 'thinking…';
        return (
          <button onClick={openChat} className="w-full max-w-3xl h-[3.25rem] flex items-center gap-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-left text-sm" data-chat-peek aria-label="Open the class chat">
            <Avatar who={who} learnerName={learnerName.trim()} size={26} speaking={talking === who} />
            <span className="flex-1 min-w-0 line-clamp-2 leading-snug"><b className="font-semibold" style={{ color: who === 'professor' ? '#67e8f9' : speakerOf(who, learnerName.trim()).color }}>{speakerOf(who, learnerName.trim()).name}:</b> {text}</span>
            <span className="shrink-0 text-xs text-white/50">💬{chatUnread && <span className="ml-1 inline-block w-2 h-2 rounded-full bg-amber-400" />}</span>
          </button>
        );
      })()}

      {/* clip dots: one per spoken element on this slide */}
      <div className={`flex gap-1.5 h-2 ${yourTurn && !variant && !selfCheck ? 'invisible' : ''}`} aria-hidden>
        {Array.from({ length: player.clipCount }, (_, i) => (
          <span key={i} className={`w-6 h-1.5 rounded-full ${i < player.clipIndex ? 'bg-cyan-300' : i === player.clipIndex ? 'bg-cyan-300 animate-pulse' : 'bg-white/20'}`} />
        ))}
      </div>

      {/* The question and the professor's answer, while it's being answered */}
      {/* (the chat has it: beside the slide, or its latest line under the slide. Was: shown here with the transcript off) */}
      {tutor.exchange && ANSWER_BOX_UNDER_SLIDE && (
        <div className="w-full max-w-3xl rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-sm relative" role="status" data-bubble-avoid>
          <button className="absolute top-2 right-3 text-white/50 hover:text-white" onClick={tutor.clearExchange} aria-label="Close">✕</button>
          <p className={tutor.exchange.asker ? 'text-amber-200' : 'text-cyan-200/90'}><b>{tutor.exchange.asker ?? 'You'}:</b> {tutor.exchange.question}</p>
          <p className="mt-1 text-white/90">
            <b>Professor Marine:</b>{' '}
            {tutor.thinking && !tutor.exchange.answer ? <span className="animate-pulse">thinking…</span> : tutor.exchange.answer}
          </p>
        </div>
      )}

      {/* The buttons in three groups (moving through the lesson, help, asking), then Options. On a phone,
          or a phone turned sideways, just the icons (the names are still there for screen readers) */}
      <div className="flex flex-wrap items-center justify-center gap-2" data-bubble-avoid>
        <div className={group} role="group" aria-label="Move through the lesson">
          {ctl('⏮', 'Previous slide', { onClick: goBack, disabled: player.slideIndex === 0 })}
          {/* (no Resume while it's the learner's turn: the hands-on box moves the lesson on. Was: a greyed-out ▶ Resume) */}
          {player.status === 'paused'
            ? !yourTurn && ctl('▶', 'Resume', { onClick: resumeLesson })
            : ctl('⏸', 'Pause', { onClick: player.pause, disabled: player.status === 'finished' })}
          {ctl('⏭', 'Skip ahead', { onClick: () => skipTo(player.nextClip), title: 'Skip to the next part of this slide' })}
          {ctl('⏩', 'Next slide', { onClick: () => skipTo(player.nextSlide) })}
        </div>
        <div className={group} role="group" aria-label="Help">
          {ctl('⟲', 'Repeat', { onClick: () => { feel('again'); player.repeat(); } })}
          {ctl('🌱', 'Simpler please', { onClick: () => handleText('simpler please'), title: 'Say it again in simpler words' })}
          {ctl('😕', 'I\'m lost', { onClick: () => confused(), title: 'Another way to see it' })}
        </div>
        <div className={group} role="group" aria-label="Ask the professor">
        <button
          className={`${btn} ${micStatus === 'listening' ? 'bg-red-500/80 hover:bg-red-500' : ''}`}
          onClick={talk}
          disabled={micStatus === 'processing'}
          aria-label={micStatus === 'listening' ? 'Listening' : 'Talk'}
        >
          {micStatus === 'listening' ? <>●<span className={label}> Listening…</span></> : micStatus === 'processing' ? '…' : <>🎤<span className={label}> Talk</span></>}
        </button>
        {(interruptOn || micStatus === 'listening') && <MicMeter levelRef={levelRef} listening={micStatus === 'listening'} />}
        {/* (with the class chat beside the slide, its own box is where to type) */}
        {!chatDocked && <form
          onSubmit={(e) => { e.preventDefault(); if (typed.trim()) handleText(typed); setTyped(''); }}
          className="flex"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phonePortrait ? 'Ask a question…' : 'Ask a question, or "next"…'}
            maxLength={500}
            className="px-3 py-2 rounded-l-lg bg-white/10 placeholder:text-white/40 text-sm outline-none focus:bg-white/15 w-44 max-sm:w-36"
          />
          <button className="px-3 py-2 rounded-r-lg bg-cyan-500/80 hover:bg-cyan-500 text-sm font-medium">Send</button>
        </form>}
        </div>
        {cameraOn && (
          <span className="text-xs text-white/70">
            {emotionError || presenceError ? `⚠ camera unavailable (${emotionError || presenceError})` : !emotionReady ? 'starting…' : present ? '👤 here' : '🚫 away'}
            {mood && ` · ${mood === 'confused' ? '😕 puzzled' : mood === 'bored' ? '😐 quiet' : '🙂'}`}
          </span>
        )}
        {/* The on/off switches, in one menu (was: five more buttons, so the controls took two rows) */}
        <div className="relative" ref={optionsRef}>
          <button className={`${btn} ${optionsOpen ? 'bg-white/25' : ''}`} onClick={() => setOptionsOpen((o) => !o)} aria-expanded={optionsOpen}
            title="Voice speed, interrupt, camera, classmates, sounds, class chat" aria-label="Options">
            ⚙<span className={label}> Options</span>
            {/* what's on, at a glance */}
            <span className="ml-1.5 text-xs opacity-80">{[interruptOn && '🎙', cameraOn && '📷', classmateOn && '🙋', soundsOn && '🔔', chatOpen && '💬'].filter(Boolean).join('')}{voiceSpeed !== 1 && ` ${voiceSpeed}×`}</span>
          </button>
          {optionsOpen && (
            <div className="absolute bottom-full mb-2 right-0 z-30 w-72 rounded-xl bg-slate-900/95 border border-white/15 shadow-2xl p-2 flex flex-col gap-1" role="menu">
              {/* Voice speed: three steps, not a switch */}
              <div className="px-2.5 pt-1.5 pb-2 border-b border-white/10 mb-1">
                <span className="block text-sm font-medium" id="speed-label">🗣 Voice speed</span>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-white/10 p-0.5" role="radiogroup" aria-labelledby="speed-label">
                  {VOICE_SPEEDS.map((v) => (
                    <button key={v} role="radio" aria-checked={voiceSpeed === v} onClick={() => chooseSpeed(v)}
                      className={`rounded-md py-1 text-xs leading-tight ${voiceSpeed === v ? 'bg-white text-slate-900 font-semibold' : 'text-white/80 hover:bg-white/10'}`}>
                      {v < 1 ? 'Slower' : v > 1 ? 'Faster' : 'Normal'}
                      <span className="block text-[10px] opacity-70">{v}×</span>
                    </button>
                  ))}
                </div>
              </div>
              {([
                ['🎙', 'Interrupt', 'Talk over the professor any time (uses the microphone)', interruptOn, () => {
                  setInterruptOn((on) => !on);
                  if (!interruptOn) say('Interrupt on: just start talking and the professor will finish the sentence and listen.');
                }],
                ['📷', 'Camera', 'Raise your hand to ask; the professor notices if you look lost or step away. Stays on this device.', cameraOn, () => {
                  setCameraOn((on) => !on);
                  if (!cameraOn) say('Camera on: raise your hand to ask, and the professor notices if you look lost or step away. Nothing leaves your device.');
                }],
                // (not in the study: the group decides)
                ...(study ? [] : [['🙋', 'Classmates', 'Maya, Finn and Leo: they ask questions, and Finn has a go at the hands-on activities', classmateOn, () => setClassmateOn((v) => !v)] as const]),
                ['🔔', 'Sounds', 'Little sounds in the hands-on activities', soundsOn, toggleSounds],
                ['💬', 'Class chat', desk ? 'The conversation beside the slide' : 'The latest line under the slide (tap it for the whole chat)', chatOpen, () => setChatOpen((v) => !v)],
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
      </div>
      <footer className="text-xs text-white/40 [@media(max-height:500px)]:hidden" data-bubble-avoid>
        <Link href="/sources" className="underline hover:text-white/70">View sources</Link>
      </footer>

      {/* The class chat and the classmates (see chatDocked above) */}
      {chatDocked ? (
        <ClassChat className={`fixed top-3 bottom-3 z-30 w-[22rem] ${wide ? 'left-3' : 'right-3'}`} entries={chat} learnerName={learnerName.trim()} liveSlide={liveSlide}
          getAudio={player.getAudio} thinking={tutor.thinking} speaking={talking} onSend={handleText} mates={matesAllowed} onClose={() => setChatOpen(false)} />
      ) : (
        <div className={`fixed inset-y-0 left-0 z-50 w-[min(22rem,90vw)] p-2 transition-transform duration-300 ${pulled === 'chat' ? 'translate-x-0' : '-translate-x-[105%]'}`}
          inert={pulled !== 'chat'} data-pullout="chat">
          <ClassChat className="h-full" solid entries={chat} learnerName={learnerName.trim()} liveSlide={liveSlide}
            getAudio={player.getAudio} thinking={tutor.thinking} speaking={talking} onSend={handleText} mates={matesAllowed} onClose={() => setPulled(null)} closeLabel="Put the chat away" />
        </div>
      )}
      {!matesAllowed ? null : matesDocked ? (
        <ClassmatesPanel className="fixed top-3 bottom-3 right-3 z-30 w-[18rem]" entries={chat} speaking={talking} />
      ) : (
        <div className={`fixed inset-y-0 right-0 z-50 w-[min(20rem,88vw)] p-2 transition-transform duration-300 ${pulled === 'mates' ? 'translate-x-0' : 'translate-x-[105%]'}`}
          inert={pulled !== 'mates'} data-pullout="mates">
          <ClassmatesPanel className="h-full" solid entries={chat} speaking={talking} onClose={() => setPulled(null)} />
        </div>
      )}
    </main>
  );
}
