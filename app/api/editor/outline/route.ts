import { NextResponse } from 'next/server';
import { proposeOutline } from '@/lib/canvas/outline';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// POST { topic, material?, subject?, ageMin?, ageMax?, minutes?, language?, sourceMode?, structure?, goals?, sections?,
// knowledgeBases?, avoid? } → { outline }: the AI's proposed plan for a new lesson (lib/canvas/outline.ts)
export async function POST(req: Request) {
  const limited = await rateLimit(req, 'assistant', { editorsToo: true });
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Nothing to plan' }, { status: 400 });
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.slice(0, 240)).slice(0, n) : undefined);
  try {
    const outline = await proposeOutline({
      topic: typeof body.topic === 'string' ? body.topic : '',
      material: typeof body.material === 'string' ? body.material.slice(0, 60000) : undefined,
      subject: typeof body.subject === 'string' && body.subject.trim() ? body.subject.slice(0, 60) : undefined,
      ageMin: num(body.ageMin), ageMax: num(body.ageMax), minutes: num(body.minutes),
      language: typeof body.language === 'string' && body.language.trim() ? body.language.slice(0, 40) : undefined,
      sourceMode: ['sources', 'sources-first', 'general'].includes(body.sourceMode) ? body.sourceMode : undefined,
      structure: ['sources', 'goals', 'mine'].includes(body.structure) ? body.structure : undefined,
      goals: strs(body.goals, 8), sections: strs(body.sections, 8), knowledgeBases: strs(body.knowledgeBases, 6),
      avoid: typeof body.avoid === 'string' ? body.avoid.slice(0, 600) : undefined,
    });
    return NextResponse.json({ outline });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
