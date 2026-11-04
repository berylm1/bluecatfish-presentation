// Shared by the browser and the server (no server-only imports here).
// What people read and answer in the study (app/study). The right answers are NOT here (the page
// would show them to anyone who looks): they're in lib/study/key.ts, which only the server reads.
//
// DRAFT: written from what the Blue Catfish lesson teaches. Check every question against the final
// lesson before the study starts, and keep ids the same once real people have answered.

export const STUDY_VERSION = 'v2';   // saved with each person: change it when the questions change
// (v2: in person; the name first, the pilot's demographic questions, the UEQ-S, post-condition and post-study questionnaires)
export const STUDY_TITLE = 'Learning with AI: the Blue Catfish lesson';
export const STUDY_MINUTES = '25–35';
export const STUDY_LESSON = 'blue-catfish';

export type Choice = { id: string; text: string };
export type ChoiceQuestion = { id: string; kind: 'choice'; q: string; choices: Choice[] };
export type TextQuestion = { id: string; kind: 'text'; q: string; hint?: string };
export type QuizQuestion = ChoiceQuestion | TextQuestion;

const abcd = (...texts: string[]): Choice[] => texts.map((text, i) => ({ id: 'abcd'[i], text }));

/* ------------------------------------------------------------------ consent */

export const CONSENT = {
  heading: 'Before you start',
  paragraphs: [
    'We are graduate students studying how people learn from an interactive, AI-narrated lesson. In this study you will go through a short lesson about blue catfish in the Chesapeake Bay, taught by an AI professor. Some people will also have AI classmates in the lesson and some won’t. Which one you get is picked at random.',
    `It takes about ${STUDY_MINUTES} minutes: a quick sound and microphone check, a few questions about you, a 5-question quiz, the lesson, a second quiz, and two short questionnaires about how it went. You’ll see how you did on the quizzes at the end.`,
    'The lesson uses the microphone, so you can ask the professor questions out loud (you can also type), and the camera if you allow it (it’s optional). Your browser may ask to allow them.',
    'Nothing from the microphone or camera is recorded or saved. The camera is used only inside the browser, to notice things like a raised hand or a puzzled look; only short labels, such as "looked confused on slide 4", are saved. What you say to the professor is turned into text so it can answer you, and those questions are saved as text.',
    'You’ll be asked for a first name or nickname, so the professor can greet you. It stays on this computer and is not saved with your answers: they’re saved under a participant number. Your answers are stored securely and used only for this research project. Results may appear in our thesis, only as group totals or without anything that could identify you.',
    'Taking part is voluntary. You can stop at any time. Answers you gave up to that point may be kept, without anything that identifies you. There are no known risks beyond normal computer use, and no direct benefit other than learning about blue catfish.',
    'Please don’t tell anyone else what the lesson is like until they’ve done it too.',
  ],
  // (v1: "We don't ask for your name or email, and nothing you answer is linked to who you are." The name is asked
  // now, and kept on the computer only)
  // Questions about the study: put the research team's or the professor's contact here
  contact: 'Questions about this study? Contact the research team.',
  agree: 'I am 18 or older, I have read the above, and I agree to take part, including the use of the microphone and (if I allow it) the camera as described.',
};

/* ------------------------------------------------------------- demographics */

/**
 * The pre-study questionnaire (the pilot's "Pre-Study Questionnaire"), saved together (study_participants.demographics,
 * migration 017). `other`: the choice that opens a box to write in ("Other: ___"); `number`: a number from min to max.
 */
export type Demographic = { id: DemographicId; q: string; choices?: string[]; optional?: boolean; text?: boolean; number?: { min: number; max: number }; other?: string };
export type DemographicId = 'age' | 'gender' | 'role' | 'ai_familiarity' | 'ai_tutor_before' | 'catfish_familiarity';

const FAMILIAR = ['1 – Not at all familiar', '2 – Slightly familiar', '3 – Moderately familiar', '4 – Very familiar', '5 – Extremely familiar'];
export const DEMOGRAPHICS: Demographic[] = [
  { id: 'age', q: 'What is your age (in years)?', number: { min: 18, max: 110 } },
  { id: 'gender', q: 'What is your gender?', choices: ['Male', 'Female', 'Non-binary', 'Prefer to self-describe', 'Prefer not to answer'], other: 'Prefer to self-describe' },
  { id: 'role', q: 'What is your current educational background or role?', choices: ['Undergraduate student', 'Graduate student', 'Faculty / Educator', 'Other', 'Prefer not to answer'], other: 'Other' },
  { id: 'ai_familiarity', q: 'How familiar are you with AI tools such as ChatGPT?', choices: FAMILIAR },
  { id: 'ai_tutor_before', q: 'Have you previously used AI-based learning or tutoring tools?', choices: ['Yes', 'No', 'Not sure'] },
  { id: 'catfish_familiarity', q: 'How familiar are you with Blue Catfish and their ecological impacts in the Chesapeake Bay?', choices: FAMILIAR },
];
/** A demographic answer as kept: a choice, "Other: what they wrote", or the age */
export function demographicAnswer(d: Demographic, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  if (d.number) { const n = Number(v); return Number.isInteger(n) && n >= d.number.min && n <= d.number.max ? String(n) : null; }
  if (d.text) return v.slice(0, 200);
  if (d.choices?.includes(v)) return v === d.other ? null : v;   // ("Other" alone: what they wrote is needed)
  if (d.other && v.startsWith(`${d.other}: `) && v.length > d.other.length + 2) return v.slice(0, 200);
  return null;
}
// v1's questions (study_participants columns age_range, student, field, ai_use, catfish_knowledge, bay_area, english_first,
// done_before, still there for the people who answered them):
//   How old are you? (ranges) · Are you a student? · What do you study, or what is your work? · How often do you use AI tools
//   like ChatGPT? · How much did you know about blue catfish before today? · Do you live in or near the Chesapeake Bay area?
//   · Is English your first language? · Have you gone through this Blue Catfish presentation before?

