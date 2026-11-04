import { getValue, scanKeys, setValue } from '@/src/redisClient';
import type { Deck } from './types';
import { compact } from './sanitize';
import { backupFile, backupPath } from './backup';

// Named versions: each publish is saved under a name the person gives it ("Blue Catfish,
// field trip version"), so it can be loaded again later (the editor's "Saved versions…").
// Kept in Redis (no expiry); the publish history in Supabase has a copy too (the live
// deck carries its name, `savedAs`). A name is used once, across every lesson.

const PREFIX = 'canvas_v1:saved';
const INDEX_KEY = `${PREFIX}:index`;
const versionKey = (lesson: string, slug: string) => `${PREFIX}:${lesson}:${slug}`;

export type SavedVersion = { lesson: string; slug: string; name: string; savedAt: string; by: string; slides: number };

export const MAX_NAME = 60;

/** The name as a key: lowercase letters, digits and dashes ("Field trip, v2" → "field-trip-v2"). */
export function slugOf(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NAME);
}

/** A name a person can give a version: 1–60 characters, with at least one letter or digit. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  return name && name.length <= MAX_NAME && slugOf(name) ? name : null;
}

async function index(): Promise<SavedVersion[]> {
  try {
    const raw = await getValue(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** The saved versions (of one lesson, or all), newest first. */
export async function listSaved(lesson?: string): Promise<SavedVersion[]> {
  return (await index()).filter((v) => !lesson || v.lesson === lesson).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Is the name (as a key) already used, by any lesson's saved version? */
export async function nameTaken(name: string): Promise<boolean> {
  const slug = slugOf(name);
  if (!slug) return true;
  if ((await index()).some((v) => v.slug === slug)) return true;
  // (also a version the index lost track of; a deleted one is left blank, and doesn't count)
  const keys = (await scanKeys(`${PREFIX}:*:${slug}`, 50)).filter((k) => k.endsWith(`:${slug}`) && k !== INDEX_KEY);
  for (const k of keys) if (await getValue(k).catch(() => null)) return true;
  return false;
}

/** Saves the deck under the name. Null when done, else why not (the name is taken, or not a name). */
export async function saveVersion(lesson: string, rawName: unknown, deck: Deck, by: string): Promise<string | null> {
  const name = cleanName(rawName);
  if (!name) return `Give it a name (up to ${MAX_NAME} characters)`;
  if (await nameTaken(name)) return `“${name}” is already used: pick another name`;
  const slug = slugOf(name);
  const savedAt = new Date().toISOString();
  const { checks: _editorOnly, ...kept } = deck;
  const stored = compact({ ...kept, savedAs: name, updatedAt: savedAt, updatedBy: by });
  await setValue(versionKey(lesson, slug), JSON.stringify(stored));
  // a copy in the lesson's backup folder (best effort: the version is saved either way)
  const backupWarning = await backupFile(backupPath.saved(lesson, slug), stored);
  if (backupWarning) console.warn(backupWarning);
  const list = await index();
  list.push({ lesson, slug, name, savedAt, by, slides: deck.slides.length });
  await setValue(INDEX_KEY, JSON.stringify(list.slice(-500)));
  return null;
}

export async function readSaved(lesson: string, slug: string): Promise<Deck | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const raw = await getValue(versionKey(lesson, slug)).catch(() => null);
  return raw ? (JSON.parse(raw) as Deck) : null;
}

/** Removes a saved version (its name can be used again). */
export async function deleteSaved(lesson: string, slug: string): Promise<void> {
  await setValue(versionKey(lesson, slug), '');
  await setValue(INDEX_KEY, JSON.stringify((await index()).filter((v) => !(v.lesson === lesson && v.slug === slug))));
}
