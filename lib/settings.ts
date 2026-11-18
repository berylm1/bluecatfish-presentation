/*
 * The lesson's settings, in one place: the on/off switches and the timings worth tuning.
 * Change a value here and redeploy. (The code that uses each one imports it from here.)
 *
 * A switch that's off is a feature kept but hidden: switch it back on to bring it back.
 * Changing anything marked [study] while a study is collecting data changes what participants get:
 * do it before or after data collection, or apply it to both groups the same way.
 */

/* ------------------------------------------------------------------ the lesson's buttons and screen */
// (after the first participants said "so many buttons": hidden, not removed)
export const SHOW_SOURCES_UNDER_LESSON = false;   // "View sources" under the slide
export const SHOW_OPTION_ICONS = false;           // the little icons beside Options (what's switched on)
export const SHOW_NEXT_SLIDE = false;             // ⏩ Next slide (⏭ Next part moves through the lesson)
export const SHOW_REPEAT = false;                 // ⟲ Repeat (⏮ Back starts the part again)
export const BACK_AGAIN_S = 2.5;                  // ⏮ this early in a part: the part before (later: this part from its start), like a music player
// The top-right transcript: off, the class chat has everything that's said, as a conversation
export const SHOW_FLOATING_TRANSCRIPT = false;
// The question + answer box under the slide: off, the class chat shows them (it made the page taller than the screen)
export const ANSWER_BOX_UNDER_SLIDE = false;
// The class chat's "… is thinking" bubble shows only for a wait longer than this
export const THINKING_AFTER_MS = 500;

/* ------------------------------------------------------------------ the professor */
// The slide itself turns into the helper ("another way to see it") and the plain-words version ("simpler please").
// false: the old popup, and no focus
export const MORPH_HELPERS = true;
// After a "Show another way" slide is heard to its end: on to the next slide (false: back to the slide it came from)
export const HELPER_THEN_NEXT = true;
// [study] Answers to the learner's questions: 1-2 sentences, with "Tell me more" for the full answer (false: the full answer at once)
export const SHORT_ANSWERS = true;
// After the learner's own question is answered: back to where the lesson stopped (false: on to the slide's end)
export const RESUME_AFTER_ANSWER = true;
export const MORE_WAIT_MS = 6000;             // "Anything else, or shall we go on?": this long with no answer = go on
export const MORE_WAIT_WITH_MORE_MS = 10000;  // (the same, with "Tell me more" to pick: a little longer)
export const HOLD_MIN_MS = 700;               // the Ask button: held shorter than this is a tap, and what was heard isn't sent
// [study] Confused overall (the confusion meter): a little longer between slides
export const CONFUSED_PAUSE_MS = 1200;
// [study] A part gets confusing without "I'm lost": the professor checks in, at most this often
// (false: only the camera's puzzled look checks in)
export const METER_CHECK_IN = true;
export const CHECK_IN_EVERY_MS = 60_000;

/* ------------------------------------------------------------------ between topics, and the end */
// "How did that section go?" between topics (Got it / Kind of / Lost me). Off: 28 of the first participants'
// 29 answers were "Got it", from people who then missed the quiz too
export const SELF_CHECK = false;
// (with it on) After "Got it" on a topic the meter says was confusing: "another way?" is offered anyway, lightly
export const OFFER_AFTER_GOT = true;
// (outside the study) Only ask "How did that section go?" when the meter isn't sure (false: always asked)
export const ADAPTIVE_SECTION_CHECK = true;
// The end screen's "trickiest part": from the confusion meter (false: from the old counts)
export const HARDEST_FROM_METER = true;
// The recap's text on the end screen: off, the achievements are there instead (the professor says the recap)
export const SHOW_RECAP_ON_END = false;
// The spoken ending: false = the quick one (what they covered, their achievements, "Marine out!"); true = the old long recap
export const SPOKEN_FULL_RECAP = false;

/* ------------------------------------------------------------------ the classmates (Maya, Finn, Leo) */
// [study] Each classmate line is written live (how they say a reviewed question, their reply when the learner talks
// to them by name), and checked on the server. false: all as written
export const LIVE_CLASSMATES = true;
export const LIVE_WORDS_WAIT_MS = 2500;   // a rewording not ready by then: the question as written
export const SAID_FRESH_MS = 120_000;     // what the learner said this recently can be tied into a classmate's question
// [study] Follow-up questions from classmates after the learner's question: at most this many, and none for this long
// after an answer (a learner asking a few in a row gets just the professor)
export const FOLLOW_UPS_MAX = 1;
export const FOLLOW_UP_COOLDOWN_MS = 45_000;
// [study] After the learner's question is answered (no follow-ups): how often a classmate reacts ("I wondered that too!")
export const REACT_CHANCE = 0.4;
// [study] A topic end that doesn't call for a classmate: how often one is curious anyway
export const CURIOUS_CHANCE = 0.25;
// [study] Confused overall: curious moments this much as often
export const CONFUSED_CURIOUS = 0.5;
// [study] The discussion room: now and then, at a topic's end, the classmate's question goes to the learner first
export const DISCUSSION = true;
export const DISCUSS_MAX = 2;             // per lesson (each adds about a minute)
export const ROOM_WAIT_MS = 45_000;       // the learner says nothing for this long: the discussion goes on without their answer
// Two soft notes before a classmate speaks (off: it was heard as an odd noise at the topics' ends)
export const HEADS_UP_SOUND = false;

/* ------------------------------------------------------------------ Finn's mix-ups */
// [study] At most every 3rd classmate turn (from the 2nd on), and only when the topic went well;
// clear overall (a topic or more in): as often as every 2nd turn
export const MIX_UP_EVERY = 3;
export const MIX_UP_EVERY_CLEAR = 2;
export const FINN_WAIT_MS = 30_000;       // no answer for this long: the professor explains it (as "not sure") and goes on
// [study] Finn remembers the mix-ups the learner caught, and owns up to one later ("I won't mix up ___ again!"),
// at most once a lesson. false: he never brings them up
export const FINN_REMEMBERS = true;

/* ------------------------------------------------------------------ the study's pages */
// Static vs adaptive: the camera check only for the adaptive group, right after the group is picked (the static
// lesson has no camera). false: everyone does it in the setup checks, before the group is known
export const CAMERA_CHECK_AFTER_GROUP = true;
// The last screen's family card: a QR code to the Maryland DNR page (off: the link only)
export const SHOW_QR = false;
