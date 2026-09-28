// Shared by the browser and the server (no server-only imports here)
export interface LessonInfo { id: string; title: string }

/** The lesson the home page's Start button plays. */
export const DEFAULT_LESSON: LessonInfo = { id: 'blue-catfish', title: 'Blue Catfish' };

/** Lessons with an AI lesson to fall back on (AI decks for new lessons come in step 5). */
export const HAS_AI_LESSON = new Set([DEFAULT_LESSON.id]);
