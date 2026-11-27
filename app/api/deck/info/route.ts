import { NextResponse } from 'next/server';
import { isLessonId } from '@/lib/canvas/store';
import { profileForLesson } from '@/lib/canvas/lessonProfiles';
import { teacherPicture } from '@/lib/canvas/profile';

export const dynamic = 'force-dynamic';

// Public: GET ?lesson= → the little the home page shows about a lesson before it starts (its name, its one line,
// its teacher): from the lesson's profile, not the whole deck.
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const p = await profileForLesson(lesson);
  return NextResponse.json(
    { lesson, title: p.title, pitch: p.pitch, about: p.about, teacher: p.teacher.name, picture: teacherPicture(p) },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
