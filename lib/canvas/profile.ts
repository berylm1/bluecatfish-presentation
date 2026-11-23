/*
 * The lesson profile: everything about a lesson that's about its TOPIC, not its slides (what it's about, who it's for,
 * its goals, the teacher's name, the family card, the sources…). Stored with the deck (Deck.profile, so in Supabase
 * with the slides); a field not set takes the lesson's default: the blue catfish lesson's are what it always had.
 *
 * The AI's instructions name these through placeholders ({{teacher}}, {{about}}, {{ages}}…), filled in from the lesson
 * being worked on (lib/canvas/lessonContext.ts) just before each call. The professor's TONE and style aren't here: they
 * stay as they are for every lesson (lib/canvas/ai.ts STYLE).
 */
import type { Source } from '@/lib/sources';
import { SOURCES } from '@/lib/sources';

export interface LessonProfile {
  /** The lesson's name ("Blue Catfish") */
  title: string;
  /** One line about it, for the home page and the lesson list */
  pitch: string;
  /** The subject ("science", "math", "history"…): the teacher is "a fun {subject} teacher" */
  subject: string;
  /** What it's about, as it reads in "a class about …" ("the blue catfish invasion of the Chesapeake Bay") */
  about: string;
  /** The learners' ages */
  ageMin: number;
  ageMax: number;
  /** The language the lesson is in */
  language: string;
  /** What learners already know before it */
  priorKnowledge: string;
  /** What learners should be able to do by the end (3 to 5) */
  goals: string[];
  /** Where facts may come from: only the lesson's sources, the sources first, or general knowledge too */
  sourceMode: 'sources' | 'sources-first' | 'general';
  /** How the sections are worked out: from the source material, from the goals, or written by hand */
  structure: 'sources' | 'goals' | 'mine';
  /** About how long the lesson should take (minutes) */
  targetMinutes: number;
  /** The teacher */
  teacher: { name: string; signOff: string };
  /** What the "practical" classmate's questions are about ("fishermen, food and the Bay") */
  practical: string;
  /** What the professor's light sarcasm is aimed at ("the fish"): never the learner */
  jokesAt: string;
  /** The end screen's "3 things to tell your family" */
  familyThings: string[];
  /** The end screen's "Learn more" link */
  learnMore: { label: string; url: string } | null;
  /** Where the lesson's facts come from (the sources page, the PDF) */
  sources: Source[];
  /** The knowledge bases it searches (its source chunks and pictures: supabase/migrations/024_knowledge_bases.sql).
   * Pictures in 'shared' are offered to every lesson too */
  knowledgeBases: string[];
}

/** The blue catfish lesson, as it is */
export const BLUE_CATFISH: LessonProfile = {
  title: 'Blue Catfish',
  pitch: 'A short, hands-on lesson about the giant fish that’s changing the Chesapeake Bay.',
  subject: 'science',
  about: 'the blue catfish invasion of the Chesapeake Bay',
  ageMin: 10,
  ageMax: 14,
  language: 'English',
  priorKnowledge: 'Most have never heard of blue catfish or the problem they cause.',
  goals: [
    'Explain where blue catfish come from and how they got to the Chesapeake Bay',
    'Describe what blue catfish eat and why few animals eat them',
    'Explain why blue catfish are a problem for the Bay',
    'Name ways people are working to control them, including eating them',
  ],
  sourceMode: 'sources',
  structure: 'sources',
  targetMinutes: 15,
  teacher: { name: 'Professor Marine', signOff: 'Marine out!' },
  practical: 'fishermen, food and the Bay',
  jokesAt: 'the fish',
  familyThings: [
    'Blue catfish aren’t from here: people brought them to Virginia rivers in the 1970s, and they’ve spread across the Chesapeake Bay.',
    'They eat almost anything, blue crabs included, and almost nothing eats the big ones.',
    'One of the best ways to help: catch them and eat them. They’re tasty!',
  ],
  learnMore: { label: 'Maryland DNR: blue catfish', url: 'https://dnr.maryland.gov/fisheries/Pages/blue-catfish/blue_catfish_main.aspx' },
  sources: SOURCES,
  knowledgeBases: ['blue-catfish'],
};

/** A new lesson's starting point: the teacher and the house's habits, nothing about a topic */
export function blankProfile(title: string): LessonProfile {
  return {
    ...BLUE_CATFISH,
    title,
    pitch: '',
    about: title,
    priorKnowledge: '',
    goals: [],
    practical: 'people and everyday life',
    jokesAt: 'the topic',
    familyThings: [],
    learnMore: null,
    sources: [],
    knowledgeBases: [],
  };
}

/** The blue catfish lessons (the lesson, its study version, their copies): their defaults are the blue catfish ones */
const isBlueCatfish = (lessonId: string) => /^blue-catfish/.test(lessonId) || lessonId === 'sample';

