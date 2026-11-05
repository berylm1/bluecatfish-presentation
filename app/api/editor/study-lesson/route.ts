import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { ensureLesson, readDeck, writeDeck } from '@/lib/canvas/store';
import { studyCopy } from '@/lib/canvas/studyLesson';
import { STUDY_LESSON, STUDY_LESSON_TITLE, STUDY_SOURCE } from '@/lib/study/content';

export const dynamic = 'force-dynamic';

/*
 * The study's lesson, "Blue Catfish (study)" (lib/study/content.ts; editors only: under /api/editor in proxy.ts)
 *   GET   → whether it's there yet
 *   POST  → make it: a copy of the original's live lesson (else its draft), as its draft, with none of the original's
 *           extras (lib/canvas/studyLesson.ts). Only once: after that, slides come across one by one in the editor
 *           ("Pull from the original…"). Saving it in the editor writes its own extras, from its slides only.
 */
async function exists() {
  const [draft, live] = await Promise.all([readDeck(STUDY_LESSON, 'draft'), readDeck(STUDY_LESSON, 'live')]);
  return { draft: !!draft?.slides?.length, live: !!live?.slides?.length };
}

export async function GET() {
  return NextResponse.json({ lesson: { id: STUDY_LESSON, title: STUDY_LESSON_TITLE }, source: STUDY_SOURCE, ...(await exists()) });
}

export async function POST(req: Request) {
  const now = await exists();
  if (now.draft || now.live) return NextResponse.json({ error: `“${STUDY_LESSON_TITLE}” is already there: open it in the editor, and use More ▾ → Pull from the original… for changed slides.` }, { status: 409 });
  const original = (await readDeck(STUDY_SOURCE, 'live')) ?? (await readDeck(STUDY_SOURCE, 'draft'));
  if (!original?.slides?.length) return NextResponse.json({ error: 'The original lesson has no slides to copy' }, { status: 400 });
  const by = (await editorName(req)) ?? 'editor';
  const warnings = [await ensureLesson({ id: STUDY_LESSON, title: STUDY_LESSON_TITLE }, by)];
  const deck = studyCopy(original, STUDY_LESSON, STUDY_LESSON_TITLE);
  warnings.push(await writeDeck(STUDY_LESSON, 'draft', deck, by));
  return NextResponse.json({ ok: true, lesson: { id: STUDY_LESSON, title: STUDY_LESSON_TITLE }, slides: deck.slides.length, warnings: warnings.filter(Boolean) });
}
