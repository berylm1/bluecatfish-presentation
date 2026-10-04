import type { Deck, Slide, SlideElement, SlideHelper } from './types';
import { spokenText } from './queue';
import { TTS_VOICE, VOICE_INSTRUCTIONS, SIMPLE_VOICE_INSTRUCTIONS } from '@/lib/voice';

// Save-time AI (step 4): what still needs writing or recording, and how the
// results are applied. Shared by the server (which does the work) and the
// editor (which shows the results), so both decide "is this still current?"
// the same way.
//
// Each AI-made field remembers a fingerprint of what it was made from:
//   sayFrom        — the shown text / image description the spoken words were written from
//   plainFrom      — the spoken words the plain version was written from
//   audioFor       — the exact words + voice the clip says
//   plainAudioFor  — same, for the plain clip
//   topicFrom      — the slide text the topic name was chosen from
// When the source changes, the AI version is out of date and is redone on the
// next save. Anything a person typed is never overwritten.

/** Short, stable fingerprint of a string (cyrb53). */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What the spoken words are written from: the box's text, or the image's description. */
export function sayBasis(el: SlideElement): string {
  return (el.type === 'text' ? el.text : el.alt ?? '').trim();
}

export function plainText(el: SlideElement): string {
  return el.plain?.trim() || '';
}

/** Fingerprint of a clip: the words plus the voice that says them. */
export function audioKey(text: string, simple: boolean): string {
  return fingerprint(`${TTS_VOICE}|${simple ? SIMPLE_VOICE_INSTRUCTIONS : VOICE_INSTRUCTIONS}|${text}`);
}

export function slideBasis(slide: Slide): string {
  return slide.elements.map((e) => sayBasis(e) || e.say || '').filter(Boolean).join(' | ');
}

/* ------------------------------------------------------ what's needed */

export const speaksAtAll = (el: SlideElement) => !el.silent;

export function needsSay(el: SlideElement): boolean {
  if (!speaksAtAll(el)) return false;
  const basis = sayBasis(el);
  if (!basis) return false;                                  // nothing to write from (image without a description)
  if (!el.say?.trim()) return true;                          // blank: the AI writes it
  return !!el.sayByAI && el.sayFrom !== fingerprint(basis);  // AI-written from text that has since changed
}

export function needsPlain(el: SlideElement): boolean {
  if (!speaksAtAll(el)) return false;
  const spoken = spokenText(el);
  if (!spoken) return false;
  if (!plainText(el)) return true;
  return !!el.plainByAI && el.plainFrom !== fingerprint(spoken);
}

export function needsAudio(el: SlideElement): boolean {
  const spoken = spokenText(el);
  return speaksAtAll(el) && !!spoken && el.audioFor !== audioKey(spoken, false);
}

export function needsPlainAudio(el: SlideElement): boolean {
  const plain = plainText(el);
  return speaksAtAll(el) && !!plain && el.plainAudioFor !== audioKey(plain, true);
}

/**
 * Does the slide need its helper drafted (or redrafted)? Yes when it has
 * none, or the AI drafted it from a version of the slide that has since
 * changed. Never when a person edited it or turned it off.
 */
export function needsHelper(slide: Slide): boolean {
  const h = slide.helper;
  if (h?.off) return false;
  if (!slide.elements.some(speaksAtAll)) return false;   // nothing taught here (a title card): no helper
  if (!h || !h.elements.length) return true;
  return !!h.byAI && h.from !== fingerprint(slideBasis(slide));
}

/** The helper's elements (empty when there's none). */
export const helperElements = (slide: Slide): SlideElement[] => slide.helper?.elements ?? [];

export function needsTopic(slide: Slide): boolean {
  if (!slide.topic?.trim()) return true;
  return !!slide.topicByAI && slide.topicFrom !== fingerprint(slideBasis(slide));
}

export interface Todo {
  helpers: number;
  topics: number;
  say: number;
  plain: number;
  audio: number;
}

