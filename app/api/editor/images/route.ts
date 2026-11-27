import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { kbColumns, matchImages } from '@/lib/canvas/kb';
import { profileForLesson } from '@/lib/canvas/lessonProfiles';
import { isLessonId } from '@/lib/canvas/store';

export const dynamic = 'force-dynamic';
const supabase = lazySupabaseAdmin();

// GET ?q=crab → the image library (url + description), best matches first.
// No q → the most recent uploads.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get('q')?.trim().slice(0, 200);
  // (?lesson=: that lesson's knowledge bases' pictures and the shared ones, lib/canvas/kb.ts)
  const lesson = params.get('lesson') ?? '';
  const kbs = isLessonId(lesson) ? (await profileForLesson(lesson)).knowledgeBases : ['blue-catfish'];
  try {
    if (q) {
      const emb = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: q }),
      }).then((r) => r.json());
      const embedding = emb?.data?.[0]?.embedding;
      if (!embedding) throw new Error('Could not search images (embedding failed)');
      const data = await matchImages(embedding, 40, kbs);
      return NextResponse.json({ images: data.map((r) => ({ url: r.url, description: r.description ?? '', ...(r.credit ? { credit: r.credit, creditUrl: r.source_url ?? undefined } : {}) })) });
    }
    // Newest first when the table has an id column; otherwise any order
    // (by knowledge base once migration 024 is run; before it, everything is the blue catfish lesson's)
    if (await kbColumns()) {
      const res = await supabase.from('images2').select('url, description, credit, source_url').in('kb', [...kbs, 'shared']).order('id', { ascending: false }).limit(80);
      if (res.error) throw new Error(res.error.message);
      return NextResponse.json({ images: (res.data ?? []).map((r: { url: string; description: string | null; credit: string | null; source_url: string | null }) =>
        ({ url: r.url, description: r.description ?? '', ...(r.credit ? { credit: r.credit, creditUrl: r.source_url ?? undefined } : {}) })) });
    }
    if (!kbs.includes('blue-catfish')) return NextResponse.json({ images: [] });
    let res = await supabase.from('images2').select('url, description').order('id', { ascending: false }).limit(80);
    if (res.error) res = await supabase.from('images2').select('url, description').limit(80);
    if (res.error) throw new Error(res.error.message);
    return NextResponse.json({ images: res.data ?? [] });
  } catch (e) {
    return NextResponse.json({ images: [], error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
