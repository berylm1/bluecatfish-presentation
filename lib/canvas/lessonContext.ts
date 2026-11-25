/*
 * Which lesson the server is working on, for the AI's instructions (server only). Set once per request or job
 * (enterProfile, in the route itself: lessonProfiles.ts lessonOf), and read when a call goes to OpenAI (lib/canvas/ai.ts openai(): its {{placeholders}} are
 * filled from it). Nothing set: the blue catfish lesson, as before.
 */
import { BLUE_CATFISH, fillPlaceholders, type LessonProfile } from './profile';

// (Node's AsyncLocalStorage, as Next.js puts it on the server's globalThis: not imported, so the files that use this can
// still be bundled for the browser (the editor imports some of them): there it's never set, and it's blue catfish)
type Store = { getStore(): LessonProfile | undefined; run<T>(p: LessonProfile, fn: () => T): T; enterWith(p: LessonProfile): void };
const ALS = (globalThis as { AsyncLocalStorage?: new () => Store }).AsyncLocalStorage;
const store: Store = ALS ? new ALS() : { getStore: () => undefined, run: (_p, fn) => fn(), enterWith: () => {} };

/** The lesson being worked on (none set: blue catfish) */
export const currentProfile = (): LessonProfile => store.getStore() ?? BLUE_CATFISH;

/** Fills the AI instruction's placeholders from the lesson being worked on */
export const fillForLesson = (text: string, inJson = false): string => fillPlaceholders(text, currentProfile(), inJson);

/** From here on, in this request or job, the lesson is this one */
export function enterProfile(p: LessonProfile): void {
  store.enterWith(p);
}

/** Runs `fn` for this lesson */
export function withProfile<T>(p: LessonProfile, fn: () => T): T {
  return store.run(p, fn);
}

