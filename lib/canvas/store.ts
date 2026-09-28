import { getValue, setValue } from '@/src/redisClient';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import type { Deck } from './types';
import { compact } from './sanitize';
import { DEFAULT_LESSON, type LessonInfo } from './lessons';

// Where decks live (docs/customization-plan.md): read from Redis (fast),
// every hand-made deck also written to Supabase as a backup. If Redis loses
// one (evicted, wiped), it's restored from Supabase on the next read.

/** draft and live are hand-made (backed up in Supabase); ai is generated, Redis only (it can be made again). */
export type DeckKind = 'draft' | 'live' | 'ai';
export type { LessonInfo };

const supabase = lazySupabaseAdmin();
const PREFIX = 'canvas_v1';
const deckKey = (lesson: string, kind: DeckKind) => `${PREFIX}:deck:${lesson}:${kind}`;
const LESSONS_KEY = `${PREFIX}:lessons`;

export const isLessonId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(v);

function backupError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /canvas_(lessons|decks|deck_history)/.test(msg) && /exist|schema cache/i.test(msg)
    ? 'Supabase backup tables are missing: run supabase/migrations/005_canvas_decks.sql in the Supabase SQL editor.'
    : `Supabase backup failed: ${msg}`;
}

/* ---------------------------------------------------------------- lessons */

export async function listLessons(): Promise<LessonInfo[]> {
  const byId = new Map<string, LessonInfo>([[DEFAULT_LESSON.id, DEFAULT_LESSON]]);
  const cached = await getValue(LESSONS_KEY).catch(() => null);
  if (cached) for (const l of JSON.parse(cached) as LessonInfo[]) byId.set(l.id, l);
  try {
    const { data, error } = await supabase.from('canvas_lessons').select('id, title').order('created_at');
    if (error) throw new Error(error.message);
    for (const l of data ?? []) byId.set(l.id, { id: l.id, title: l.title });
  } catch (e) {
    console.warn(backupError(e));
  }
  return [...byId.values()];
}

/** Makes sure the lesson exists in both stores (the backup table needs it for its foreign key). */
export async function ensureLesson(lesson: LessonInfo, by?: string): Promise<string | null> {
  const lessons = await listLessons();
  if (!lessons.some((l) => l.id === lesson.id)) lessons.push(lesson);
  await setValue(LESSONS_KEY, JSON.stringify(lessons));
  try {
    const { error } = await supabase
      .from('canvas_lessons')
      .upsert({ id: lesson.id, title: lesson.title, updated_by: by ?? null }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return null;
  } catch (e) {
    return backupError(e);
  }
}

/** Removes a lesson with its draft and live decks (the publish history goes too). */
export async function deleteLesson(id: string): Promise<string | null> {
  const lessons = (await listLessons()).filter((l) => l.id !== id);
  await setValue(LESSONS_KEY, JSON.stringify(lessons));
  await setValue(deckKey(id, 'draft'), '');
  await setValue(deckKey(id, 'live'), '');
  await setValue(deckKey(id, 'ai'), '');
  try {
    // canvas_decks and canvas_deck_history rows go with it (on delete cascade)
    const { error } = await supabase.from('canvas_lessons').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  } catch (e) {
    return backupError(e);
  }
}

/* ------------------------------------------------------------------ decks */

export async function readDeck(lesson: string, kind: DeckKind): Promise<Deck | null> {
  const cached = await getValue(deckKey(lesson, kind)).catch(() => null);
  if (cached) return JSON.parse(cached) as Deck;
  if (kind === 'ai') return null;
  // Not in Redis: restore from the backup
  try {
    const { data, error } = await supabase
      .from('canvas_decks')
      .select('deck')
      .eq('lesson_id', lesson)
      .eq('kind', kind)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.deck) return null;
    await setValue(deckKey(lesson, kind), JSON.stringify(data.deck));
    return data.deck as Deck;
  } catch (e) {
    console.warn(backupError(e));
    return null;
  }
}

/** Saves to Redis and to the Supabase backup. Returns a warning if only Redis worked. */
export async function writeDeck(lesson: string, kind: DeckKind, deck: Deck, by: string): Promise<string | null> {
  const stored = compact({ ...deck, lessonId: lesson, updatedAt: new Date().toISOString(), updatedBy: by });
  await setValue(deckKey(lesson, kind), JSON.stringify(stored));
  if (kind === 'ai') return null;
  try {
    const { error } = await supabase
      .from('canvas_decks')
      .upsert({ lesson_id: lesson, kind, deck: stored, updated_by: by, updated_at: stored.updatedAt }, { onConflict: 'lesson_id,kind' });
    if (error) throw new Error(error.message);
    if (kind === 'live') {
      const { error: histErr } = await supabase
        .from('canvas_deck_history')
        .insert({ lesson_id: lesson, deck: stored, published_by: by });
      if (histErr) throw new Error(histErr.message);
    }
    return null;
  } catch (e) {
    return backupError(e);
  }
}

export async function deleteDeck(lesson: string, kind: DeckKind): Promise<string | null> {
  // setValue with an empty string reads back as "no deck"
  await setValue(deckKey(lesson, kind), '');
  try {
    const { error } = await supabase.from('canvas_decks').delete().eq('lesson_id', lesson).eq('kind', kind);
    if (error) throw new Error(error.message);
    return null;
  } catch (e) {
    return backupError(e);
  }
}
