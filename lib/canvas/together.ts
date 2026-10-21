import type { ImageElement, Slide, SlideElement, TextElement } from './types';
import { fitStatus } from './fitEstimate';

/*
 * One slide that answers several questions at once: the learner's and the classmates' (the
 * question bank, app/presentation/page.tsx). Laid out here, at once, with no AI: each question gets
 * an area with who asked it, a picture (or chart or diagram) and the short points from its answer
 * slide. The learner's question when the bank has no answer: a library picture and the professor's
 * live answer written in as it comes (setAreaText).
 */

export type TogetherEntry = {
  /** Who asked ("Sam", "Maya") */
  who: string;
  q: string;
  /** Its answer slide (the bank), or null (the learner's question, answered live) */
  from: Slide | null;
  /** A picture for it (the learner's live-answered question) */
  picture?: { url: string; description: string } | null;
};

export const TOGETHER_ID = 'together';
const INK = '#0f172a';

/** Element ids of area i (the text is what's lit while its answer is said, else the picture) */
export const areaIds = (i: number) => ({ label: `tg${i}-label`, media: `tg${i}-media`, text: `tg${i}-text` });

/** The answer slide's points (its shown text, not the title), and its picture or visual */
function pieces(s: Slide | null) {
  if (!s) return { points: '', media: null as SlideElement | null };
  const texts = s.elements.filter((e): e is TextElement => e.type === 'text' && e.style !== 'title' && !!e.text.trim());
  const points = texts.map((t) => t.text.trim()).join('\n');
  const media = s.elements.find((e) => e.type === 'image' && (e.z ?? 1) > 0) ?? s.elements.find((e) => e.type === 'chart' || e.type === 'diagram') ?? null;
  return { points, media };
}

/** Text that fits its box: smaller first, then fewer lines, then cut short */
function fitText(el: TextElement, maxLines: number): TextElement {
  let lines = el.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, maxLines);
  const out = { ...el, text: lines.join('\n') };
  if (fitStatus(out) !== 'overflows') return out;
  if (out.style === 'body') { out.style = 'caption'; if (fitStatus(out) !== 'overflows') return out; }
  while (lines.length > 1 && fitStatus(out) === 'overflows') { lines = lines.slice(0, -1); out.text = lines.join('\n'); }
  while (fitStatus(out) === 'overflows' && out.text.length > 20) out.text = `${out.text.slice(0, Math.floor(out.text.length * 0.8)).replace(/\s+\S*$/, '')}…`;
  return out;
}

export function togetherSlide(entries: TogetherEntry[], title = entries.length > 1 ? 'Your questions' : ''): Slide {
  const n = Math.min(4, Math.max(1, entries.length));
  const cols = n === 4 ? 2 : n;
  const rows = n === 4 ? 2 : 1;
  const top = 19, left = 4, width = 92, height = 77, gap = 3;
  const aw = (width - gap * (cols - 1)) / cols;
  const ah = (height - gap * (rows - 1)) / rows;
  const small = n >= 3;
  const elements: SlideElement[] = [{
    id: 'tg-title', type: 'text', text: title || entries[0]?.q || 'Your question', style: 'title', x: 5, y: 3, w: 90, h: 13, color: INK, bold: true, silent: true,
  } as TextElement];
  entries.slice(0, n).forEach((e, i) => {
    const ax = left + (i % cols) * (aw + gap);
    const ay = top + Math.floor(i / cols) * (ah + gap);
    const ids = areaIds(i);
    const labelH = n === 1 ? 0 : small ? 10 : 9;
    if (labelH) {
      elements.push(fitText({ id: ids.label, type: 'text', text: `${e.who}: ${e.q}`, style: 'caption', x: ax, y: ay, w: aw, h: labelH, color: '#475569', bold: true, silent: true } as TextElement, 2));
    }
    const { points, media: fromMedia } = pieces(e.from);
    const media: SlideElement | null = fromMedia ?? (e.picture ? { id: '', type: 'image', src: e.picture.url, alt: e.picture.description, x: 0, y: 0, w: 1, h: 1, fit: 'contain' } as ImageElement : null);
    const cy = ay + labelH + (labelH ? 1 : 0);
    const ch = ah - labelH - (labelH ? 1 : 0);
    // (the learner's live answer: room for its words, written in as they come)
    const text = e.from ? points : '…';
    const side = !small && aw >= 40 && !!media;   // wide area: picture left, points right; narrow: picture above
    const box = (x: number, y: number, w: number, h: number) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
    if (media) {
      const m = side ? box(ax, cy, aw * 0.48, ch) : box(ax, cy, aw, text ? ch * 0.55 : ch);
      const { say: _s, plain: _p, audioUrl: _a, plainAudioUrl: _pa, pointers: _ptr, queue: _q, caption: _c, ...rest } = media as SlideElement & { caption?: string };
      elements.push({ ...rest, id: ids.media, ...m, z: 1, silent: true, ...(media.type === 'image' ? { fit: 'contain' } : {}) } as SlideElement);
    }
    if (text) {
      const t = media ? (side ? box(ax + aw * 0.52, cy, aw * 0.48, ch) : box(ax, cy + ch * 0.58, aw, ch * 0.42)) : box(ax, cy, aw, ch);
      elements.push(fitText({ id: ids.text, type: 'text', text, style: small ? 'caption' : 'body', ...t, color: INK, silent: true } as TextElement, small ? 3 : 4));
    }
  });
  return { id: TOGETHER_ID, background: { color: '#f8fafc' }, elements };
}

/** Area i's words, written in (the learner's live answer as it comes): kept to what fits */
export function setAreaText(slide: Slide, i: number, text: string): Slide {
  const id = areaIds(i).text;
  return {
    ...slide,
    elements: slide.elements.map((e) => (e.id === id && e.type === 'text' ? fitText({ ...e, text: text.trim() || '…', style: e.h > 30 && e.w > 40 ? 'body' : e.style }, 4) : e)),
  };
}

/** The first sentence or two of an answer (for its area on the slide) */
export function answerGist(answer: string): string {
  const sentences = answer.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+/g) ?? [];
  let out = '';
  for (const s of sentences) { if ((out + s).length > 170) break; out += s; }
  return (out || sentences[0] || answer.slice(0, 170)).trim();
}
