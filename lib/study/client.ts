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

/* ---------------------------------------------------- loading the lesson ahead */
// While people do the checks, the questions about them and quiz 1, the lesson gets ready in the
// background: the deck (kept for this tab: the lesson opens in it), the first clips, and, with the
// camera allowed, the camera's face and hand models. The lesson then starts at once.

const deckKey = (lesson: string) => `studyDeck:${lesson}`;
const DECK_FRESH_MS = 3 * 3600_000;
let deckLoading = false;
let cameraLoading = false;

export function preloadLesson(lesson: string) {
  if (deckLoading) return;
  try { if (preloadedDeck(lesson)) return; } catch { /* fine */ }
  deckLoading = true;
  fetch(`/api/deck?lesson=${encodeURIComponent(lesson)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const deck = d?.deck;
      if (!deck?.slides?.length) return;
      try { sessionStorage.setItem(deckKey(lesson), JSON.stringify({ at: Date.now(), deck })); } catch { /* too big or private mode: the lesson loads it itself */ }
      // the first slide's clips, into the browser's cache
      const first = deck.slides[0];
      const urls = [first?.intro?.audioUrl, ...(first?.elements ?? []).map((e: { audioUrl?: string }) => e.audioUrl)].filter(Boolean).slice(0, 5);
      for (const u of urls) fetch(u).catch(() => {});
    })
    .catch(() => {})
    .finally(() => { deckLoading = false; });
}

/** The deck loaded ahead (this tab, the last few hours), or null */
export function preloadedDeck(lesson: string): any | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(deckKey(lesson)) ?? 'null');
    return d && Date.now() - d.at < DECK_FRESH_MS && d.deck?.slides?.length ? d.deck : null;
  } catch {
    return null;
  }
}

export function forgetPreloaded(lesson: string) {
  try { sessionStorage.removeItem(deckKey(lesson)); } catch { /* fine */ }
}

/** The camera's files (the same addresses the lesson's camera hooks load), into the browser's cache */
export function preloadCamera() {
  if (cameraLoading) return;
  cameraLoading = true;
  const wasm = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
  for (const u of [
    `${wasm}/vision_wasm_internal.js`, `${wasm}/vision_wasm_internal.wasm`,
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  ]) fetch(u).catch(() => {});
}
