import { COMMAND_ACK_TEXT } from '@/lib/deckCommands';

// Short lines the canvas page says itself: command replies ("Skipping ahead.")
// and the camera/voice cues. Recorded once by /api/cues and reused; spoken
// live if they can't be.
export const CUE_TEXT = {
  ...COMMAND_ACK_TEXT,
  cmd_nextClip: 'Skipping that bit.',
  cue_handRaise: 'Do you have a question?',
  cue_away: "Take your time. I'll wait.",
  cue_back: 'Alright, picking up where we left off.',
  cue_confused: "You look puzzled. Want me to go over that a different way? Say yes, or tell me exactly what's tripping you up.",
  cue_bored: "You've gone quiet on me. Should I pick up the pace? Say yes, or tell me what's on your mind.",
  cue_listening: "I'm listening.",
  cue_intro: "Hey! I'm Professor Marine. Let's dive in.",
  cue_selfCheck: 'How did that section go?',
  cue_conclusionIntro: "Let's take a moment to look back at everything we covered today.",
  cue_conclusionOutro: "And that's the whole story. Thanks for joining me.",
} as const;

export type CueKey = keyof typeof CUE_TEXT;
