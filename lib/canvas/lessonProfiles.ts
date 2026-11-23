/*
 * A lesson's profile by its id, from the stored deck (server only: the API routes). lib/canvas/lessonContext.ts
 * holds the lesson being worked on; this finds it for a request from the lesson page (its X-Lesson header).
 */
import { BLUE_CATFISH, profileOf, type LessonProfile } from './profile';
import { enterProfile } from './lessonContext';
import { isLessonId, readDeck } from './store';

export const LESSON_HEADER = 'x-lesson';

// Each lesson's profile, kept a minute (a lesson's requests come in bursts; an edit shows within the minute)
const cache = new Map<string, { at: number; p: Promise<LessonProfile> }>();
const KEEP_MS = 60_000;

async function load(lesson: string): Promise<LessonProfile> {
  if (!isLessonId(lesson)) return BLUE_CATFISH;
  try {
    const deck = (await readDeck(lesson, 'live')) ?? (await readDeck(lesson, 'draft'));
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

/** A request from the lesson page: its lesson (the X-Lesson header) is the one worked on for the rest of the request */
export async function enterLessonOf(req: Request): Promise<LessonProfile> {
  const lesson = req.headers.get(LESSON_HEADER);
  const p = lesson ? await profileForLesson(lesson) : BLUE_CATFISH;
  enterProfile(p);
  return p;
}
