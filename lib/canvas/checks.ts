import type { ActivityElement, Deck, Slide, SlideElement } from './types';
import { shownWords, spokenText } from './queue';
import { answerBasis, fingerprint } from './aiFields';
import { activityReady } from './queue';

// Editor warnings that can be worked out from the slide alone. "Text doesn't
// fit" needs the rendered page, so the editor adds that one itself.

export interface Warning {
  elementId?: string;
  level: 'warn' | 'info';
  message: string;
}

export const isDecorative = (el: SlideElement) => el.type === 'image' && !!el.silent;

function overlapShare(a: SlideElement, b: SlideElement): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

const label = (el: SlideElement) =>
  el.type === 'text' ? `“${(el.text || 'empty text').slice(0, 24)}${el.text.length > 24 ? '…' : ''}”`
    : el.type === 'chart' ? 'a chart' : el.type === 'diagram' ? 'a diagram' : el.type === 'activity' ? 'the hands-on box' : 'an image';

export function slideWarnings(slide: Slide): Warning[] {
  const out: Warning[] = [];
  const els = slide.elements;

  for (const el of els) {
    if (el.x < 0 || el.y < 0 || el.x + el.w > 100.01 || el.y + el.h > 100.01) {
      out.push({ elementId: el.id, level: 'warn', message: `${label(el)} goes off the edge of the slide` });
    }
    // A picture's description is what the AI writes its spoken words, caption and laser marks from,
    // and what screen readers say for it
    if (el.type === 'image' && !el.alt?.trim()) {
      if (!el.silent) {
        out.push({ elementId: el.id, level: 'warn', message: 'A picture has no description: the AI can’t write what the professor says about it, its caption or its laser marks, and screen readers skip it' });
      } else if ((el.z ?? 1) > 0 && el.w * el.h >= 100) {
        // a quiet picture that isn't background: fine for decoration, but worth a word
        out.push({ elementId: el.id, level: 'info', message: 'A quiet picture has no description: screen readers skip it and it gets no caption (fine if it’s only decoration)' });
      }
    }
    if (el.type === 'activity' && el.src && !el.alt?.trim() && (el.kind === 'hotspots' || el.kind === 'slider')) {
      out.push({ elementId: el.id, level: 'info', message: 'The hands-on box’s picture has no description, so screen readers can’t say what it shows' });
    }
    if (el.type === 'activity' && !activityReady(el)) {
      out.push({ elementId: el.id, level: 'warn', message: 'The hands-on box isn’t finished, so learners won’t see it (it needs its groups, items, picture or stops)' });
    }
    if (el.type === 'activity' && activityReady(el)) {
      // the free format check, then what the answer check found
      for (const m of activityFormatProblems(el)) out.push({ elementId: el.id, level: 'warn', message: `Hands-on box: ${m}` });
      const ac = el.answerCheck;
      if (ac && !ac.ok && ac.from === answerBasis(el)) {
        out.push({ elementId: el.id, level: 'warn', message: `Check the answers: ${ac.notes?.join('; ') || 'the answer check had doubts'}` });
      }
    }
    if (el.type === 'text' && !el.text.trim()) {
      out.push({ elementId: el.id, level: 'warn', message: 'A text box is empty' });
    }
  }

  // Overlaps between things meant to be read; decorative images may sit behind anything
  const readable = els.filter((e) => !isDecorative(e));
  for (let i = 0; i < readable.length; i++) {
    for (let j = i + 1; j < readable.length; j++) {
      const a = readable[i], b = readable[j];
      if (a.type === 'image' && b.type === 'image') continue;   // images side by side or collaged are fine
      if (overlapShare(a, b) > 0.15) {
        out.push({ elementId: b.id, level: 'warn', message: `${label(a)} and ${label(b)} overlap` });
      }
    }
  }

  if (!els.some((e) => !e.silent)) {
    out.push({ level: 'info', message: 'Nothing on this slide speaks, so it stays up for 5 seconds' });
  }
  return out;
}

/* ------------------------------------------------- remembered checks */

