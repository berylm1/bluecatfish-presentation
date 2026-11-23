/*
 * The first draft of a new lesson's plan (the editor's "New lesson" flow): from a topic, and optionally the teacher's own
 * material, the AI proposes the lesson's title, one line about it, its goals and its sections, plus the profile fields
 * the teacher left to the AI (ages, length, subject…). The teacher edits it; then the lesson is drafted from it
 * (generate.ts generateAiDeck with the sections as its plan).
 */
import { chat, knowledge } from './ai';
import { enterProfile } from './lessonContext';
import { blankProfile, type LessonProfile } from './profile';

/** What the teacher gave: a topic, maybe material, and the settings they chose (left out: the AI picks) */
export interface OutlineInput {
  topic: string;
  /** Their own material (notes, an article, a chapter): the lesson is built from it */
  material?: string;
  subject?: string;
  ageMin?: number;
  ageMax?: number;
  minutes?: number;
  language?: string;
  sourceMode?: LessonProfile['sourceMode'];
  structure?: LessonProfile['structure'];
  /** Goals they already have (structure 'goals': one section each, or so) */
  goals?: string[];
  /** Sections they already have (structure 'mine': kept as they are) */
  sections?: string[];
  /** Knowledge bases to search for facts (none: only the material, or general knowledge) */
  knowledgeBases?: string[];
  /** Something to do differently from the last proposal ("Try another") */
  avoid?: string;
}

export interface OutlineSection { title: string; covers: string[] }

export interface Outline {
  title: string;
  pitch: string;
  subject: string;
  about: string;
  ageMin: number;
  ageMax: number;
  minutes: number;
  language: string;
  sourceMode: LessonProfile['sourceMode'];
  structure: LessonProfile['structure'];
  goals: string[];
  sections: OutlineSection[];
  practical: string;
  jokesAt: string;
  familyThings: string[];
}

const PLAN = `You plan a short, interactive lesson that an AI teacher teaches to young learners, with AI classmates.
From the TOPIC (and the MATERIAL or SOURCE CONTENT, when there is some), propose the lesson's plan. Where the teacher chose
a setting, keep it exactly; where it says "AI picks", choose what suits the topic best.
- title: 2 to 5 words, inviting
- pitch: one sentence a learner would want to read ("A short, hands-on lesson about…")
- subject: one word or two ("science", "math", "history", "video games", "music"…)
- about: what the lesson is about, as it reads in "a class about …" (lowercase, under 12 words)
- ageMin, ageMax: the learners' ages (a span of 2 to 5 years); minutes: about how long (5 to 30)
- goals: 3 to 5, each "By the end, they can …" without those words: a verb first ("Explain why…", "Add two fractions…")
- sections: the lesson's parts, in teaching order, about one per 3 minutes (3 to 7). Each: a title of 2 to 5 words and
  "covers": the 2 to 5 ideas or facts it teaches. Never the same idea in two sections. A sensible order: what it is,
  how it works or why, what it means for people, what to do or try
  (structure "sources": follow the material's own order and headings; "goals": the goals decide the sections, about one each;
  "mine": keep the teacher's sections exactly, only fill in what each covers)
- practical: what a practical classmate's questions are about (people and daily life for this topic, under 8 words)
- jokesAt: what the teacher's light jokes are aimed at (never the learner): the topic's thing ("the fish", "fractions")
- familyThings: 3 short, true things a learner could tell their family afterwards (under 25 words each)
Facts: when sourceMode is "sources", only what the MATERIAL or SOURCE CONTENT supports; otherwise accurate, well-established
knowledge suitable for the ages. Nothing scary, unkind or unsuitable for children.
Reply as JSON: {"title":"","pitch":"","subject":"","about":"","ageMin":0,"ageMax":0,"minutes":0,"goals":[""],
"sections":[{"title":"","covers":[""]}],"practical":"","jokesAt":"","familyThings":[""]}`;

const s = (v: unknown, max: number, d = ''): string => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : d);
const n = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const list = (v: unknown, k: number, max: number): string[] => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, k) : []);

