import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const supabase = lazySupabaseAdmin();

// GET ?q=crab → the image library (url + description), best matches first.
// No q → the most recent uploads.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 200);
  try {
    if (q) {
      const emb = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: q }),
      }).then((r) => r.json());
      const embedding = emb?.data?.[0]?.embedding;
      if (!embedding) throw new Error('Could not search images (embedding failed)');
      const { data, error } = await supabase.rpc('match_images2', { query_embedding: embedding, match_count: 40 });
      if (error) throw new Error(error.message);
      return NextResponse.json({ images: (data ?? []).map((r: any) => ({ url: r.url, description: r.description ?? '' })) });
    }
    // Newest first when the table has an id column; otherwise any order
    let res = await supabase.from('images2').select('url, description').order('id', { ascending: false }).limit(80);
    if (res.error) res = await supabase.from('images2').select('url, description').limit(80);
    if (res.error) throw new Error(res.error.message);
    return NextResponse.json({ images: res.data ?? [] });
  } catch (e) {
    return NextResponse.json({ images: [], error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
