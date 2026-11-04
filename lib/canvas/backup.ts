import { lazySupabaseAdmin } from '@/lib/supabase/admin';

/*
 * Lesson backups as files in Supabase Storage, a folder per lesson (private: only our server reads or writes):
 *   lesson-backups/<lesson>/draft.json          the editor's working copy
 *   lesson-backups/<lesson>/live.json           what learners see
 *   lesson-backups/<lesson>/published/<when>.json   every publish
 *   lesson-backups/<lesson>/saved/<name>.json   the named saved versions
 * On top of the canvas_decks table (lib/canvas/store.ts): Redis holds the lessons; if it and the
 * database were both lost, these files can be downloaded and loaded again.
 */
const supabase = lazySupabaseAdmin();
export const BACKUP_BUCKET = 'lesson-backups';

let bucketReady: Promise<void> | null = null;
/** The bucket, made (private) the first time it's needed */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { data } = await supabase.storage.getBucket(BACKUP_BUCKET);
    if (data) return;
    const { error } = await supabase.storage.createBucket(BACKUP_BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  })().catch((e) => { bucketReady = null; throw e; });
  return bucketReady;
}

const safe = (part: string) => part.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80) || 'unnamed';

export const backupPath = {
  deck: (lesson: string, kind: 'draft' | 'live') => `${safe(lesson)}/${kind}.json`,
  published: (lesson: string, at: string) => `${safe(lesson)}/published/${safe(at.replace(/[:.]/g, '-'))}.json`,
  saved: (lesson: string, slug: string) => `${safe(lesson)}/saved/${safe(slug)}.json`,
};

/** Writes one backup file (replacing it). Null when done, else why not: a backup never stops a save. */
export async function backupFile(path: string, content: unknown): Promise<string | null> {
  try {
    await ensureBucket();
    const body = Buffer.from(JSON.stringify(content, null, 1));
    const { error } = await supabase.storage.from(BACKUP_BUCKET).upload(path, body, { upsert: true, contentType: 'application/json' });
    if (error) throw new Error(error.message);
    return null;
  } catch (e) {
    return `Backup file not written (${path}): ${e instanceof Error ? e.message : String(e)}`;
  }
}
