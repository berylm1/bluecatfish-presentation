import type { Slide, SlideElement } from './types';
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
    if (el.type === 'image' && !el.silent && !el.alt?.trim()) {
      out.push({ elementId: el.id, level: 'warn', message: 'An image has no description (the professor’s words about it are written from the description)' });
    }
    if (el.type === 'activity' && !activityReady(el)) {
      out.push({ elementId: el.id, level: 'warn', message: 'The hands-on box isn’t finished, so learners won’t see it (it needs its groups, items, picture or stops)' });
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
