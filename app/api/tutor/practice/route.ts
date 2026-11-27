import { NextResponse } from 'next/server';
import { lessonOf } from '@/lib/canvas/lessonProfiles';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { rateLimit } from '@/lib/rateLimit';
import { freshQuestion, hintFor } from '@/lib/canvas/practice';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST { kind: 'hint', question, answer, tried } → { hint }        (a hint after a wrong typed answer)
// POST { kind: 'fresh', question, answer }       → { question, answer } | { none: true }   (the same sum, new numbers)
// From the lesson page's "Type the answer" boxes (components/canvas/Activity.tsx).
export async function POST(req: Request) {
  const limited = await rateLimit(req, 'practice');
  if (limited) return limited;
  enterProfile(await lessonOf(req));
  const body = await req.json().catch(() => null) ?? {};
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 400) : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 120) : '';
  if (!question || !answer) return NextResponse.json({ error: 'Bad question' }, { status: 400 });
  try {
    if (body.kind === 'hint') {
      const tried = typeof body.tried === 'string' ? body.tried.trim().slice(0, 120) : '';
      return NextResponse.json({ hint: await hintFor(question, answer, tried) });
    }
    if (body.kind === 'fresh') {
      const made = await freshQuestion(question, answer);
      return NextResponse.json(made ?? { none: true });
    }
    return NextResponse.json({ error: 'Bad kind' }, { status: 400 });
  } catch (e) {
    console.error('tutor/practice error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'That didn’t work this time.' }, { status: 500 });
  }
}