/** What a slide's fact check looked at: everything it shows and says. Changes when either does. */
export const factBasis = (slide: Slide) =>
  fingerprint(slide.elements.map((e) => `${shownWords(e)}|${spokenText(e)}`).join('||'));

/** What the AI repeat check looked at: the whole lesson's shown and spoken words. */
export const lessonBasis = (deck: Deck) => fingerprint(deck.slides.map(factBasis).join('|'));

/** A fact a person marked "It's fine": per slide and claim. */
export const claimKey = (slideId: string, claim: string) => fingerprint(`${slideId}|${claim.trim().toLowerCase()}`);

/** A repeat suggestion a person skipped: per element and the words it was about. */
export const repeatKey = (slideId: string, elId: string, beforeSay: string) => fingerprint(`${slideId}|${elId}|${beforeSay}`);

/** Slides whose fact check is missing or out of date (they changed since). */
export const slidesToFactCheck = (deck: Deck) =>
  deck.slides.map((s, i) => ({ s, i })).filter(({ s }) =>
    s.elements.some((e) => !e.silent || e.type === 'text') && deck.checks?.facts?.[s.id]?.from !== factBasis(s));

/**
 * The free format check for a hands-on box (no AI): what would make it confusing or
 * impossible to do right. Empty = fine.
 */
export function activityFormatProblems(el: ActivityElement): string[] {
  const out: string[] = [];
  const items = el.items ?? [];
  const norm = (t: string) => t.trim().toLowerCase();
  const dupes = (list: string[]) => [...new Set(list.map(norm).filter((t, i, a) => t && a.indexOf(t) !== i))];
  const dItems = dupes(items.map((i) => i.text));
  if (el.kind !== 'slider' && dItems.length) out.push(`the same item twice (“${dItems[0]}”)`);
  if (el.kind !== 'slider' && items.some((i) => !i.text.trim())) out.push('an item has no text');
  switch (el.kind) {
    case 'sort': {
      const groups = el.groups ?? [];
      if (dupes(groups).length) out.push('two groups have the same name');
      if (groups.some((g) => !g.trim())) out.push('a group has no name');
      const bad = items.filter((i) => typeof i.group !== 'number' || i.group < 0 || i.group >= groups.length);
      if (bad.length) out.push(`“${bad[0].text}” isn’t in any group`);
      const empty = groups.filter((_, g) => !items.some((i) => (i.group ?? 0) === g));
      if (empty.length) out.push(`nothing belongs in “${empty[0]}”`);
      break;
    }
    case 'order':
      if (items.length < 3) out.push('an order needs at least 3 steps');
      break;
    case 'cards':
    case 'hotspots': {
      const noBack = items.filter((i) => !i.back?.trim());
      if (noBack.length) out.push(`“${noBack[0].text}” has nothing on the back`);
      if (el.kind === 'hotspots' && items.some((i) => typeof i.x !== 'number' || typeof i.y !== 'number')) out.push('a spot isn’t placed on the picture');
      break;
    }
    case 'slider': {
      const s = el.slider;
      if (!s) break;
      const ats = s.stops.map((x) => x.at);
      if (new Set(ats).size !== ats.length) out.push('two slider stops are at the same value');
      if (s.stops.some((x) => x.at < s.min || x.at > s.max)) out.push('a slider stop is outside the slider');
      if (s.stops.some((x) => !x.text.trim())) out.push('a slider stop has no text');
      break;
    }
  }
  return out;
}

/** Hands-on boxes whose answers need a person's look: flagged by the answer check, or not checked yet. */
export function answersToLookAt(deck: Deck): { flagged: number; unchecked: number } {
  let flagged = 0, unchecked = 0;
  for (const s of deck.slides) for (const e of [...s.elements, ...(s.helper?.elements ?? [])]) {
    if (e.type !== 'activity' || !activityReady(e)) continue;
    const ac = e.answerCheck;
    if (!ac || ac.from !== answerBasis(e)) unchecked++;
    else if (!ac.ok) flagged++;
  }
  return { flagged, unchecked };
}
