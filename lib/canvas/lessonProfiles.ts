/*
 * A lesson's profile by its id, from the stored deck (server only: the API routes). lib/canvas/lessonContext.ts
 * holds the lesson being worked on; this finds it for a request from the lesson page (its X-Lesson header).
 */
import { BLUE_CATFISH, profileOf, type LessonProfile } from './profile';
import { isLessonId, readDeck } from './store';

export const LESSON_HEADER = 'x-lesson';

// Each lesson's profile, kept a minute (a lesson's requests come in bursts; an edit shows within the minute)
const cache = new Map<string, { at: number; p: Promise<LessonProfile> }>();
const KEEP_MS = 60_000;

async function load(lesson: string): Promise<LessonProfile> {
  if (!isLessonId(lesson)) return BLUE_CATFISH;
  try {
    const deck = (await readDeck(lesson, 'live')) ?? (await readDeck(lesson, 'draft')) ?? (await readDeck(lesson, 'ai'));
    return profileOf(deck ?? { lessonId: lesson });
  } catch {
    return profileOf({ lessonId: lesson });
  }
}

/** The profile of a lesson (by its id), from the stored deck */
export function profileForLesson(lesson: string): Promise<LessonProfile> {
  const hit = cache.get(lesson);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.p;
  const p = load(lesson);
  cache.set(lesson, { at: Date.now(), p });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return p;
}

/**
 * A request from the lesson page: its lesson (the X-Lesson header), none: blue catfish. The route enters it ITSELF, as
 *   enterProfile(await lessonOf(req));
 * Was: entered in here (enterLessonOf), after an await: with Node's newer async context (on by default in Node 24, the
 * server's), that lasts only until this function returns, so every AI route went on as blue catfish ("I'm here for our
 * lesson about the blue catfish invasion…" to a fractions question, seen on a preview) and searched its knowledge base.
 */
export async function lessonOf(req: Request): Promise<LessonProfile> {
  const lesson = req.headers.get(LESSON_HEADER);
  return lesson ? profileForLesson(lesson) : BLUE_CATFISH;
}

/** For a kept (cached) AI answer's key: the asking lesson, so lessons never share one ("" for blue catfish: its keys stay as they were) */
export function cacheTag(req: Request): string {
  const lesson = req.headers.get(LESSON_HEADER);
  return !lesson || !isLessonId(lesson) || /^blue-catfish/.test(lesson) ? '' : `${lesson}:`;
}
