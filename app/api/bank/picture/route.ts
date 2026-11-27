import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { imagesFor } from '@/lib/canvas/generate';
import { hasWords } from '@/lib/canvas/pictures';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { lessonOf } from '@/lib/canvas/lessonProfiles';

// How close a picture's description must be to the question (1 = the same meaning): as for the knowledge base's
// pieces in the professor's answers (app/api/conversational/respond)
const MIN_MATCH = 0.2;

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
  // (the asking lesson's own pictures. Was: no lesson, so always the blue catfish library's: a fractions question got a
  // photo of fish frying in a pan, seen in a test run)
  enterProfile(await lessonOf(req));
  const found = await imagesFor(question, 8);
  // (just a visual: no picture with words in it, like a slide or a poster; and one that has something to do with the
  // question: the closest picture in a small library can be about anything)
  const pick = found.find((i) => typeof i.url === 'string' && /^https:\/\//.test(i.url) && !exclude.has(i.url) && !hasWords(i.description ?? '') && (i.score === undefined || i.score >= MIN_MATCH));
  return NextResponse.json({ picture: pick ? { url: pick.url, description: (pick.description ?? '').slice(0, 300), ...(pick.credit ? { credit: pick.credit, creditUrl: pick.creditUrl } : {}) } : null });
}