/** The proposed plan (the teacher's own choices kept as they are) */
export async function proposeOutline(input: OutlineInput): Promise<Outline> {
  const topic = s(input.topic, 300);
  if (!topic && !input.material?.trim()) throw new Error('Say what the lesson is about, or paste some material');
  const material = (input.material ?? '').trim().slice(0, 16000);
  // (the AI's instructions: a lesson on this topic, for these ages, while it plans)
  const draft = blankProfile(topic || 'this topic');
  enterProfile({ ...draft, ageMin: input.ageMin ?? 10, ageMax: input.ageMax ?? 14, knowledgeBases: input.knowledgeBases?.length ? input.knowledgeBases : ['__none'] });
  const searched = !material && input.knowledgeBases?.length ? await knowledge(`${topic}: overview, how it works, why it matters, examples`, 30) : '';
  const chose = (v: unknown) => (v === undefined || v === null || v === '' ? 'AI picks' : JSON.stringify(v));
  const settings = [
    `subject: ${chose(input.subject)}`, `ageMin: ${chose(input.ageMin)}`, `ageMax: ${chose(input.ageMax)}`, `minutes: ${chose(input.minutes)}`,
    `language: ${chose(input.language)}`, `sourceMode: ${chose(input.sourceMode ?? (material || searched ? 'sources' : 'general'))}`,
    `structure: ${chose(input.structure ?? (material ? 'sources' : 'goals'))}`,
    ...(input.goals?.length ? [`goals (keep these): ${JSON.stringify(input.goals)}`] : []),
    ...(input.sections?.length ? [`sections (keep these titles, in this order): ${JSON.stringify(input.sections)}`] : []),
  ].join('\n');
  const out = JSON.parse(await chat(PLAN,
    `TOPIC: ${topic || '(from the material)'}\n\nTHE TEACHER'S SETTINGS:\n${settings}\n` +
      (input.avoid ? `\nThey asked for a different version than this one: ${input.avoid.slice(0, 600)}\n` : '') +
      (material ? `\nMATERIAL:\n${material}` : searched ? `\nSOURCE CONTENT:\n${searched}` : '\n(No material: plan from accurate, well-established knowledge.)'),
    true, 4000));
  const ageMin = input.ageMin ?? n(out.ageMin, 4, 99, 10);
  const ageMax = input.ageMax ?? n(out.ageMax, ageMin, 99, Math.max(ageMin, 14));
  const sections: OutlineSection[] = (Array.isArray(out.sections) ? out.sections : [])
    .map((x: any) => ({ title: s(x?.title, 80), covers: list(x?.covers, 6, 200) }))
    .filter((x: OutlineSection) => x.title)
    .slice(0, 8);
  if (!sections.length) throw new Error('The AI didn’t propose any sections: try again, or say a little more about the topic');
  return {
    title: s(out.title, 120, topic.slice(0, 60) || 'New lesson'),
    pitch: s(out.pitch, 300),
    subject: s(input.subject, 60) || s(out.subject, 60, 'science'),
    about: s(out.about, 200, topic),
    ageMin, ageMax,
    minutes: input.minutes ?? n(out.minutes, 3, 60, 15),
    language: s(input.language, 40) || 'English',
    sourceMode: input.sourceMode ?? (material || searched ? 'sources' : 'general'),
    structure: input.structure ?? (material ? 'sources' : 'goals'),
    goals: input.goals?.length ? input.goals : list(out.goals, 6, 240),
    sections,
    practical: s(out.practical, 200, 'people and everyday life'),
    jokesAt: s(out.jokesAt, 80, 'the topic'),
    familyThings: list(out.familyThings, 5, 300),
  };
}

/** The lesson's profile from its outline (what's saved with the new lesson) */
export function profileFromOutline(o: Outline, lessonId: string): Partial<LessonProfile> {
  return {
    title: o.title, pitch: o.pitch, subject: o.subject, about: o.about, ageMin: o.ageMin, ageMax: o.ageMax, language: o.language,
    goals: o.goals, sourceMode: o.sourceMode, structure: o.structure, targetMinutes: o.minutes, practical: o.practical, jokesAt: o.jokesAt,
    familyThings: o.familyThings, knowledgeBases: [lessonId],
  };
}

/** A checked outline (from the editor: the teacher's edits) */
export function sanitizeOutline(raw: any): Outline | null {
  if (!raw || typeof raw !== 'object') return null;
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((x: any) => ({ title: s(x?.title, 80), covers: list(x?.covers, 6, 200) })).filter((x: OutlineSection) => x.title).slice(0, 8);
  const title = s(raw.title, 120);
  if (!title || !sections.length) return null;
  const ageMin = n(raw.ageMin, 4, 99, 10);
  return {
    title, pitch: s(raw.pitch, 300), subject: s(raw.subject, 60, 'science'), about: s(raw.about, 200, title),
    ageMin, ageMax: n(raw.ageMax, ageMin, 99, Math.max(ageMin, 14)), minutes: n(raw.minutes, 3, 60, 15), language: s(raw.language, 40, 'English'),
    sourceMode: (['sources', 'sources-first', 'general'] as const).includes(raw.sourceMode) ? raw.sourceMode : 'sources',
    structure: (['sources', 'goals', 'mine'] as const).includes(raw.structure) ? raw.structure : 'sources',
    goals: list(raw.goals, 8, 240), sections, practical: s(raw.practical, 200, 'people and everyday life'), jokesAt: s(raw.jokesAt, 80, 'the topic'),
    familyThings: list(raw.familyThings, 5, 300),
  };
}