/* -------------------------------------------------------------------- quiz */

// The pre-quiz: these 5. The post-quiz: the same 5 (shuffled in with the rest), 5 harder ones, and 3 short answers.
export const QUIZ_SAME: ChoiceQuestion[] = [
  { id: 'q1', kind: 'choice', q: 'Where do blue catfish originally come from?',
    choices: abcd('The Chesapeake Bay', 'The Mississippi River basin', 'The Atlantic Ocean', 'The Great Lakes') },
  { id: 'q2', kind: 'choice', q: 'Why were blue catfish first put into Virginia rivers?',
    choices: abcd('To eat invasive crabs', 'They escaped from a fish farm', 'So people would have a big fish to catch', 'They arrived in ships’ water tanks') },
  { id: 'q3', kind: 'choice', q: 'Which best describes what blue catfish eat?',
    choices: abcd('Almost anything they can find, including blue crabs', 'Only plants', 'Only dead fish on the bottom', 'Only insects') },
  { id: 'q4', kind: 'choice', q: 'Why is it hard for nature to keep big blue catfish in check?',
    choices: abcd('Almost nothing eats adult blue catfish', 'They hide in caves all year', 'They only live for a year or two', 'They can live out of the water') },
  { id: 'q5', kind: 'choice', q: 'What lets blue catfish move from one river to another through the Bay?',
    choices: abcd('They are carried by birds', 'They can handle water that is a little salty', 'They swim out into the open ocean', 'They only travel during floods') },
];

export const QUIZ_NEW: ChoiceQuestion[] = [
  { id: 'q6', kind: 'choice', q: 'About how long can a blue catfish live?',
    choices: abcd('About 2 years', 'About 5 years', 'Over 100 years', '20 years or more') },
  { id: 'q7', kind: 'choice', q: 'What do a blue catfish’s long whiskers (barbels) do?',
    choices: abcd('They are covered in taste buds that help it find food', 'They sting other fish', 'They help it breathe air', 'They glow so it can see in the dark') },
  { id: 'q8', kind: 'choice', q: 'How heavy can the biggest blue catfish get?',
    choices: abcd('More than 1,000 pounds', 'About 5 pounds', 'About 20 pounds', 'More than 100 pounds') },
  { id: 'q9', kind: 'choice', q: 'Which of these is a way people are trying to control blue catfish in the Bay?',
    choices: abcd('Adding sharks to the rivers', 'Fishing for them and eating them', 'Making the whole Bay saltier', 'Feeding them so they leave crabs alone') },
  { id: 'q10', kind: 'choice', q: 'Which statement best explains why blue catfish are called “invasive” in the Bay?',
    choices: abcd(
      'They are bigger than the fish that live there',
      'People brought them from somewhere else',
      'They aren’t from there, and they harm the Bay’s animals with little to keep them in check',
      'They are hard for people to catch',
    ) },
];

export const QUIZ_SHORT: TextQuestion[] = [
  { id: 's1', kind: 'text', q: 'In your own words, why are blue catfish a problem for the Chesapeake Bay?', hint: 'A few sentences is plenty.' },
  { id: 's2', kind: 'text', q: 'Pick one thing about blue catfish (their size, what they eat, how long they live, or the water they can live in). How does it help them spread or survive in the Bay?' },
  { id: 's3', kind: 'text', q: 'If you were in charge of the Bay, what would you do about blue catfish, and why?' },
];

export const PRE_QUIZ: QuizQuestion[] = QUIZ_SAME;
/** The post-quiz: the 5 from before shuffled in with the 5 new ones (a fixed order, the same for everyone), then the short answers */
export const POST_QUIZ: QuizQuestion[] = [QUIZ_NEW[0], QUIZ_SAME[2], QUIZ_NEW[1], QUIZ_SAME[0], QUIZ_NEW[2], QUIZ_SAME[4], QUIZ_NEW[3], QUIZ_SAME[1], QUIZ_NEW[4], QUIZ_SAME[3], ...QUIZ_SHORT];

/* ------------------------------------------------------------ questionnaire */

