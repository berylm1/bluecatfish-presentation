import { NextResponse } from 'next/server';
import { isLessonId } from '@/lib/canvas/store';
import { publicProfile } from '@/lib/canvas/lessonProfiles';
import { rateLimit } from '@/lib/rateLimit';
import { teacherPicture } from '@/lib/canvas/profile';

export const dynamic = 'force-dynamic';

// Public: GET ?lesson= → the little the home page shows about a lesson before it starts (its name, its one line,
// its teacher): from the lesson's profile, not the whole deck.
export async function GET(req: Request) {
  const limited = await rateLimit(req, 'deck');
  if (limited) return limited;
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  // (a draft nobody has published, with no AI-made deck, isn't anyone's to see yet: the same answer as for no such lesson)
  const p = await publicProfile(lesson);
  if (!p) return NextResponse.json({ error: 'No such lesson' }, { status: 404 });
  return NextResponse.json(
    { lesson, title: p.title, pitch: p.pitch, about: p.about, teacher: p.teacher.name, picture: teacherPicture(p) },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
