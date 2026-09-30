import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';
import { prepareDeck } from '@/lib/canvas/prepare';
import { applyPatches, countTodo, todoTotal } from '@/lib/canvas/aiFields';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const BUDGET_MS = 40_000;   // stop starting new work after this, leaving time to save

// POST { lesson, kind? } → fills in the saved draft's (or the AI deck's) blanks (spoken words, plain
// versions, topics, audio) for up to ~40s. The editor calls again while
// `remaining` is above 0.
export async function POST(req: Request) {
  const { lesson, kind = 'draft' } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson) || !['draft', 'ai'].includes(kind)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const draft = await readDeck(lesson, kind);
  if (!draft) return NextResponse.json({ error: 'Save the draft first' }, { status: 400 });

  const { patches, errors } = await prepareDeck(draft, Date.now() + BUDGET_MS);

  // Someone may have saved while this ran: apply to the latest draft, and only
  // where the results still match what they were made from
  const latest = (await readDeck(lesson, kind)) ?? draft;
  const applied = applyPatches(latest, patches);
  let warning: string | null = null;
  if (applied > 0) warning = await writeDeck(lesson, kind, latest, kind === 'ai' ? latest.updatedBy ?? 'AI' : await editorName(req));

  const todo = countTodo(latest);
  return NextResponse.json({ patches, remaining: todoTotal(todo), todo, errors, warning });
}
