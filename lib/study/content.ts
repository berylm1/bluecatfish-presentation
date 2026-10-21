// Shared by the browser and the server (no server-only imports here).
// What people read and answer in the study (app/study). The right answers are NOT here (the page
// would show them to anyone who looks): they're in lib/study/key.ts, which only the server reads.
//
// DRAFT: written from what the Blue Catfish lesson teaches. Check every question against the final
// lesson before the study starts, and keep ids the same once real people have answered.

export const STUDY_VERSION = 'v1';   // saved with each person: change it when the questions change
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
    `It takes about ${STUDY_MINUTES} minutes: a few questions about you, a 5-question quiz, the lesson, a second quiz, and a short questionnaire about how it went. You’ll see how you did on the quizzes at the end.`,
    'You need a laptop or desktop computer with sound. The lesson can use your microphone, so you can ask the professor questions out loud, and your camera if you allow it. You can also type, and the camera is optional.',
    'If the camera is on, it is used only inside your browser to notice things like a raised hand or a puzzled look. No video or picture is ever recorded or sent anywhere. Only short labels, such as "looked confused on slide 4", are saved. What you say to the professor is turned into text so it can answer you, and those questions are saved as text.',
    'We don’t ask for your name or email, and nothing you answer is linked to who you are. Your answers are stored securely and used only for this research project. Results may appear in our thesis, only as group totals or without anything that could identify you.',
    'Taking part is voluntary. You can stop at any time by closing the page. Answers you gave up to that point may be kept, without anything that identifies you. There are no known risks beyond normal computer use, and no direct benefit other than learning about blue catfish.',
    'Please don’t tell anyone else what the lesson is like until they’ve done it too.',
  ],
  // Questions about the study: put the research team's or the professor's contact here
  contact: 'Questions about this study? Contact the research team.',
  agree: 'I am 18 or older, I have read the above, and I agree to take part.',
};

/* ------------------------------------------------------------- demographics */

export type Demographic = { id: DemographicId; q: string; choices?: string[]; optional?: boolean; text?: boolean };
export type DemographicId = 'age_range' | 'student' | 'field' | 'ai_use' | 'catfish_knowledge' | 'bay_area' | 'english_first' | 'done_before';

export const DEMOGRAPHICS: Demographic[] = [
  { id: 'age_range', q: 'How old are you?', choices: ['18–24', '25–34', '35–44', '45–54', '55–64', '65 or older'] },
  { id: 'student', q: 'Are you a student?', choices: ['Undergraduate student', 'Graduate student', 'Not a student', 'Other'] },
  { id: 'field', q: 'What do you study, or what is your work? (optional)', text: true, optional: true },
  { id: 'ai_use', q: 'How often do you use AI tools like ChatGPT?', choices: ['Never', 'A few times a year', 'Monthly', 'Weekly', 'Daily'] },
  { id: 'catfish_knowledge', q: 'How much did you know about blue catfish before today?', choices: ['Nothing', 'A little', 'Some', 'A lot'] },
  { id: 'bay_area', q: 'Do you live in or near the Chesapeake Bay area?', choices: ['Yes', 'No', 'Not sure'] },
  { id: 'english_first', q: 'Is English your first language?', choices: ['Yes', 'No'] },
  { id: 'done_before', q: 'Have you gone through this Blue Catfish presentation before?', choices: ['No', 'Yes, part of it', 'Yes, all of it'] },
];

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
  | { id: string; kind: 'scale'; q: string; low?: string; high?: string; group?: 'classmates' | 'no_classmates' }
  | { id: string; kind: 'pick'; q: string; choices: string[]; group?: 'classmates' | 'no_classmates' }
  | { id: string; kind: 'text'; q: string; optional?: boolean; group?: 'classmates' | 'no_classmates' };

export const SCALE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

// Agree/disagree 1-5. `group`: asked only of that group.
export const SURVEY: SurveyItem[] = [
  { id: 'enjoy', kind: 'scale', q: 'I enjoyed the lesson.' },
  { id: 'attention', kind: 'scale', q: 'I paid attention for most of the lesson.' },
  { id: 'follow', kind: 'scale', q: 'The lesson was easy to follow.' },
  { id: 'learned', kind: 'scale', q: 'I learned something new about blue catfish.' },
  { id: 'askComfort', kind: 'scale', q: 'I felt comfortable asking questions.' },
  { id: 'notAlone', kind: 'scale', q: 'It felt like being in a class, not learning alone.' },
  { id: 'again', kind: 'scale', q: 'I would like to learn other topics this way.' },
  { id: 'effort', kind: 'scale', q: 'How much mental effort did the lesson take?', low: 'Very little', high: 'A lot' },
  // with the classmates
  { id: 'matesHelped', kind: 'scale', q: 'The classmates’ questions helped me understand.', group: 'classmates' },
  { id: 'matesWanted', kind: 'scale', q: 'The classmates asked things I wanted to know too.', group: 'classmates' },
  { id: 'matesDistract', kind: 'scale', q: 'The classmates were distracting.', group: 'classmates' },
  { id: 'finnThink', kind: 'scale', q: 'Finn’s mix-ups made me think harder.', group: 'classmates' },
  { id: 'matesReal', kind: 'scale', q: 'The classmates felt like real classmates.', group: 'classmates' },
  { id: 'favorite', kind: 'pick', q: 'Which classmate did you like most?', choices: ['Maya', 'Finn', 'Leo', 'None of them'], group: 'classmates' },
  // without
  { id: 'wantMates', kind: 'scale', q: 'I would have liked other students in the lesson with me.', group: 'no_classmates' },
  // open
  { id: 'liked', kind: 'text', q: 'What did you like most about the lesson?' },
  { id: 'annoyed', kind: 'text', q: 'Was anything confusing or annoying?' },
  { id: 'other', kind: 'text', q: 'Anything else you’d like to tell us? (optional)', optional: true },
];

export const surveyFor = (group: string | null) => SURVEY.filter((s) => !s.group || s.group === group);

export const GROUPS = ['classmates', 'no_classmates'] as const;
export type StudyGroup = (typeof GROUPS)[number];
