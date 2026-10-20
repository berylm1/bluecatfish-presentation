import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { imagesFor } from '@/lib/canvas/generate';

/*
 * A picture from the image library for a learner's question the question bank doesn't answer (its area
 * on the combined answer slide, lib/canvas/together.ts). One embedding and one search: well under a
 * second. Pictures already on the slide are left out.
 *   POST { question, exclude?: string[] } → { picture: { url, description } | null }
 */

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, 'bank');
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const exclude = new Set((Array.isArray(body.exclude) ? body.exclude : []).slice(0, 20).map(String));
  if (!question) return NextResponse.json({ picture: null });
  const found = await imagesFor(question, 4);
  const pick = found.find((i) => typeof i.url === 'string' && /^https:\/\//.test(i.url) && !exclude.has(i.url));
  return NextResponse.json({ picture: pick ? { url: pick.url, description: (pick.description ?? '').slice(0, 300) } : null });
}
