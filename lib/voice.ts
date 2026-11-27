// How Professor Marine sounds. Passed to gpt-4o-mini-tts as `instructions`, so
// the narration and the live tutor voice share one delivery. Changing this
// only affects clips generated after the change (bump CACHE_VERSION to redo all).
export const TTS_VOICE = 'alloy';
/** How long the page waits for a spoken clip (/api/tts) before going on without it (the words as captions). Was: no limit,
 * and one request that never answered froze the lesson for good: the part was never heard, so Next stayed off too */
export const TTS_WAIT_MS = 20_000;

export const VOICE_INSTRUCTIONS =
  'You are a fun science teacher talking to 10 to 14 year olds. Sound upbeat and ' +
  'conversational, like you are telling a story, not reading. Deliver jokes with a light, ' +
  'dry, playful sarcasm and a small pause before the punchline. Slow down a little on ' +
  'numbers and key facts so they land. Warm and kind, never mocking the listener.';

/** The voices a lesson's teacher can have (the Lesson panel's list). Not the classmates' (coral, verse, ash: lib/classmates.ts) */
export const TEACHER_VOICES: { id: string; label: string }[] = [
  { id: 'alloy', label: 'Alloy: warm and even (Professor Marine’s)' },
  { id: 'nova', label: 'Nova: bright and friendly' },
  { id: 'sage', label: 'Sage: calm and clear' },
  { id: 'shimmer', label: 'Shimmer: light and gentle' },
  { id: 'fable', label: 'Fable: a storyteller' },
  { id: 'echo', label: 'Echo: steady and relaxed' },
  { id: 'onyx', label: 'Onyx: deep and steady' },
  { id: 'ballad', label: 'Ballad: soft and expressive' },
];
export const isTeacherVoice = (v: unknown): v is string => typeof v === 'string' && TEACHER_VOICES.some((x) => x.id === v);

/**
 * How a lesson's teacher sounds: the voice it picked (none: Professor Marine's) and the delivery, which names the
 * lesson's own subject and ages. The blue catfish lesson's (science, 10 to 14) come out exactly as the two texts in
 * this file, so its recorded clips stay as they are.
 */
export function voiceFor(p: { subject: string; ageMin: number; ageMax: number; teacher: { voice?: string } }): { voice: string; instructions: string; simple: string } {
  const subject = p.subject.trim() ? `${p.subject.trim()} ` : '';
  return {
    voice: isTeacherVoice(p.teacher.voice) ? p.teacher.voice : TTS_VOICE,
    instructions: VOICE_INSTRUCTIONS.replace('fun science teacher talking to 10 to 14 year olds', `fun ${subject}teacher talking to ${p.ageMin} to ${p.ageMax} year olds`),
    simple: SIMPLE_VOICE_INSTRUCTIONS.replace('a 10 year old', `a ${p.ageMin} year old`),
  };
}

// Finn, the classmate who makes mix-ups to catch and has a go in the hands-on boxes. The classmates
// (Maya, Finn, Leo), their voices and colors are in lib/classmates.ts
export const CLASSMATE_NAME = 'Finn';

// "Simpler please" clips: same voice, but calm and clear instead of jokey
export const SIMPLE_VOICE_INSTRUCTIONS =
  'You are a patient, kind teacher helping a 10 year old who is a bit lost. Speak slowly ' +
  'and clearly, in a calm, friendly tone, with a short pause between sentences. No jokes.';
