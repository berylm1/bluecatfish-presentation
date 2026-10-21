// The AI classmates in the lesson: three kids with their own way of joining in, their own voice
// (gpt-4o-mini-tts, /api/tts) and their own color. They speak at a topic's end (taking turns), and
// when the learner asks something they ask the related questions (the question bank).
//   Maya: curious. What a word means, why something happens, how big or how many.
//   Finn: quick, and sometimes mixes things up on purpose for the learner to catch; has a go in the hands-on boxes.
//   Leo: practical. What people can do about it, what it means for fishermen, food and the Bay, what happens next.

export type ClassmateId = 'maya' | 'finn' | 'leo';

export type Classmate = {
  id: ClassmateId;
  name: string;
  /** he / she, for lines like "where Finn put his" */
  his: 'his' | 'her';
  /** In a few words, for the learner (the side panel, Options) */
  blurb: string;
  /** How they ask, for the AI writing their lines */
  persona: string;
  voice: string;
  voiceInstructions: string;
  /** Their color (avatar, name, chip) */
  color: string;
};

export const CLASSMATES: Record<ClassmateId, Classmate> = {
  maya: {
    id: 'maya', name: 'Maya', his: 'her',
    blurb: 'Curious: asks what words mean, why things happen, and how big',
    persona: 'curious about how things work: you ask what a word means, why something happens, or how big or how many',
    voice: 'coral',
    voiceInstructions: 'You are a curious, bright 12 year old girl asking your teacher a question in class. Sound young, ' +
      'thoughtful and genuinely interested, natural like a real kid, not an actor.',
    color: '#ec4899',
  },
  finn: {
    id: 'finn', name: 'Finn', his: 'his',
    blurb: 'Quick to answer, and sometimes mixes things up. Can you catch him?',
    persona: 'quick and eager: you jump in fast, and you check what you think you heard',
    voice: 'verse',
    voiceInstructions: 'You are a curious, friendly 12 year old student asking your teacher a question in class. Sound young, ' +
      'genuinely curious and a little excited, quick and natural, like a real kid, not an actor.',
    color: '#f59e0b',
  },
  leo: {
    id: 'leo', name: 'Leo', his: 'his',
    blurb: 'Practical: asks what people can do about it, and what it means in real life',
    persona: 'practical: you ask what people can do about it, what it means for fishermen, food and the Bay, or what happens next',
    voice: 'ash',
    voiceInstructions: 'You are a down-to-earth 12 year old boy asking your teacher a question in class. Sound young, ' +
      'friendly and matter-of-fact, natural like a real kid, not an actor.',
    color: '#0ea5e9',
  },
};

/** In the side panel, and the order they take turns at a topic's end (Finn's turns are his mix-ups) */
export const CLASSMATE_IDS: ClassmateId[] = ['maya', 'finn', 'leo'];
const TURNS: ClassmateId[] = ['maya', 'finn', 'leo', 'finn'];
/** Who speaks at the n-th topic end (0 = the first) */
export const turnAt = (n: number): ClassmateId => TURNS[n % TURNS.length];

/** The classmate for a `who` sent by the page ('classmate' = Finn, from before there were three), or null */
export function classmateOf(who: unknown): Classmate | null {
  if (who === 'classmate') return CLASSMATES.finn;
  return typeof who === 'string' && who in CLASSMATES ? CLASSMATES[who as ClassmateId] : null;
}

/** A classmate's name → their id (for things that only know the name, like a question's asker), or null */
export function classmateNamed(name: string | undefined): ClassmateId | null {
  return CLASSMATE_IDS.find((id) => CLASSMATES[id].name === name) ?? null;
}
