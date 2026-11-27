/*
 * A lesson's profile by its id, from the stored deck (server only: the API routes). lib/canvas/lessonContext.ts
 * holds the lesson being worked on; this finds it for a request from the lesson page (its X-Lesson header).
 */
import { BLUE_CATFISH, profileOf, type LessonProfile } from './profile';
import { isLessonId, readDeck } from './store';
import { editorOf } from '@/lib/rateLimit';

export const LESSON_HEADER = 'x-lesson';

// Each lesson's profile, kept a minute (a lesson's requests come in bursts; an edit shows within the minute).
// open: learners can open the lesson (it's published, or has an AI-made deck, which is what they get until it is)
type Entry = { profile: LessonProfile; open: boolean };
const cache = new Map<string, { at: number; p: Promise<Entry> }>();
const KEEP_MS = 60_000;

// (the blue catfish lesson and its copies, the study's among them, are the site's public lesson whatever their own state)
const alwaysOpen = (lesson: string) => /^blue-catfish/.test(lesson) || lesson === 'sample';

async function load(lesson: string): Promise<Entry> {
  if (!isLessonId(lesson)) return { profile: BLUE_CATFISH, open: true };
  try {
    const live = await readDeck(lesson, 'live');
    const draft = live ? null : await readDeck(lesson, 'draft');
    // (the AI-made deck: read when there's no published one, to know whether learners have anything to open)
    const ai = live?.slides?.length ? null : await readDeck(lesson, 'ai');
    return { profile: profileOf(live ?? draft ?? ai ?? { lessonId: lesson }), open: alwaysOpen(lesson) || !!live?.slides?.length || !!ai?.slides?.length };
  } catch {
    return { profile: profileOf({ lessonId: lesson }), open: alwaysOpen(lesson) };
  }
}

function entryFor(lesson: string): Promise<Entry> {
  const hit = cache.get(lesson);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.p;
  const p = load(lesson);
  cache.set(lesson, { at: Date.now(), p });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return p;
}

/** The profile of a lesson (by its id), from the stored deck. For the editor's own routes: any lesson, published or not. */
export const profileForLesson = (lesson: string): Promise<LessonProfile> => entryFor(lesson).then((e) => e.profile);

/** A lesson's profile as anyone may see it: null for one learners can't open yet (never published, no AI-made deck) and for an id that isn't a lesson */
export const publicProfile = (lesson: string): Promise<LessonProfile | null> => entryFor(lesson).then((e) => (e.open ? e.profile : null));

/**
 * A request from the lesson page: its lesson (the X-Lesson header), none: blue catfish. The route enters it ITSELF, as
 *   enterProfile(await lessonOf(req));
 * Was: entered in here (enterLessonOf), after an await: with Node's newer async context (on by default in Node 24, the
 * server's), that lasts only until this function returns, so every AI route went on as blue catfish ("I'm here for our
 * lesson about the blue catfish invasion…" to a fractions question, seen on a preview) and searched its knowledge base.
 *
 * A lesson learners can't open yet (a draft nobody has published, with no AI-made deck) is only worked in by its
 * editors (the editor's Preview plays the draft): from anyone else the header is as if it weren't there. Was: anyone
 * who guessed a draft's id had the professor answer from its settings and its own material.
 */
export async function lessonOf(req: Request): Promise<LessonProfile> {
  const lesson = req.headers.get(LESSON_HEADER);
  if (!lesson) return BLUE_CATFISH;
  const e = await entryFor(lesson);
  if (e.open) return e.profile;
  return (await editorOf(req)) ? e.profile : BLUE_CATFISH;
}

/** For a kept (cached) AI answer's key: the asking lesson, so lessons never share one ("" for blue catfish: its keys stay as they were) */
export function cacheTag(req: Request): string {
  const lesson = req.headers.get(LESSON_HEADER);
  return !lesson || !isLessonId(lesson) || /^blue-catfish/.test(lesson) ? '' : `${lesson}:`;
}
