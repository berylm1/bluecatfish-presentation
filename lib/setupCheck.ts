import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Is everything the setup files (supabase/migrations) make in the Supabase project? Every table, the two
 * knowledge searches and the storage buckets. For /api/health and the study's checklist (/studyResults).
 */
export const SETUP_TABLES = ['documents3', 'images2', 'slide_templates', 'learner_state', 'events', 'canvas_lessons', 'canvas_decks', 'canvas_deck_history', 'study_participants', 'section_difficulty', 'study_settings'];
export const SETUP_BUCKETS = ['slide-audio', 'slide-imagesv2'];   // (lesson-backups is made by the site the first time it's needed)

export async function setupMissing(admin: SupabaseClient): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(SETUP_TABLES.map(async (t) => {
    const { error } = await admin.from(t).select('*', { count: 'exact', head: true });
    if (error) missing.push(`table ${t}`);
  }));
  // (the two searches: asked for nothing, so they change nothing)
  const zero = `[${new Array(1536).fill(0).join(',')}]`;
  await Promise.all(['match_documents3', 'match_images2'].map(async (fn) => {
    const { error } = await admin.rpc(fn, { query_embedding: zero, match_count: 1 });
    if (error) missing.push(`function ${fn}`);
  }));
  const { data: buckets } = await admin.storage.listBuckets();
  for (const b of SETUP_BUCKETS) if (!(buckets ?? []).some((x) => x.name === b)) missing.push(`bucket ${b}`);
  return missing.sort();
}
