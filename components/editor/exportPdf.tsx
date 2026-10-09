'use client';

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Deck, Slide, SlideElement } from '@/lib/canvas/types';
import { shownWords, speakingOrder, spokenText } from '@/lib/canvas/queue';
import { introText, startsTopic } from '@/lib/canvas/intro';
import { SOURCES } from '@/lib/sources';

// "Download PDF" in the slide editor, in two kinds:
//   - teacher script: the whole lesson, one slide per page (helpers after their slide, optional)
//   - handout: just the slide pictures, two to a page, for learners (no scripts, no answers)
// Either can end with the lesson's sources (the "View sources" list).
//
// The teacher script, one slide per page:
// Each page has a picture of the slide, then everything on it in the order
// the professor goes through it, each with its script (what's said):
//   Introduction → script
//   Text 1       → script
//   Image 1      → caption, script
// jsPDF and html-to-image are loaded only when someone downloads.

const RENDER_PX = 1280;   // the slide is drawn this wide for its picture
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';   // 1×1 transparent

type Item = { label: string; shown?: string; script?: string };

const KIND: Record<SlideElement['type'], string> = { text: 'Text', image: 'Image', chart: 'Chart', diagram: 'Diagram', activity: 'Hands-on activity' };

/** What goes under a slide's picture, in speaking order (silent titles and labels first). */
export function pdfItems(deck: Deck, i: number): Item[] {
  const slide = deck.slides[i];
  const items: Item[] = [];
  const count: Partial<Record<SlideElement['type'], number>> = {};
  const name = (e: SlideElement) => `${KIND[e.type]} ${(count[e.type] = (count[e.type] ?? 0) + 1)}`;
  if (startsTopic(deck.slides, i) && introText(slide) && !slide.intro?.off) items.push({ label: 'Topic introduction', script: introText(slide) });
  const spoken = speakingOrder(slide);
  const shown = (e: SlideElement) => e.type === 'text' ? e.text
    : e.type === 'image' ? [e.caption?.trim() && !e.captionOff ? `Caption: ${e.caption.trim()}` : '', e.alt?.trim() ? `Description: ${e.alt.trim()}` : ''].filter(Boolean).join('\n')
      : shownWords(e);
  for (const e of slide.elements) {
    if (spoken.includes(e) || (e.type === 'image' && e.silent && !e.alt && !e.caption)) continue;   // spoken ones below; skip pure decoration
    items.push({ label: `${name(e)} (not spoken)`, shown: shown(e) });
  }
  for (const e of spoken) items.push({ label: name(e), shown: e.type === 'text' && spokenText(e) === e.text.trim() ? undefined : shown(e), script: spokenText(e) });
  return items;
}

/** Helvetica in a PDF only has Western characters: swap the common others, drop the rest (emoji). */
const pdfSafe = (t: string) => t
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/→/g, '->').replace(/←/g, '<-').replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/−/g, '-')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•]/g, '');

/** A picture of one slide (JPEG data URL), or null if it couldn't be drawn. */
async function slidePicture(slide: Slide): Promise<string | null> {
  const { toJpeg } = await import('html-to-image');
  const host = document.createElement('div');
  // Off screen, but laid out (so text fitting and pictures work); no entrance animations (data-no-intro)
  host.style.cssText = `position:fixed;left:-${RENDER_PX * 2}px;top:0;width:${RENDER_PX}px;pointer-events:none;`;
  host.setAttribute('data-no-intro', '');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<SlideCanvas slide={slide} width={`${RENDER_PX}px`} />));
    // Pictures loaded and text fitted
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })));
    await new Promise((r) => setTimeout(r, 400));
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) return null;
    // JPEG: a tenth the size of PNG for photos (a 200-slide lesson stays a sensible download);
    // a picture that can't be fetched (another site that doesn't allow it) is left blank, not the whole slide
    return await toJpeg(node, { pixelRatio: 1, quality: 0.85, cacheBust: true, backgroundColor: slide.background?.color ?? '#ffffff', imagePlaceholder: BLANK });
  } catch (e) {
    console.warn('Slide picture failed:', e);
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}

export type PdfOptions = {
  kind: 'script' | 'handout';
  /** Teacher script: each slide's helper on a page after it */
  helpers: boolean;
  /** A last page with the lesson's sources */
  sources: boolean;
};
export const DEFAULT_PDF: PdfOptions = { kind: 'script', helpers: true, sources: true };

