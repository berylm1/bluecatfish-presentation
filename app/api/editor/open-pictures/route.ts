import { NextResponse } from 'next/server';
import { isLessonId } from '@/lib/canvas/store';
import { profileForLesson } from '@/lib/canvas/lessonProfiles';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { addOpenPicture, findLessonPictures, findSlidePicture, openPictureById, searchOpenPictures, type Added } from '@/lib/canvas/openPictures';
import { imagesFor } from '@/lib/canvas/generate';
import { hasWords } from '@/lib/canvas/pictures';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Openly licensed pictures (Wikimedia Commons, Openverse) for a lesson: lib/canvas/openPictures.ts.
// GET ?q=pizza slices → { pictures: [{ source, id, title, thumb, page, author, license }] } to pick from.
// POST { lesson, picks: [{ source, id }] } → those are copied into the lesson's library, with their credit
//      { lesson, sections: [{ title, covers }] } → pictures found for a new lesson's outline
//   → { added: [{ url, description, credit, creditUrl }], notes: [...] }
export async function GET(req: Request) {
  const limited = await rateLimit(req, 'assistant', { editorsToo: true });
  if (limited) return limited;
  const q = new URL(req.url).searchParams.get('q')?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
  if (!q) return NextResponse.json({ pictures: [] });
  try {
    const kind = new URL(req.url).searchParams.get('kind');
    return NextResponse.json({ pictures: await searchOpenPictures(q, 18, kind === 'photo' || kind === 'drawing' ? kind : undefined) });
  } catch (e) {
    return NextResponse.json({ pictures: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lesson = body?.lesson;
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const profile = await profileForLesson(lesson);
  enterProfile(profile);   // (the AI's look at each picture: this lesson's ages and topic)
  const kb = profile.knowledgeBases[0] ?? lesson;
  const about = `${profile.title}: ${profile.about}`;
  try {
    if (Array.isArray(body.picks)) {
      const added: Added[] = [];
      const notes: string[] = [];
      for (const pick of body.picks.slice(0, 6)) {
        const pic = await openPictureById(String(pick?.source ?? ''), String(pick?.id ?? ''));
        if (!pic) { notes.push('A picture couldn’t be found at its source any more.'); continue; }
        const r = await addOpenPicture(pic, kb, about);
        if ('skipped' in r) notes.push(`“${pic.title}” wasn’t added: ${r.skipped}`); else added.push(r);
      }
      return NextResponse.json({ added, notes });
    }
    // "Find a picture for this slide": the lesson's own library first (a close match that isn't on the slide yet), then the free picture sites
    if (typeof body.slideWords === 'string' && body.slideWords.trim()) {
      const words = body.slideWords.replace(/\s+/g, ' ').trim().slice(0, 1500);
      const topic = typeof body.topic === 'string' ? body.topic.slice(0, 120) : undefined;
      const exclude = new Set((Array.isArray(body.exclude) ? body.exclude : []).slice(0, 20).map(String));
      const mine = (await imagesFor(`${topic ?? ''} ${words}`.slice(0, 500), 6).catch(() => []))
        .find((i) => /^https:\/\//.test(i.url) && !exclude.has(i.url) && !hasWords(i.description ?? '') && (i.score ?? 0) >= 0.45);
      if (mine) return NextResponse.json({ added: [{ url: mine.url, description: mine.description, credit: mine.credit, creditUrl: mine.creditUrl }], notes: ['From this lesson’s own pictures.'], from: 'library' });
      const r = await findSlidePicture({ kb, about, slideWords: words, topic, deadline: Date.now() + 80_000 });
      return NextResponse.json({ added: r.added ? [r.added] : [], notes: [r.note], from: 'free' });
    }
    const sections = (Array.isArray(body.sections) ? body.sections : []).slice(0, 8)
      .map((s: any) => ({ title: String(s?.title ?? '').slice(0, 120), covers: Array.isArray(s?.covers) ? s.covers.map((c: unknown) => String(c).slice(0, 120)).slice(0, 6) : [] }))
      .filter((s: { title: string }) => s.title);
    if (!sections.length) return NextResponse.json({ error: 'Nothing to find pictures for' }, { status: 400 });
    return NextResponse.json(await findLessonPictures({ kb, about, sections, deadline: Date.now() + 85_000 }));
  } catch (e) {
    return NextResponse.json({ added: [], notes: [], error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