export type SurveyItem =
  | { id: string; kind: 'scale'; q: string; low?: string; high?: string; group?: 'classmates' | 'no_classmates'; part?: SurveyPart }
  | { id: string; kind: 'pair'; low: string; high: string; q?: undefined; group?: undefined; part?: SurveyPart }
  | { id: string; kind: 'pick'; q: string; choices: string[]; group?: 'classmates' | 'no_classmates'; part?: SurveyPart }
  | { id: string; kind: 'text'; q: string; optional?: boolean; group?: 'classmates' | 'no_classmates'; part?: SurveyPart };
/** The page it's on: after the lesson (UEQ-S and the general questions), then the post-study questions */
export type SurveyPart = 'condition' | 'study';

export const SCALE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
export const PAIR_POINTS = 7;   // the UEQ-S: 7 circles between two words

/*
 * After the lesson (the pilot's "Post-Condition Questionnaire"):
 *   the UEQ-S (the User Experience Questionnaire, short version, ueq-online.org): its 8 word pairs, in its order and
 *   wording, 1-7 from the left word to the right. (Scored -3 to +3 by the UEQ's own sheet: answer minus 4.)
 *   Items 1-4: pragmatic quality; 5-8: hedonic quality.
 *   Then the general experience: 1-5, strongly disagree to strongly agree.
 * Then the post-study questions (the pilot's "Post-Study Questionnaire"), for one version per person: its open questions
 * only. (Its questions 1-4 compare the two versions: for someone who saw both.) 5 and 6 are about the classmates, so
 * the other group gets one about what helped instead. `group`: asked only of that group.
 */
export const SURVEY: SurveyItem[] = [
  { id: 'ueq1', kind: 'pair', low: 'obstructive', high: 'supportive', part: 'condition' },
  { id: 'ueq2', kind: 'pair', low: 'complicated', high: 'easy', part: 'condition' },
  { id: 'ueq3', kind: 'pair', low: 'inefficient', high: 'efficient', part: 'condition' },
  { id: 'ueq4', kind: 'pair', low: 'confusing', high: 'clear', part: 'condition' },
  { id: 'ueq5', kind: 'pair', low: 'boring', high: 'exciting', part: 'condition' },
  { id: 'ueq6', kind: 'pair', low: 'not interesting', high: 'interesting', part: 'condition' },
  { id: 'ueq7', kind: 'pair', low: 'conventional', high: 'inventive', part: 'condition' },
  { id: 'ueq8', kind: 'pair', low: 'usual', high: 'leading edge', part: 'condition' },
  { id: 'clear', kind: 'scale', q: 'The AI instructor presented the lecture clearly.', part: 'condition' },
  { id: 'engaged', kind: 'scale', q: 'The lecture kept me engaged.', part: 'condition' },
  { id: 'interactHelped', kind: 'scale', q: 'The interactions during the lecture helped me understand the content.', part: 'condition' },
  { id: 'encouraged', kind: 'scale', q: 'I felt encouraged to participate in the lecture.', part: 'condition' },
  { id: 'smooth', kind: 'scale', q: 'The lecture progressed smoothly without unnecessary interruptions.', part: 'condition' },
  { id: 'matesEffect', kind: 'text', q: 'How did the AI Classmates affect your learning experience?', group: 'classmates', part: 'study' },
  { id: 'matesHelpful', kind: 'text', q: 'What did you find helpful or distracting about the AI Classmates’ interactions?', group: 'classmates', part: 'study' },
  { id: 'helped', kind: 'text', q: 'What helped you learn in the lecture, and what got in the way?', group: 'no_classmates', part: 'study' },
  { id: 'improve', kind: 'text', q: 'What would you improve about the AI-led learning platform?', part: 'study' },
];
// v1's questionnaire (survey.version 'v1'), for the people who answered it: I enjoyed the lesson · I paid attention ·
// easy to follow · learned something new · comfortable asking questions · felt like a class · would learn this way again ·
// mental effort · (classmates) their questions helped · asked what I wanted to know · distracting · Finn's mix-ups made
// me think · felt real · favourite classmate · (without) would have liked other students · liked most · confusing or
// annoying · anything else. Their ids: enjoy, attention, follow, learned, askComfort, notAlone, again, effort,
// matesHelped, matesWanted, matesDistract, finnThink, matesReal, favorite, wantMates, liked, annoyed, other.
export const SURVEY_V1_IDS = ['enjoy', 'attention', 'follow', 'learned', 'askComfort', 'notAlone', 'again', 'effort', 'matesHelped', 'matesWanted', 'matesDistract', 'finnThink', 'matesReal', 'favorite', 'wantMates', 'liked', 'annoyed', 'other'];

export const surveyFor = (group: string | null) => SURVEY.filter((s) => !s.group || s.group === group);

export const GROUPS = ['classmates', 'no_classmates'] as const;
/** A person's participant code (migration 017): P7, or T7 for a test run; null before the migration */
export const participantCode = (no: unknown, test: unknown) => (typeof no === 'number' || typeof no === 'string' ? `${test ? 'T' : 'P'}${no}` : null);
export type StudyGroup = (typeof GROUPS)[number];