export async function exportDeckPdf(deck: Deck, opts: PdfOptions = DEFAULT_PDF, onProgress?: (done: number, total: number) => void): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = 40, textW = W - 2 * M;
  let y = M;
  let heading = '';   // the page's heading, repeated on a page its scripts run onto
  const room = (need: number) => {
    if (y + need <= H - M) return;
    pdf.addPage();
    y = M;
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139).text(pdfSafe(`${heading} (continued)`), M, y + 9);
    y += 9 * 1.3 + 6;
  };
  const lines = (text: string, size: number, style: 'normal' | 'bold' | 'italic', color: [number, number, number], indent = 0) => {
    pdf.setFont('helvetica', style).setFontSize(size).setTextColor(...color);
    for (const line of pdf.splitTextToSize(pdfSafe(text), textW - indent) as string[]) {
      room(size * 1.3);
      pdf.text(line, M + indent, y + size);
      y += size * 1.3;
    }
  };

  /** One page (or more, when the scripts run long): the slide's picture, then its parts. */
  const page = async (slide: Slide, title: string, items: Item[], first: boolean) => {
    if (!first) pdf.addPage();
    y = M;
    heading = title;
    lines(title, 9, 'normal', [100, 116, 139]);
    if (first) lines(deck.title, 18, 'bold', [15, 23, 42]);
    y += 6;
    const pic = await slidePicture(slide);
    const picH = textW * 9 / 16;
    if (pic) {
      pdf.addImage(pic, 'JPEG', M, y, textW, picH);
      pdf.setDrawColor(203, 213, 225).rect(M, y, textW, picH);
    } else {
      pdf.setDrawColor(203, 213, 225).rect(M, y, textW, picH);
      pdf.setFont('helvetica', 'italic').setFontSize(10).setTextColor(148, 163, 184).text('(the slide picture could not be drawn)', M + 12, y + 20);
    }
    y += picH + 18;
    for (const item of items) {
      room(40);
      lines(item.label, 11, 'bold', [8, 145, 178]);
      if (item.shown?.trim()) lines(item.shown.trim(), 10, 'normal', [30, 41, 59], 12);
      if (item.script?.trim()) {
        lines('Script:', 9, 'bold', [100, 116, 139], 12);
        lines(item.script.trim(), 10, 'italic', [51, 65, 85], 12);
      }
      y += 8;
    }
  };

  const total = deck.slides.length;
  const slideTitle = (i: number) => `Slide ${i + 1} of ${total}${deck.slides[i].topic ? `  ·  ${deck.slides[i].topic}` : ''}`;
  if (opts.kind === 'handout') {
    // Two slides to a page, each with its number and topic above it
    const picH = textW * 9 / 16;
    for (let i = 0; i < total; i++) {
      onProgress?.(i, total);
      if (i % 2 === 0) {
        if (i > 0) pdf.addPage();
        y = M;
        if (i === 0) { lines(deck.title, 18, 'bold', [15, 23, 42]); y += 4; }
      } else {
        y += 22;
      }
      heading = slideTitle(i);
      lines(heading, 9, 'normal', [100, 116, 139]);
      y += 3;
      const pic = await slidePicture(deck.slides[i]);
      if (pic) pdf.addImage(pic, 'JPEG', M, y, textW, picH);
      pdf.setDrawColor(203, 213, 225).rect(M, y, textW, picH);
      y += picH;
    }
  } else {
    for (let i = 0; i < total; i++) {
      onProgress?.(i, total);
      const slide = deck.slides[i];
      await page(slide, slideTitle(i), pdfItems(deck, i), i === 0);
      // Its helper (what a learner who is lost sees instead), right after it
      const helper = opts.helpers && slide.helper && !slide.helper.off && slide.helper.elements.length
        ? { id: `${slide.id}~helper`, background: slide.background, elements: slide.helper.elements } : null;
      if (helper) await page(helper, `Slide ${i + 1}  ·  helper: shown when a learner is lost`, pdfItems({ ...deck, slides: [helper] }, 0), false);
    }
  }
  // the deck's end-of-lesson recap, on its own page (a script: not in the handout)
  if (opts.kind === 'script' && deck.recap?.trim()) {
    pdf.addPage();
    y = M;
    lines('End-of-lesson recap', 14, 'bold', [15, 23, 42]);
    y += 4;
    lines('Script:', 9, 'bold', [100, 116, 139]);
    lines(deck.recap.trim(), 10, 'italic', [51, 65, 85]);
  }
  // Where the facts come from, each with its web address (clickable)
  if (opts.sources && SOURCES.length) {
    pdf.addPage();
    y = M;
    heading = 'Sources';
    lines('Sources', 14, 'bold', [15, 23, 42]);
    // (true of any lesson: AI lessons are written from this knowledge base, a hand-made one may use other material too)
    lines('Where the facts in the lesson knowledge base come from.', 10, 'normal', [100, 116, 139]);
    y += 8;
    for (const src of SOURCES) {
      room(48);
      lines(src.title, 11, 'bold', [15, 23, 42]);
      lines(src.org, 10, 'normal', [51, 65, 85]);
      pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(8, 145, 178);
      for (const line of pdf.splitTextToSize(pdfSafe(src.url), textW) as string[]) {
        room(9 * 1.3);
        pdf.text(line, M, y + 9);
        pdf.link(M, y, pdf.getTextWidth(line), 9 * 1.3, { url: src.url });
        y += 9 * 1.3;
      }
      y += 10;
    }
  }
  onProgress?.(deck.slides.length, deck.slides.length);
  const file = `${(deck.title || 'lesson').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'lesson'}${opts.kind === 'handout' ? '-handout' : ''}.pdf`;
  pdf.save(file);
}
