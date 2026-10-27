import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { readSaved } from '@/lib/canvas/saved';
import type { Deck } from '@/lib/canvas/types';
import { STUDY_LESSON } from './content';

/*
 * The lesson the study plays: one saved version (lib/canvas/saved.ts), picked on /studyResults, so editing
 * or publishing the lesson doesn't change it for people taking part. None picked: the live lesson.
 * Kept in study_settings (migration 014); each person's row records the version they saw (lesson_version).
 */
const supabase = lazySupabaseAdmin();

export type StudyVersion = { slug: string | null; name: string | null; setAt: string | null; setBy: string | null };
const NONE: StudyVersion = { slug: null, name: null, setAt: null, setBy: null };
/** What a row records when no version was picked */
export const LIVE_LABEL = 'live (not frozen)';

export async function getStudyVersion(): Promise<StudyVersion> {
  const { data, error } = await supabase.from('study_settings').select('version_slug, version_name, set_at, set_by').eq('id', 1).maybeSingle();
  if (error || !data) return NONE;   // (migration 014 not run: not frozen)
  return { slug: data.version_slug, name: data.version_name, setAt: data.set_at, setBy: data.set_by };
}

export async function setStudyVersion(slug: string | null, name: string | null, by: string): Promise<void> {
  const { error } = await supabase.from('study_settings').upsert({ id: 1, lesson_id: STUDY_LESSON, version_slug: slug, version_name: name, set_at: new Date().toISOString(), set_by: by }, { onConflict: 'id' });
  if (error) throw new Error(/study_settings/.test(error.message) ? 'Run migration 014 (supabase/migrations/014_study_version.sql) in Supabase first.' : error.message);
}

/**
 * The deck for someone in the study: the version their row recorded (they started with it), else the one picked
 * now; null = the live lesson. `version` is what to record.
 */
export async function studyDeck(participant: string | null): Promise<{ deck: Deck | null; version: string }> {
  let slug: string | null = null;
  let name: string | null = null;
  if (participant && /^[0-9a-f-]{36}$/i.test(participant)) {
    const { data } = await supabase.from('study_participants').select('lesson_version').eq('id', participant).maybeSingle();
    const recorded = data?.lesson_version as string | null | undefined;
    if (recorded && recorded !== LIVE_LABEL) {
      const [s, ...rest] = recorded.split(':');   // "slug:Name"
      slug = s; name = rest.join(':');
    } else if (recorded === LIVE_LABEL) return { deck: null, version: LIVE_LABEL };
  }
  if (!slug) ({ slug, name } = await getStudyVersion());
  if (!slug) return { deck: null, version: LIVE_LABEL };
  const deck = await readSaved(STUDY_LESSON, slug);
  return { deck: deck?.slides?.length ? deck : null, version: deck?.slides?.length ? `${slug}:${name ?? slug}` : LIVE_LABEL };
}
