/*
 * Adding text to a knowledge base (server only): split into pieces (lib/knowledgeChunks.ts), embedded, stored with the
 * knowledge base's tag (supabase/migrations/024_knowledge_bases.sql). The "New lesson" flow's pasted material goes in
 * the new lesson's own knowledge base this way, so the professor's answers and the fact checks can use it.
 */
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { chunkBySentences } from '@/lib/knowledgeChunks';
import { openai } from './ai';
import { kbColumns } from './kb';

const supabase = lazySupabaseAdmin();

/** Adds the text to the knowledge base; returns how many pieces went in (0: nothing to add, or the migration isn't run) */
export async function addToKnowledgeBase(text: string, source: string, kb: string): Promise<{ pieces: number; note?: string }> {
  if (!(await kbColumns())) return { pieces: 0, note: 'The material wasn’t added to a knowledge base: run supabase/migrations/024_knowledge_bases.sql first (the lesson is still made from it).' };
  const chunks = chunkBySentences(text).slice(0, 400);
  if (!chunks.length) return { pieces: 0 };
  const added: number[] = [];
  try {
    for (let i = 0; i < chunks.length; i += 100) {
      const part = chunks.slice(i, i + 100);
      const res = await openai('embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: part }),
      });
      const data = await res.json().catch(() => null);
      const vectors: number[][] | undefined = data?.data?.map((d: { embedding: number[] }) => d.embedding);
      if (!res.ok || !vectors || vectors.length !== part.length) throw new Error(`Embedding failed (HTTP ${res.status})`);
      const { data: rows, error } = await supabase.from('documents3')
        .insert(part.map((content, j) => ({ content, embedding: vectors[j], source: source.slice(0, 200), kb }))).select('id');
      if (error) throw new Error(error.message);
      added.push(...((rows ?? []) as { id: number }[]).map((r) => r.id));
    }
    return { pieces: added.length };
  } catch (e) {
    if (added.length) await supabase.from('documents3').delete().in('id', added);   // (all or nothing)
    throw e;
  }
}

/** Makes the knowledge base (its row in the list); false before the migration */
export async function ensureKnowledgeBase(id: string, title: string, by: string): Promise<boolean> {
  const { error } = await supabase.from('knowledge_bases').upsert({ id, title: title.slice(0, 100), created_by: by }, { onConflict: 'id', ignoreDuplicates: true });
  return !error;
}
