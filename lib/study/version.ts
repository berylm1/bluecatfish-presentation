import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { readSaved } from '@/lib/canvas/saved';
import type { Deck } from '@/lib/canvas/types';
import { STUDY_LESSON, type StudyId } from './content';

/*
 * The lesson a study plays: one saved version (lib/canvas/saved.ts), picked on its results page, so editing
 * or publishing the lesson doesn't change it for people taking part. None picked: the live lesson.
 * Kept in study_settings (migration 014), a row per study (020: id 1 the classmates study, 2 static vs adaptive);
 * each person's row records the version they saw (lesson_version).
 */
const supabase = lazySupabaseAdmin();

export type StudyVersion = { slug: string | null; name: string | null; setAt: string | null; setBy: string | null };
const NONE: StudyVersion = { slug: null, name: null, setAt: null, setBy: null };
/** What a row records when no version was picked */
export const LIVE_LABEL = 'live (not frozen)';

export async function getStudyVersion(study: StudyId = 1): Promise<StudyVersion> {
  const { data, error } = await supabase.from('study_settings').select('lesson_id, version_slug, version_name, set_at, set_by').eq('id', study).maybeSingle();
  if (error || !data) return NONE;   // (migration 014 not run: not frozen)
  if (data.lesson_id && data.lesson_id !== STUDY_LESSON) return NONE;   // (a version of another lesson: the study's lesson changed since)
  return { slug: data.version_slug, name: data.version_name, setAt: data.set_at, setBy: data.set_by };
}

export async function setStudyVersion(slug: string | null, name: string | null, by: string, study: StudyId = 1): Promise<void> {
  const { error } = await supabase.from('study_settings').upsert({ id: study, lesson_id: STUDY_LESSON, version_slug: slug, version_name: name, set_at: new Date().toISOString(), set_by: by }, { onConflict: 'id' });
  if (error) {
    if (study === 2 && /check|constraint/i.test(error.message)) throw new Error('Run setup file 020 (supabase/migrations/020_study2_settings.sql) in Supabase first.');
    throw new Error(/study_settings/.test(error.message) ? 'Run migration 014 (supabase/migrations/014_study_version.sql) in Supabase first.' : error.message);
  }
}

/**
 * The deck for someone in a study: the version their row recorded (they started with it), else the one picked now
 * for their study (`study`, or the study their row is in); null = the live lesson. `version` is what to record.
 */
export async function studyDeck(participant: string | null, study: StudyId = 1): Promise<{ deck: Deck | null; version: string }> {
  let slug: string | null = null;
  let name: string | null = null;
  if (participant && /^[0-9a-f-]{36}$/i.test(participant)) {
    // (their row: in the classmates study's table, or study 2's)
    let recorded: string | null | undefined;
    for (const [table, n] of [['study_participants', 1], ['study2_participants', 2]] as const) {
      const { data } = await supabase.from(table).select('lesson_version').eq('id', participant).maybeSingle();
      if (data) { recorded = data.lesson_version as string | null; study = n; break; }
    }
    if (recorded && recorded !== LIVE_LABEL) {
      const [s, ...rest] = recorded.split(':');   // "slug:Name"
      slug = s; name = rest.join(':');
    } else if (recorded === LIVE_LABEL) return { deck: null, version: LIVE_LABEL };
  }
  if (!slug) ({ slug, name } = await getStudyVersion(study));
  if (!slug) return { deck: null, version: LIVE_LABEL };
  const deck = await readSaved(STUDY_LESSON, slug);
  return { deck: deck?.slides?.length ? deck : null, version: deck?.slides?.length ? `${slug}:${name ?? slug}` : LIVE_LABEL };
}
