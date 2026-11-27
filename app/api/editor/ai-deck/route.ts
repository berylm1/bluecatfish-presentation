import { NextResponse } from 'next/server';
import { isLessonId, listLessons, readDeck, writeDeck } from '@/lib/canvas/store';
import { generateAiDeck, type TopicPlan } from '@/lib/canvas/generate';
import { profileOf } from '@/lib/canvas/profile';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { editorName } from '@/lib/editorAuth';
import { countTodo, todoTotal } from '@/lib/canvas/aiFields';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;   // planning + one call per topic (in parallel) + one retry

// GET ?lesson= → about the lesson's AI deck (or null).
// POST { lesson } → makes a new AI deck in the canvas format and stores it.
// Learners get it when nothing is published. Audio is made afterwards by
// /api/editor/prepare with kind "ai".
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const deck = await readDeck(lesson, 'ai');
  if (deck) enterProfile(profileOf(deck));   // (what's still to record goes by the lesson's voice)
  return NextResponse.json({
    // todo: what the save-time AI still has to do (audio…): above 0 after a cut-short round, for "Finish the audio"
    ai: deck?.slides?.length ? { at: deck.updatedAt, slides: deck.slides.length, topics: new Set(deck.slides.map((s) => s.topic)).size, todo: todoTotal(countTodo(deck)) } : null,
  });
}

// (the "New lesson" flow: { lesson, sections, material?, draft: true }: written from its outline's sections, under the
// lesson's profile; with draft, also its draft, if that has no slides yet: never over someone's work)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) ?? {};
  const { lesson } = body;
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const info = (await listLessons()).find((l) => l.id === lesson) ?? { id: lesson, title: lesson };
  const draft = await readDeck(lesson, 'draft');
  // { syncDraft: true }: the AI deck as it is NOW (after its audio, plain versions, class questions… are made:
  // /api/editor/prepare with kind "ai") becomes the draft too, for a lesson nobody has edited yet (the "New lesson"
  // flow's last step: the editor opens on a lesson that's ready, not one with everything still to write)
  if (body.syncDraft === true) {
    const ai = await readDeck(lesson, 'ai');
    if (!ai?.slides?.length || !draft || draft.editRev) return NextResponse.json({ ok: true, synced: false });
    const failed = await writeDeck(lesson, 'draft', { ...ai, source: 'hand', profile: draft.profile ?? ai.profile }, await editorName(req));
    return NextResponse.json({ ok: true, synced: !failed, warning: failed ?? undefined });
  }
  const plan: TopicPlan[] | undefined = Array.isArray(body.sections)
    ? body.sections.slice(0, 8).flatMap((x: any) => {
      const title = typeof x?.title === 'string' ? x.title.trim().slice(0, 80) : '';
      const covers = Array.isArray(x?.covers) ? x.covers.filter((c: unknown): c is string => typeof c === 'string').map((c: string) => c.slice(0, 200)).slice(0, 6) : [];
      return title ? [{ title, covers, query: `${title}: ${covers.join('; ')}`.slice(0, 400) }] : [];
    })
    : undefined;
  const material = typeof body.material === 'string' ? body.material.slice(0, 60000) : undefined;
  try {
    const started = Date.now();
    const { deck, notes } = await generateAiDeck(info, { plan, material, profile: draft ? profileOf(draft) : undefined });
    if (draft?.profile) deck.profile = draft.profile;   // (learners get this deck while nothing is published: its profile with it)
    await writeDeck(lesson, 'ai', deck, 'AI');
    if (body.draft === true && draft && !draft.slides.length) {
      const failed = await writeDeck(lesson, 'draft', { ...deck, source: 'hand' }, await editorName(req));
      if (failed) notes.push(failed);
    }
    return NextResponse.json({ ok: true, slides: deck.slides.length, seconds: Math.round((Date.now() - started) / 1000), notes });
  } catch (e) {
    return NextResponse.json({ error: `The AI deck couldn't be made: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