/** The lesson's profile: what's been set, over its defaults */
export function profileOf(deck: { lessonId: string; title?: string; profile?: Partial<LessonProfile> }): LessonProfile {
  const base = isBlueCatfish(deck.lessonId) ? BLUE_CATFISH : { ...blankProfile(deck.title || deck.lessonId), knowledgeBases: [deck.lessonId] };
  const p = deck.profile ?? {};
  const out = { ...base, ...p, teacher: { ...base.teacher, ...(p.teacher ?? {}) } };
  if (!out.knowledgeBases.length) out.knowledgeBases = base.knowledgeBases;   // (always at least one)
  return out;
}

/** The placeholders in the AI's instructions, and what each becomes for this lesson */
export function placeholders(p: LessonProfile): Record<string, string> {
  return {
    teacher: p.teacher.name,
    about: p.about,
    subject: p.subject,
    ages: `${p.ageMin} to ${p.ageMax}`,
    kidAge: String(Math.round((p.ageMin + p.ageMax) / 2)),
    practical: p.practical,
    language: p.language,
    jokesAt: p.jokesAt,
  };
}

/** Fills {{name}} placeholders in an AI instruction (unknown ones are left as they are). inJson: the text is a JSON
 * request body, so each value goes in escaped (a quote in a lesson's title can't break it) */
export function fillPlaceholders(text: string, p: LessonProfile, inJson = false): string {
  if (!text.includes('{{')) return text;
  const values = placeholders(p);
  return text.replace(/\{\{(\w+)\}\}/g, (all, k: string) => (k in values ? (inJson ? JSON.stringify(values[k]).slice(1, -1) : values[k]) : all));
}

/* ------------------------------------------------------------------ checking what's stored */

/** A knowledge base's id (as a lesson's: lowercase, digits and dashes) */
export const isKbId = (v: string): boolean => /^[a-z0-9][a-z0-9-]{0,60}$/.test(v);

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : undefined);
const list = (v: unknown, n: number, max: number): string[] | undefined =>
  Array.isArray(v) ? v.flatMap((x) => (str(x, max) ? [str(x, max)!] : [])).slice(0, n) : undefined;
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;
const url = (v: unknown): string | undefined => {
  const s = str(v, 500);
  return s && /^https:\/\/[^\s<>"]+$/.test(s) ? s : undefined;
};
const oneOf = <T extends string>(v: unknown, opts: readonly T[]): T | undefined => (opts.includes(v as T) ? (v as T) : undefined);

/** A stored profile, checked: only known fields, each the right kind and size (undefined: not set) */
export function sanitizeProfile(raw: unknown): Partial<LessonProfile> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, any>;
  const t = r.teacher && typeof r.teacher === 'object' ? r.teacher : null;
  const out: Partial<LessonProfile> = {
    title: str(r.title, 120),
    pitch: str(r.pitch, 300),
    subject: str(r.subject, 60),
    about: str(r.about, 200),
    ageMin: num(r.ageMin, 4, 99),
    ageMax: num(r.ageMax, 4, 99),
    language: str(r.language, 40),
    priorKnowledge: str(r.priorKnowledge, 400),
    goals: list(r.goals, 8, 240),
    sourceMode: oneOf(r.sourceMode, ['sources', 'sources-first', 'general'] as const),
    structure: oneOf(r.structure, ['sources', 'goals', 'mine'] as const),
    targetMinutes: num(r.targetMinutes, 3, 120),
    teacher: t ? { name: str(t.name, 60) || BLUE_CATFISH.teacher.name, signOff: str(t.signOff, 60) ?? '' } : undefined,
    practical: str(r.practical, 200),
    jokesAt: str(r.jokesAt, 80),
    familyThings: list(r.familyThings, 5, 300),
    learnMore: r.learnMore === null ? null : r.learnMore && typeof r.learnMore === 'object' && url(r.learnMore.url)
      ? { label: str(r.learnMore.label, 120) || url(r.learnMore.url)!, url: url(r.learnMore.url)! } : undefined,
    sources: Array.isArray(r.sources)
      ? r.sources.slice(0, 40).flatMap((s: any) => (url(s?.url) && str(s?.title, 300) ? [{ title: str(s.title, 300)!, org: str(s.org, 200) ?? '', url: url(s.url)! }] : []))
      : undefined,
    knowledgeBases: Array.isArray(r.knowledgeBases)
      ? [...new Set(r.knowledgeBases.filter((k: unknown): k is string => typeof k === 'string' && isKbId(k)))].slice(0, 6) as string[]
      : undefined,
  };
  if (out.ageMin !== undefined && out.ageMax !== undefined && out.ageMin > out.ageMax) [out.ageMin, out.ageMax] = [out.ageMax, out.ageMin];
  const set = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<LessonProfile>;
  return Object.keys(set).length ? set : undefined;
}
