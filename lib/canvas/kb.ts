/*
 * Searching the knowledge bases (server only): a lesson's source chunks and pictures, by meaning, in the knowledge
 * bases its profile lists (supabase/migrations/024_knowledge_bases.sql). Until that migration is run, the old searches
 * over everything (match_documents3, match_images2): what's there now is all the blue catfish lesson's anyway.
 */
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { currentProfile } from './lessonContext';

const supabase = lazySupabaseAdmin();

/** The knowledge bases of the lesson being worked on */
export const kbsNow = (): string[] => currentProfile().knowledgeBases;

let oldOnly = false;   // (the new searches aren't there yet: migration 024 not run)
const missingFn = (msg: string) => /match_(documents|images)_in|function .* does not exist|schema cache/i.test(msg);

async function search<T>(fn: string, old: string, args: { query_embedding: number[]; match_count: number }, kbs: string[]): Promise<T[]> {
  if (!oldOnly) {
    const { data, error } = await supabase.rpc(fn, { ...args, kbs });
    if (!error) return (data ?? []) as T[];
    if (!missingFn(error.message)) throw new Error(error.message);
    oldOnly = true;
    console.warn(`${fn} is missing: run supabase/migrations/024_knowledge_bases.sql (searching everything meanwhile)`);
  }
  // (before the migration, everything is the blue catfish lesson's: another lesson finds nothing rather than its facts)
  if (!kbs.includes('blue-catfish')) return [];
  const { data, error } = await supabase.rpc(old, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export type DocRow = { id?: number | string; content?: string; source?: string; metadata?: { source?: string }; similarity?: number };
export type ImageRow = { id?: number; url: string; description?: string; credit?: string | null; license?: string | null; similarity?: number };

/** The source chunks closest to an embedding, in the lesson's knowledge bases */
export const matchDocuments = (embedding: number[], count: number, kbs = kbsNow()): Promise<DocRow[]> =>
  search<DocRow>('match_documents_in', 'match_documents3', { query_embedding: embedding, match_count: count }, kbs);

/** The pictures closest to an embedding, in the lesson's knowledge bases and the shared ones */
export const matchImages = (embedding: number[], count: number, kbs = kbsNow()): Promise<ImageRow[]> =>
  search<ImageRow>('match_images_in', 'match_images2', { query_embedding: embedding, match_count: count }, kbs);

/** Whether rows can carry a knowledge base yet (the migration's kb column): false before it's run */
export async function kbColumns(): Promise<boolean> {
  const { error } = await supabase.from('documents3').select('kb').limit(1);
  return !error;
}