export function countTodo(deck: Deck): Todo {
  const t: Todo = { helpers: 0, topics: 0, say: 0, plain: 0, audio: 0 };
  for (const s of deck.slides) {
    if (needsTopic(s)) t.topics++;
    if (needsHelper(s)) t.helpers++;
    for (const e of s.elements) {
      if (needsSay(e)) t.say++;
      if (needsPlain(e)) t.plain++;
      if (needsAudio(e)) t.audio++;
      if (needsPlainAudio(e)) t.audio++;
    }
    // Helper elements speak too (no plain version: the helper IS the simpler way)
    for (const e of helperElements(s)) {
      if (needsSay(e)) t.say++;
      if (needsAudio(e)) t.audio++;
    }
  }
  return t;
}

export const todoTotal = (t: Todo) => t.helpers + t.topics + t.say + t.plain + t.audio;

/* -------------------------------------------------------- applying */

/** Element patches can be for the slide's elements or (helper: true) its helper's. */
type At = { slideId: string; elId: string; helper?: boolean };
export type Patch =
  | { slideId: string; kind: 'topic'; topic: string; topicFrom: string }
  | { slideId: string; kind: 'helper'; helper: SlideHelper }
  | (At & { kind: 'say'; say: string; sayFrom: string })
  | (At & { kind: 'plain'; plain: string; plainFrom: string })
  | (At & { kind: 'audio'; audioUrl: string; audioFor: string })
  | (At & { kind: 'plainAudio'; plainAudioUrl: string; plainAudioFor: string });

/**
 * Applies AI results to a deck, but only where they still fit: the source is
 * unchanged and the field is still blank or AI-owned. Safe to run on a deck
 * that was edited while the AI was working. Returns how many were applied.
 */
export function applyPatches(deck: Deck, patches: Patch[]): number {
  let applied = 0;
  for (const p of patches) {
    const slide = deck.slides.find((s) => s.id === p.slideId);
    if (!slide) continue;
    if (p.kind === 'topic') {
      if ((!slide.topic?.trim() || slide.topicByAI) && fingerprint(slideBasis(slide)) === p.topicFrom) {
        Object.assign(slide, { topic: p.topic, topicByAI: true, topicFrom: p.topicFrom });
        applied++;
      }
      continue;
    }
    if (p.kind === 'helper') {
      // Only into an empty or AI-drafted helper, and only if the slide is still what it was drafted from
      const h = slide.helper;
      if (!h?.off && (!h || !h.elements.length || h.byAI) && fingerprint(slideBasis(slide)) === p.helper.from) {
        slide.helper = structuredClone(p.helper);
        applied++;
      }
      continue;
    }
    const el = (p.helper ? helperElements(slide) : slide.elements).find((e) => e.id === p.elId);
    if (!el) continue;
    switch (p.kind) {
      case 'say':
        if ((!el.say?.trim() || el.sayByAI) && fingerprint(sayBasis(el)) === p.sayFrom) {
          Object.assign(el, { say: p.say, sayByAI: true, sayFrom: p.sayFrom });
          applied++;
        }
        break;
      case 'plain':
        if ((!plainText(el) || el.plainByAI) && fingerprint(spokenText(el)) === p.plainFrom) {
          Object.assign(el, { plain: p.plain, plainByAI: true, plainFrom: p.plainFrom });
          applied++;
        }
        break;
      case 'audio':
        if (audioKey(spokenText(el), false) === p.audioFor) {
          Object.assign(el, { audioUrl: p.audioUrl, audioFor: p.audioFor });
          applied++;
        }
        break;
      case 'plainAudio':
        if (audioKey(plainText(el), true) === p.plainAudioFor) {
          Object.assign(el, { plainAudioUrl: p.plainAudioUrl, plainAudioFor: p.plainAudioFor });
          applied++;
        }
        break;
    }
  }
  return applied;
}

/** A clip may only be played if it says exactly the current words. */
export function currentAudio(el: SlideElement, mode: 'normal' | 'plain'): string | undefined {
  if (mode === 'plain') {
    const plain = plainText(el);
    return plain && el.plainAudioUrl && el.plainAudioFor === audioKey(plain, true) ? el.plainAudioUrl : undefined;
  }
  const spoken = spokenText(el);
  return spoken && el.audioUrl && el.audioFor === audioKey(spoken, false) ? el.audioUrl : undefined;
}
