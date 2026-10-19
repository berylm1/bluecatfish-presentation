import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

/*
 * The question bank (lib/canvas/bank.ts): how close a learner's question is to each bank question,
 * by meaning (text-embedding-3-small, cosine). The page decides what's close enough to play an
 * answer slide, and which are related enough for the classmates to ask.
 *   POST { question, items: [{ id, q }] } → { scores: [{ id, score }] } (closest first)
 * Bank questions' vectors are kept per warm instance, so a lookup usually embeds only the question.
 */

export const runtime = 'nodejs';

const cache = new Map<string, number[]>();

async function embedMany(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: inputs }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Embedding failed (${res.status})`);
  const data = await res.json();
  return (data.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, 'bank');
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 120)
      .map((x: any) => ({ id: String(x?.id ?? '').slice(0, 64), q: String(x?.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) }))
      .filter((x: { id: string; q: string }) => x.id && x.q);
    if (!question || !items.length) return NextResponse.json({ error: 'question and items required' }, { status: 400 });
    if (cache.size > 2000) cache.clear();
    const missing = [...new Set<string>(items.map((x: { q: string }) => x.q).filter((q: string) => !cache.has(q)))];
    const vectors = await embedMany([question, ...missing]);
    missing.forEach((q, i) => cache.set(q, vectors[i + 1]));
    const scores = items.map((x: { id: string; q: string }) => ({ id: x.id, score: Math.round(cosine(vectors[0], cache.get(x.q)!) * 1000) / 1000 }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    return NextResponse.json({ scores });
  } catch (e) {
    console.error('bank match error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ scores: [] });
  }
}
