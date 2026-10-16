import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';
import { prepareDeck } from '@/lib/canvas/prepare';
import { applyPatches, countTodo, todoTotal, type Patch } from '@/lib/canvas/aiFields';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const BUDGET_MS = 40_000;   // stop starting new work after this, leaving time to save
// ...and stop waiting for work still going (a helper draft, the quiz) after this: what's done is
// saved, the rest is done next round. Was: work started near the budget ran past the 60 s limit,
// the platform cut the request off (504), and everything the round had made was lost.
const HARD_STOP_MS = 50_000;

// POST { lesson, kind? } → fills in the saved draft's (or the AI deck's) blanks (spoken words, plain
// versions, topics, audio) for up to ~40s. The editor calls again while
// `remaining` is above 0.
export async function POST(req: Request) {
  const { lesson, kind = 'draft' } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson) || !['draft', 'ai'].includes(kind)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const draft = await readDeck(lesson, kind);
  if (!draft) return NextResponse.json({ error: 'Save the draft first' }, { status: 400 });

  const started = Date.now();
  const out: { patches: Patch[]; errors: string[] } = { patches: [], errors: [] };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    prepareDeck(draft, started + BUDGET_MS, out),
    new Promise<void>((resolve) => { timer = setTimeout(() => { stopped = true; resolve(); }, HARD_STOP_MS); }),
  ]);
  clearTimeout(timer);
  // (a copy: work still going keeps adding to `out`, after this round is over)
  const patches = [...out.patches];
  const errors = [...out.errors];

  // Someone may have saved while this ran: apply to the latest draft, and only
  // where the results still match what they were made from
  const latest = (await readDeck(lesson, kind)) ?? draft;
  const applied = applyPatches(latest, patches);
  let warning: string | null = null;
  if (applied > 0) warning = await writeDeck(lesson, kind, latest, kind === 'ai' ? latest.updatedBy ?? 'AI' : await editorName(req));

  const todo = countTodo(latest);
  // more: stopped before everything started was done, so call again even if nothing finished this round
  return NextResponse.json({ patches, remaining: todoTotal(todo), todo, errors, warning, more: stopped });
}
