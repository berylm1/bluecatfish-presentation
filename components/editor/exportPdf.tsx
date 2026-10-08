'use client';

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import type { Deck, Slide, SlideElement } from '@/lib/canvas/types';
import { shownWords, speakingOrder, spokenText } from '@/lib/canvas/queue';
import { introText, startsTopic } from '@/lib/canvas/intro';

// "Download PDF" in the slide editor: the whole lesson, one slide per page.
// Each page has a picture of the slide, then everything on it in the order
// the professor goes through it, each with its script (what's said):
//   Introduction → script
//   Text 1       → script
//   Image 1      → caption, script
// jsPDF and html-to-image are loaded only when someone downloads.

const RENDER_PX = 1280;   // the slide is drawn this wide for its picture

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
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, '->').replace(/…/g, '...')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•]/g, '');

/** A picture of one slide (PNG data URL), or null if it couldn't be drawn. */
async function slidePicture(slide: Slide): Promise<string | null> {
  const { toPng } = await import('html-to-image');
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
    return await toPng(node, { pixelRatio: 1, cacheBust: true, backgroundColor: slide.background?.color ?? '#ffffff' });
  } catch (e) {
    console.warn('Slide picture failed:', e);
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportDeckPdf(deck: Deck, onProgress?: (done: number, total: number) => void): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = 40, textW = W - 2 * M;
  let y = M;
  const room = (need: number) => { if (y + need > H - M) { pdf.addPage(); y = M; } };
  const lines = (text: string, size: number, style: 'normal' | 'bold' | 'italic', color: [number, number, number], indent = 0) => {
    pdf.setFont('helvetica', style).setFontSize(size).setTextColor(...color);
    for (const line of pdf.splitTextToSize(pdfSafe(text), textW - indent) as string[]) {
      room(size * 1.3);
      pdf.text(line, M + indent, y + size);
      y += size * 1.3;
    }
  };

  for (let i = 0; i < deck.slides.length; i++) {
    onProgress?.(i, deck.slides.length);
    const slide = deck.slides[i];
    if (i > 0) pdf.addPage();
    y = M;
    lines(`Slide ${i + 1} of ${deck.slides.length}${slide.topic ? `  ·  ${slide.topic}` : ''}`, 9, 'normal', [100, 116, 139]);
    if (i === 0) lines(deck.title, 18, 'bold', [15, 23, 42]);
    y += 6;
    const pic = await slidePicture(slide);
    const picH = textW * 9 / 16;
    if (pic) {
      pdf.addImage(pic, 'PNG', M, y, textW, picH);
      pdf.setDrawColor(203, 213, 225).rect(M, y, textW, picH);
    } else {
      pdf.setDrawColor(203, 213, 225).rect(M, y, textW, picH);
      pdf.setFont('helvetica', 'italic').setFontSize(10).setTextColor(148, 163, 184).text('(the slide picture could not be drawn)', M + 12, y + 20);
    }
    y += picH + 18;
    for (const item of pdfItems(deck, i)) {
      room(40);
      lines(item.label, 11, 'bold', [8, 145, 178]);
      if (item.shown?.trim()) lines(item.shown.trim(), 10, 'normal', [30, 41, 59], 12);
      if (item.script?.trim()) {
        lines('Script:', 9, 'bold', [100, 116, 139], 12);
        lines(item.script.trim(), 10, 'italic', [51, 65, 85], 12);
      }
      y += 8;
    }
  }
  // the deck's end-of-lesson recap, on its own page
  if (deck.recap?.trim()) {
    pdf.addPage();
    y = M;
    lines('End-of-lesson recap', 14, 'bold', [15, 23, 42]);
    y += 4;
    lines('Script:', 9, 'bold', [100, 116, 139]);
    lines(deck.recap.trim(), 10, 'italic', [51, 65, 85]);
  }
  onProgress?.(deck.slides.length, deck.slides.length);
  const file = `${(deck.title || 'lesson').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'lesson'}.pdf`;
  pdf.save(file);
}
