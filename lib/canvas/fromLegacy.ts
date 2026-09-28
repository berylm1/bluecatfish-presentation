import type { Deck, Slide, SlideElement } from './types';

// Turns the current AI lesson (the /api/slidesv2 sections that /presentationv2
// plays) into canvas slides. Until AI decks are generated in the canvas format
// (step 5), this is the "AI deck": what the presentation plays when nothing is
// published, and what "Start from AI" copies into the editor.

type LegacyStep = Record<string, any> & { type: string };
type LegacySection = { title: string; steps: LegacyStep[]; image?: string; imageDescription?: string; recap?: string };

// One soft background per topic, so topic changes are visible
const BACKGROUNDS = ['#eaf6fb', '#fff7ed', '#f0fdf4', '#f5f3ff', '#fefce8', '#fdf2f8', '#ecfeff'];
const INK = '#0b3b5c';

// Old versions stored lists as strings, or as objects ({main, detail}, {term, definition})
function lines(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((b: any) => (typeof b === 'string' ? b : b && typeof b === 'object' ? (b.main ?? b.term ?? b.text ?? b.label ?? '') + (b.definition ? `: ${b.definition}` : '') : ''))
    .filter((b) => typeof b === 'string' && b.trim());
}
const bullets = (list: unknown): string => lines(list).map((b) => `• ${b}`).join('\n');
const firstText = (o: Record<string, any>, keys: string[]): string | undefined => {
  for (const k of keys) if (typeof o[k] === 'string' && o[k].trim()) return o[k];
  return undefined;
};
// Whatever an old step shows on screen / says out loud, from any version
const shownText = (st: Record<string, any>) =>
  bullets(st.bullets) || bullets(st.keyTerms ?? st.terms) || firstText(st, ['text', 'content', 'question', 'statement', 'context']) || '';
const spokenFrom = (st: Record<string, any>) =>
  firstText(st, ['narration', 'audio', 'explanation', 'text', 'answer', 'feedback']) ??
  (Array.isArray(st.bullets) ? st.bullets.map((b: any) => (typeof b === 'object' ? b?.audio ?? b?.detail : undefined)).filter(Boolean).join(' ') || undefined : undefined);

