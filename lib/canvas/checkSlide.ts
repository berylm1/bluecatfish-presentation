import type { Slide, SlideElement } from './types';
import { shownWords, spokenText } from './queue';
import { chat, knowledgeExcerpts, type Excerpt } from './ai';

// "Check this slide" in the editor: the slide's facts (what it shows and what
// the professor says) checked against the knowledge base, each with where it
// came from. Nothing is changed; the person decides what to do.

export type ClaimVerdict = 'supported' | 'unsupported' | 'contradicted';

export interface CheckedClaim {
  /** The fact, in a few words */
  claim: string;
  verdict: ClaimVerdict;
  /** The element it's in (to jump to it), when known */
  elId?: string;
  /** Where it's backed up (or contradicted): file names from the knowledge base, with a short quote */
  sources: { source: string; quote: string }[];
  /** For a contradicted fact: what the sources say instead */
  fix?: string;
}

const MAX_ELEMENTS = 8;      // searched one by one (each its own excerpts)
const PER_ELEMENT = 4;
const MAX_EXCERPTS = 16;

/** The words on a slide worth checking: each element's shown and spoken words (hands-on boxes too: their answers are facts). */
function slideWords(slide: Slide): { el: SlideElement; words: string }[] {
  return slide.elements.flatMap((el) => {
    const shown = shownWords(el).trim();
    const said = spokenText(el);
    const words = [shown, said && said !== shown ? said : ''].filter(Boolean).join(' / ');
    return words.length >= 8 ? [{ el, words }] : [];
  }).slice(0, MAX_ELEMENTS);
}

export async function checkSlide(slide: Slide, lessonTitle: string): Promise<{ claims: CheckedClaim[]; excerpts: number }> {
  const parts = slideWords(slide);
  if (!parts.length) return { claims: [], excerpts: 0 };
  // Excerpts for each part, without repeats
  const found = await Promise.all(parts.map((p) => knowledgeExcerpts(`${slide.topic ?? ''} ${p.words}`, PER_ELEMENT)));
  const excerpts: Excerpt[] = [];
  const seen = new Set<string>();
  for (const e of found.flat()) {
    if (seen.has(e.content) || excerpts.length >= MAX_EXCERPTS) continue;
    seen.add(e.content);
    excerpts.push(e);
  }
  const ids = new Map(parts.map((p, i) => [`E${i + 1}`, p.el.id]));
  const out = await chat(
    'You fact-check one slide of a lesson for 10-14 year olds against excerpts from the lesson\'s knowledge base. ' +
      'List each distinct FACT the slide states or the professor says (numbers, dates, names, causes, comparisons); skip opinions, jokes and instructions. ' +
      'For each: "supported" if an excerpt says it (the same fact in other words counts; a rounded number like "100+ pounds" for "over 100 pounds" counts); ' +
      '"contradicted" if an excerpt says something different; "unsupported" if no excerpt covers it. ' +
      'Give the excerpt numbers it rests on and a short exact quote (under 20 words) from one of them. For a contradicted fact, "fix" = what the excerpts say instead, in one plain sentence. ' +
      'Judge only from the excerpts, never from what you know. ' +
      'Reply as JSON: {"claims":[{"claim":"short fact","element":"E1","verdict":"supported|unsupported|contradicted","excerpts":[2],"quote":"...","fix":"..."}]}',
    `Lesson: ${lessonTitle}\nTopic: ${slide.topic ?? ''}\n\nTHE SLIDE (E = element):\n${parts.map((p, i) => `E${i + 1}: ${p.words}`).join('\n')}\n\n` +
      `KNOWLEDGE BASE EXCERPTS:\n${excerpts.map((e, i) => `[${i + 1}] ${e.content}`).join('\n') || '(none found)'}`,
    true,
    4000,
  );
  const raw = JSON.parse(out).claims;
  const claims: CheckedClaim[] = (Array.isArray(raw) ? raw : []).slice(0, 20).flatMap((c: any) => {
    const verdict: ClaimVerdict = c?.verdict === 'supported' || c?.verdict === 'contradicted' ? c.verdict : 'unsupported';
    const claim = typeof c?.claim === 'string' ? c.claim.trim().slice(0, 200) : '';
    if (!claim) return [];
    const nums = (Array.isArray(c.excerpts) ? c.excerpts : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= excerpts.length);
    const quote = typeof c.quote === 'string' ? c.quote.trim().slice(0, 200) : '';
    // one entry per file the fact rests on (the quote goes with the first)
    const files = [...new Set(nums.map((n: number) => excerpts[n - 1].source))] as string[];
    return [{
      claim, verdict, elId: ids.get(String(c.element)),
      sources: verdict === 'unsupported' ? [] : files.map((source, i) => ({ source, quote: i === 0 ? quote : '' })),
      fix: verdict === 'contradicted' && typeof c.fix === 'string' ? c.fix.trim().slice(0, 300) : undefined,
    }];
  });
  // the problems first
  const rank = { contradicted: 0, unsupported: 1, supported: 2 };
  claims.sort((a, b) => rank[a.verdict] - rank[b.verdict]);
  return { claims, excerpts: excerpts.length };
}
