/*
 * Every limit on the site, in one place. Change a number here and redeploy: nothing else needs touching.
 * (lib/rateLimit.ts does the counting; each route names the limit it uses, e.g. rateLimit(req, 'tts').)
 *
 * Each limit has:
 *   perSession  how many one learner's browser may make in the window
 *   perAddress  how many one internet address may make in the window (a school shares one, so these are generous)
 *   windowSec   how long the window is, in seconds
 *   perDay      (optional) how many the whole site may make in a day; past it, that feature pauses until tomorrow
 *   label       what it's called in the "too many…" message
 *
 * Unlocked editors are never limited, except where a route says so (the editor's helper).
 * MAX, at the bottom: the longest inputs accepted.
 */

export type Rule = { perSession: number; perAddress: number; windowSec: number; perDay?: number; label: string };

// Per address: sized for a room of ~30 on one network (a class, or a defense audience on the venue's Wi-Fi). Was 60-120
// a minute, which a room of 20 adaptive learners could reach at a busy moment (measured: per learner, about 30 read-alouds,
// 20 classmate lines and 26 bank lookups a lesson). Per session and per day are unchanged: one person still can't run up the bill.
export const LIMITS = {
  tutor: { perSession: 10, perAddress: 200, windowSec: 60, perDay: 3000, label: 'questions' },
  // Read-aloud speaks any text sent (up to MAX.ttsText) on our key: about 1.5¢ a minute of speech. Was 200 a minute per
  // address and 20,000 a day (one address could spend hundreds of dollars in a day); a lesson needs a few a minute
  tts: { perSession: 30, perAddress: 300, windowSec: 60, perDay: 6000, label: 'read-aloud requests' },
  transcribe: { perSession: 20, perAddress: 300, windowSec: 60, perDay: 6000, label: 'recordings' },
  search: { perSession: 20, perAddress: 300, windowSec: 60, perDay: 5000, label: 'searches' },
  // Learner-data updates (/api/signals/state): free, but each one writes a row. A lesson sends
  // ~5-15 a minute; a class on one school address ~300-450. Generous, and no daily cap, so
  // tracking never switches off for everyone; past it an update is just skipped.
  learnerState: { perSession: 60, perAddress: 1000, windowSec: 60, label: 'updates' },
  // Learner events (/api/signals/events), in batches of ~5: a lesson sends a few batches a minute
  events: { perSession: 60, perAddress: 1000, windowSec: 60, label: 'updates' },
  classmate: { perSession: 18, perAddress: 300, windowSec: 60, perDay: 3000, label: 'classmate questions' },   // (a Finn turn can be 3: his line, and up to 2 follow-ups)
  // Hints and "Practise with new numbers" (/api/tutor/practice): their own allowance (was the questions' one: a few
  // wrong answers used up a learner's questions to the professor). A practice round asks for up to 5 at once
  practice: { perSession: 24, perAddress: 300, windowSec: 60, perDay: 4000, label: 'hints' },
  // Opening a lesson (/api/deck, /api/deck/info): once a visit; a class on one address opens it together
  deck: { perSession: 60, perAddress: 1200, windowSec: 60, label: 'lesson loads' },
  board: { perSession: 10, perAddress: 200, windowSec: 60, perDay: 3000, label: 'drawings' },
  // The question bank (/api/bank/match): one lookup per question asked (an embedding, cheap)
  bank: { perSession: 20, perAddress: 300, windowSec: 60, perDay: 5000, label: 'question lookups' },
  // The setup check (/api/health): each call reaches OpenAI, Supabase and Redis
  health: { perSession: 10, perAddress: 20, windowSec: 60, label: 'setup checks' },
  // The online study (/api/study): a few saves per step, each writes the person's row
  study: { perSession: 30, perAddress: 300, windowSec: 60, perDay: 20000, label: 'study saves' },
  // Starting the study (a new row each time): a household or a dorm shares an address, a script doesn't get far
  studyJoin: { perSession: 5, perAddress: 30, windowSec: 3600, perDay: 1000, label: 'new study sign-ups' },
  slides: { perSession: 15, perAddress: 300, windowSec: 60, perDay: 5000, label: 'slide lookups' },
  // Making the whole /presentationv2 lesson (only when it isn't cached yet): many paid calls
  lesson: { perSession: 2, perAddress: 4, windowSec: 3600, perDay: 20, label: 'lesson builds' },
  cues: { perSession: 10, perAddress: 300, windowSec: 60, label: 'requests' },
  // The editor's ✨ helper (/api/editor/assistant): limited for editors too (editorsToo), per editor
  assistant: { perSession: 12, perAddress: 30, windowSec: 60, perDay: 600, label: 'helper questions' },
  // The error log (/api/log-error): the browser sends at most 5 a page visit (lib/reportError.ts)
  // (tight per address and a big day: a script posting junk can't easily use up the day for everyone)
  errors: { perSession: 10, perAddress: 30, windowSec: 60, perDay: 20000, label: 'error reports' },
  // Editor password tries: slows down guessing (no daily cap, so a guesser can't lock everyone out)
  unlock: { perSession: 10, perAddress: 10, windowSec: 600, label: 'password tries' },
} satisfies Record<string, Rule>;

/** Longest inputs accepted (characters / bytes). */
export const MAX = {
  question: 500,
  systemPrompt: 8000,
  conversationTurns: 12,
  conversationChars: 2000,   // per turn
  ttsText: 1500,
  audioBytes: 5_000_000,     // ~15 s turn is ~0.5 MB as 16 kHz WAV
  searchQuery: 300,
  searchDocs: 400,
};