function stepSlide(sec: LegacySection, st: LegacyStep, si: number, i: number, j: number): Slide {
  const id = `ai-${i}-${j}`;
  const say = spokenFrom(st);
  const plain = typeof st.simple === 'string' ? st.simple : undefined;
  const title = (text: string): SlideElement => ({
    id: `${id}-title`, type: 'text', x: 5, y: 5, w: 90, h: 13, text, style: 'title', color: INK, silent: true,
  });
  const els: SlideElement[] = [];

  switch (st.type) {
    case 'overview': {
      els.push(title(sec.title));
      if (sec.image) {
        els.push({ id: `${id}-body`, type: 'text', x: 5, y: 24, w: 45, h: 62, text: shownText(st), style: 'body', color: INK, say, plain });
        els.push({ id: `${id}-img`, type: 'image', x: 54, y: 22, w: 41, h: 66, src: sec.image, alt: sec.imageDescription, fit: 'cover', silent: true });
      } else {
        els.push({ id: `${id}-body`, type: 'text', x: 10, y: 26, w: 80, h: 60, text: shownText(st), style: 'body', color: INK, say, plain });
      }
      break;
    }
    case 'numberSpotlight':
      els.push({ id: `${id}-num`, type: 'text', x: 5, y: 16, w: 50, h: 36, text: String(st.value ?? ''), style: 'bigNumber', color: '#0369a1', say, plain });
      els.push({ id: `${id}-label`, type: 'text', x: 5, y: 54, w: 50, h: 14, text: String(st.label ?? ''), style: 'body', bold: true, color: INK, silent: true });
      els.push({ id: `${id}-context`, type: 'text', x: 58, y: 20, w: 37, h: 55, text: String(st.context ?? ''), style: 'body', color: INK, silent: true });
      break;
    case 'imageFocus':
      els.push(title('Take a look'));
      if (sec.image) els.push({ id: `${id}-img`, type: 'image', x: 10, y: 20, w: 80, h: 72, src: sec.image, alt: sec.imageDescription, fit: 'contain', say, plain });
      else els.push({ id: `${id}-body`, type: 'text', x: 10, y: 26, w: 80, h: 60, text: String(st.text ?? ''), style: 'body', color: INK, say, plain });
      break;
    case 'example':
      els.push({ id: `${id}-kicker`, type: 'text', x: 5, y: 6, w: 90, h: 12, text: 'Think of it this way…', style: 'caption', color: '#475569', silent: true });
      els.push({ id: `${id}-body`, type: 'text', x: 12, y: 24, w: 76, h: 58, text: shownText(st), style: 'title', align: 'center', color: INK, say, plain });
      break;
    case 'compare':
      els.push(title(`${st.leftTitle ?? ''} vs ${st.rightTitle ?? ''}`));
      els.push({ id: `${id}-left`, type: 'text', x: 5, y: 24, w: 43, h: 64, text: `${st.leftTitle ?? ''}\n${bullets(st.left)}`, style: 'body', color: INK, say, plain });
      els.push({ id: `${id}-right`, type: 'text', x: 52, y: 24, w: 43, h: 64, text: `${st.rightTitle ?? ''}\n${bullets(st.right)}`, style: 'body', color: INK, silent: true });
      break;
    default: {
      // detail, and the switched-off types (askAloud, predictThen, checkYourself)
      els.push(title(st.heading ?? sec.title));
      const shown = shownText(st);
      els.push({ id: `${id}-body`, type: 'text', x: 8, y: 24, w: 84, h: 64, text: shown, style: 'body', color: INK, say, plain });
    }
  }
  return { id, topic: sec.title, background: { color: BACKGROUNDS[si % BACKGROUNDS.length] }, elements: els };
}

export function deckFromLegacy(sections: LegacySection[], lessonId: string, title: string): Deck {
  const slides = sections.flatMap((sec, i) => (sec.steps ?? []).map((st, j) => stepSlide(sec, st, i, i, j)));
  const recap = sections.map((s) => s.recap).filter(Boolean).join(' ');
  return { lessonId, title, slides, recap: recap || undefined, source: 'ai' };
}

/**
 * Any lesson version ever cached in Redis, as a canvas deck:
 *  - sections with steps (vPilot1 onwards), as an array or { sections }
 *  - the first format: an array of slides { title, image, bullets: [{ main, detail, audio }] }
 */
export function deckFromAnyVersion(raw: unknown, lessonId: string, title: string): Deck {
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.sections) ? (raw as any).sections : [];
  if (!list.length) throw new Error('This version has no slides in it');
  if (list.some((s) => Array.isArray(s?.steps))) {
    return deckFromLegacy(list.map((s) => ({ ...s, title: s.title ?? 'Untitled', steps: s.steps ?? [] })), lessonId, title);
  }
  // Oldest format: one slide per item, no steps
  const sections: LegacySection[] = list.map((s) => ({
    title: s.title ?? 'Untitled',
    image: typeof s.image === 'string' && s.image ? s.image : undefined,
    steps: [{ type: 'overview', bullets: s.bullets, narration: spokenFrom(s) }],
  }));
  return deckFromLegacy(sections, lessonId, title);
}

/** The AI lesson as a canvas deck (from the Redis cache; generated first if needed, which can take minutes). */
export async function loadLegacyDeck(lessonId: string, title: string): Promise<Deck> {
  const res = await fetch('/api/slidesv2', { method: 'POST' });
  const data = await res.json();
  if (data.error || !Array.isArray(data.sections)) throw new Error(data.error || 'The AI lesson could not be loaded');
  return deckFromLegacy(data.sections, lessonId, title);
}
