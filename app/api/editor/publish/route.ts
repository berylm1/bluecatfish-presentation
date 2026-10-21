import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { deleteDeck, isLessonId, readDeck, writeDeck } from '@/lib/canvas/store';
import { writeRecap } from '@/lib/canvas/prepare';
import { cleanName, MAX_NAME, nameTaken, saveVersion } from '@/lib/canvas/saved';

export const maxDuration = 120;   // (was 60: the bigger model takes longer per call)

export const dynamic = 'force-dynamic';

// POST { lesson, saveAs } → the saved draft becomes the live deck, and is saved under the name
// `saveAs` (a name not used before: lib/canvas/saved.ts), to load again later.
// DELETE { lesson } → takes the live deck down (the presentation goes back to the AI lesson).
export async function POST(req: Request) {
  const { lesson, baseRev, saveAs } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  // The name it's saved as: checked before anything goes live
  const name = cleanName(saveAs);
  if (!name) return NextResponse.json({ error: `Give this version a name (up to ${MAX_NAME} characters)`, field: 'saveAs' }, { status: 400 });
  if (await nameTaken(name)) return NextResponse.json({ error: `“${name}” is already used: pick another name`, field: 'saveAs' }, { status: 409 });
  const draft = await readDeck(lesson, 'draft');
  // Someone saved a different draft since this editor's last save: don't
  // publish slides the person pressing Publish hasn't seen
  if (baseRev !== undefined && draft?.editRev && draft.editRev !== baseRev) {
    return NextResponse.json({ error: 'conflict', conflict: { by: draft.updatedBy ?? 'someone', at: draft.updatedAt ?? null } }, { status: 409 });
  }
  if (!draft || draft.slides.length === 0) {
    return NextResponse.json({ error: 'Save at least one slide before publishing' }, { status: 400 });
  }
  const by = await editorName(req);
  // The end-of-lesson recap: written by the AI unless someone wrote their own
  let recapError: string | null = null;
  if (!draft.recap?.trim() || draft.recapByAI) {
    try {
      draft.recap = await writeRecap(draft);
      draft.recapByAI = true;
      await writeDeck(lesson, 'draft', draft, by);
    } catch (e) {
      recapError = `The recap couldn't be written: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  // The editor's check results stay with the draft: learners get the lesson without them
  // (a hands-on box keeps only whether its answers checked out: Finn plays only those)
  const { checks: _editorOnly, ...live } = structuredClone(draft);
  for (const s of live.slides) for (const e of [...s.elements, ...(s.helper?.elements ?? [])]) {
    if (e.type === 'activity' && e.answerCheck) e.answerCheck = { from: e.answerCheck.from, ok: e.answerCheck.ok };
  }
  live.savedAs = name;   // (the publish history's copy has its name too)
  const saveError = await saveVersion(lesson, name, draft, by);
  const warning = (await writeDeck(lesson, 'live', live, by)) ?? recapError ?? (saveError ? `Published, but not saved under that name: ${saveError}` : null);
  return NextResponse.json({ ok: true, publishedAt: new Date().toISOString(), by, warning, savedAs: saveError ? null : name, recap: draft.recap ?? null, recapByAI: !!draft.recapByAI });
}

export async function DELETE(req: Request) {
  const { lesson } = await req.json().catch(() => ({}));
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const warning = await deleteDeck(lesson, 'live');
  return NextResponse.json({ ok: true, warning });
}
