'use client';

import type { StudyGroup } from './content';

/*
 * The study in the browser: who this is (the id /api/study gave them), their group and where they
 * are, kept on this browser so a refresh or a closed tab picks up where they were, and so the same
 * browser can't start over in the other group. The lesson (/presentation?study=…) reads it too.
 */
export type StudyRecord = {
  id: string;
  test: boolean;
  step: string;
  group?: StudyGroup;
  /** They let the camera on in the check (the lesson turns it on) */
  camera?: boolean;
};

const KEY = 'studyRecord';

export function readStudy(): StudyRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return r && typeof r.id === 'string' ? r : null;
  } catch {
    return null;
  }
}

export function writeStudy(r: StudyRecord | null) {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: only this tab's state */ }
}

/** The lesson in the study: the record, when the page was opened for it (?study=<its id>) */
export function studyLesson(): StudyRecord | null {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('study');
  const r = readStudy();
  return id && r && r.id === id && r.group ? r : null;
}

/** Has this browser seen the lesson before (outside the study)? A backup to what people say. */
export function seenBefore(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (k.startsWith('lessonProgress:') || k === 'learnerName' || k === 'voiceSpeed' || k === 'handsOnSounds') return true;
    }
  } catch { /* private mode */ }
  return false;
}

/** A laptop or desktop (a mouse or trackpad, a big enough screen, not a phone or tablet) */
export function isComputer(): boolean {
  if (typeof window === 'undefined') return true;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // (an iPad says it's a Mac)
  return !mobile && window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900;
}

export async function studyPost<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data as T;
      last = new Error(data?.error || `Error ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;   // (not worth trying again)
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw last instanceof Error ? last : new Error('Could not reach the server');
}
