// Shared by the browser (the editor's "Pull from the original…") and the server (making the study's lesson): no server imports.
import type { Deck, Slide } from './types';

/*
 * The study's lesson (lib/study/content.ts STUDY_LESSON) is a copy of the original (STUDY_SOURCE). Its slides keep the
 * original's ids, so a slide changed in the original can be found and pulled across, one at a time. What's copied: the
 * slide itself (words, pictures, hands-on boxes, laser marks, its recordings). Not its helper slide, nor the lesson's
 * question bank: the study's lesson writes its own, from its slides only.
 */

/** A slide as copied into the study's lesson (no helper: the study's lesson writes its own) */
export function studySlide(s: Slide): Slide {
  const { helper: _helper, ...rest } = s;
  return structuredClone(rest);
}

/** The whole original, as the study's lesson starts: its slides and recap, none of its extras or checks */
export function studyCopy(original: Deck, lessonId: string, title: string): Deck {
  const { bank: _bank, checks: _checks, quiz: _quiz, concepts: _concepts, ...rest } = original;   // (the concept map tags the bank's questions: the study's lesson drafts its own)
  return { ...structuredClone(rest), lessonId, title, slides: original.slides.map(studySlide) };
}

/** What makes two slides "the same" here: the slide itself, without its helper */
const key = (s: Slide) => JSON.stringify(studySlide(s));

export type SlideDiff = {
  /** In both, but different in the original: its index in each */
  changed: { id: string; at: number; from: number; topic: string }[];
  /** Only in the original (new there, or deleted here): its index there, and where it would go here */
  added: { id: string; from: number; at: number; topic: string }[];
  /** Only in the study's lesson (added here, or deleted from the original): never removed by a pull */
  onlyHere: { id: string; at: number; topic: string }[];
};

export function slideDiff(original: Deck, study: Deck): SlideDiff {
  const here = new Map(study.slides.map((s, i) => [s.id, i]));
  const there = new Set(original.slides.map((s) => s.id));
  const changed: SlideDiff['changed'] = [];
  const added: SlideDiff['added'] = [];
  original.slides.forEach((s, from) => {
    const at = here.get(s.id);
    if (at === undefined) {
      // goes after the nearest slide before it that's here too (else first)
      let after = -1;
      for (let k = from - 1; k >= 0; k--) { const h = here.get(original.slides[k].id); if (h !== undefined) { after = h; break; } }
      added.push({ id: s.id, from, at: after + 1, topic: s.topic?.trim() ?? '' });
    } else if (key(s) !== key(study.slides[at])) changed.push({ id: s.id, at, from, topic: s.topic?.trim() ?? '' });
  });
  const onlyHere = study.slides.flatMap((s, at) => (there.has(s.id) ? [] : [{ id: s.id, at, topic: s.topic?.trim() ?? '' }]));
  return { changed, added, onlyHere };
}

/** The study's slides with the chosen ones pulled from the original (changed: replaced in place; added: put in) */
export function pullSlides(original: Deck, slides: Slide[], ids: Set<string>): Slide[] {
  const out = slides.map((s) => s);
  const byId = new Map(original.slides.map((s) => [s.id, s]));
  for (let i = 0; i < out.length; i++) {
    const o = byId.get(out[i].id);
    if (o && ids.has(o.id)) out[i] = studySlide(o);
  }
  // new ones, in the original's order, each after the nearest slide before it that's in the study's lesson
  original.slides.forEach((s, from) => {
    if (!ids.has(s.id) || out.some((x) => x.id === s.id)) return;
    let at = 0;
    for (let k = from - 1; k >= 0; k--) { const h = out.findIndex((x) => x.id === original.slides[k].id); if (h >= 0) { at = h + 1; break; } }
    out.splice(at, 0, studySlide(s));
  });
  return out;
}
