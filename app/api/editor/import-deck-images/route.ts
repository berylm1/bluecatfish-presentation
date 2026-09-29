import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabase = lazySupabaseAdmin();
const SLIDES = Array.from({ length: 18 }, (_, i) => `slide${String(i).padStart(2, '0')}.jpg`);   // public/deck
const BUCKET = 'slide-imagesv2';

async function describe(url: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: 'Describe this presentation slide from a lesson about the blue catfish invasion of the Chesapeake Bay: its title, what the text and pictures show, and which lesson theme it belongs to. 2-4 sentences, only what is visible, in words someone would search with.' },
        { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
      ],
      max_completion_tokens: 1200,
    }),
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(data.error?.message || 'no description');
  return text;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.embedding) throw new Error(data.error?.message || 'embedding failed');
  return data.data[0].embedding;
}

// POST → adds the authored PDF deck slides (public/deck/*.jpg) to the image
// library (Supabase storage + images2), so they can be searched and dragged
// into the slide editor. Descriptions come from the variant slides written
// for them (migration 005) where there is one, otherwise the AI describes the
// image. Already-imported slides are skipped, so it's safe to run again.
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const { data: known } = await supabase.from('slide_templates').select('title, body, image_url').not('image_url', 'is', null);
  const written = new Map((known ?? []).map((r: any) => [String(r.image_url).split('/').pop(), `Authored lesson slide: ${r.title}. ${r.body}`]));

  const results: { slide: string; status: string }[] = [];
  for (let i = 0; i < SLIDES.length; i += 4) {
    await Promise.all(SLIDES.slice(i, i + 4).map(async (name) => {
      try {
        const storagePath = `deck/${name}`;
        const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
        const { data: exists } = await supabase.from('images2').select('url').eq('url', url).limit(1);
        if (exists?.length) { results.push({ slide: name, status: 'already in the library' }); return; }

        // From the deployed files, or over HTTP if they aren't bundled with the function
        let bytes: Buffer;
        try {
          bytes = await readFile(path.join(process.cwd(), 'public', 'deck', name));
        } catch {
          const file = await fetch(`${origin}/deck/${name}`);
          if (!file.ok) throw new Error(`couldn't read /deck/${name} (${file.status})`);
          bytes = Buffer.from(await file.arrayBuffer());
        }
        const { error: upErr } = await supabase.storage.from(BUCKET)
          .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const description = written.get(name) ?? await describe(url);
        const { error: insErr } = await supabase.from('images2').insert({ url, description, embedding: await embed(description) });
        if (insErr) throw new Error(`library: ${insErr.message}`);
        results.push({ slide: name, status: written.has(name) ? 'added (description from the variant slide)' : 'added (described by the AI)' });
      } catch (e) {
        results.push({ slide: name, status: `failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    }));
  }
  results.sort((a, b) => a.slide.localeCompare(b.slide));
  const added = results.filter((r) => r.status.startsWith('added')).length;
  const failed = results.filter((r) => r.status.startsWith('failed')).length;
  return NextResponse.json({ added, failed, results });
}
