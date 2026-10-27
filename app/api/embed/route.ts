export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { requireIngestAdmin } from '@/lib/requireAdmin';
import mammoth from 'mammoth';
import extract from 'pdf-extraction';
import { chunkBySentences } from '@/lib/knowledgeChunks';

const supabase = lazySupabaseAdmin('NEXT_PUBLIC_SUPABASE_URL');   // created on first use, so the build doesn't need env vars

/** Embeddings for many pieces at once (OpenAI takes a list: one request per 100, was one per piece) */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts.slice(i, i + 100) }),
    });
    const data = await response.json().catch(() => null);
    const got: number[][] | undefined = data?.data?.map((d: { embedding: number[] }) => d.embedding);
    if (!response.ok || !got || got.length !== texts.slice(i, i + 100).length) throw new Error(`Embedding failed (HTTP ${response.status})`);
    out.push(...got);
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    // Corpus write path — restricted to ingest admins.
    const gate = await requireIngestAdmin(request);
    if (gate) return gate;

    console.log("🔥 API START");
    const body = await request.json()
    console.log("BODY RECEIVED");

    const textInput = body.text;
    const fileBase64 = body.file;
    const fileType = body.fileType;
    const fileName = body.fileName;

    let text: string = textInput ?? '';

    if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');

      if (fileType === 'pdf') {
        const data = await extract(buffer);
        text = data.text;
      }

      else if (fileType === 'docx') {
        const result: any = await mammoth.extractRawText({ buffer });
        text = result.value;
      }

      else if (fileType === 'txt') {
        text = buffer.toString('utf-8');
      }
    }

    if (!text) {
      return NextResponse.json(
        { error: 'No text or file provided' },
        { status: 400 }
      );
    }

    // whole sentences, about 300 characters each, led by their section's heading (lib/knowledgeChunks.ts)
    const chunks = chunkBySentences(text);
    if (!chunks.length) return NextResponse.json({ error: 'No text found in it' }, { status: 400 });
    const embeddings = await getEmbeddings(chunks);
    const source = String(fileName || 'manual-input').slice(0, 200);
    // The same file uploaded again: its new pieces replace its old ones (was: both kept, so every fact twice).
    // Only once every piece has its embedding, so a failed upload leaves the old pieces as they were.
    if (fileName) {
      const { error: delError } = await supabase.from('documents3').delete().eq('source', source);
      if (delError) throw delError;
    }
    const { error } = await supabase.from('documents3').insert(chunks.map((content, i) => ({ content, embedding: embeddings[i], source })));
    if (error) {
      console.error('SUPABASE INSERT FAILED:', error);
      throw error;
    }
    const results = chunks;
  return NextResponse.json({ 
    success: true, 
    chunks: results.length 
  });
  } catch (error) {
    console.error("FULL EMBED ERROR:", JSON.stringify(error, null, 2));
    console.error("TYPE:", typeof error);
    console.error("STACK:", (error as any)?.stack);
    
    return NextResponse.json(
      { error: 'Failed to embed' }, 
      { status: 500 }
    );
  }
}
