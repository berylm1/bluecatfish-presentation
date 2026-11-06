import type { Deck } from './types';
import { shownWords, spokenText } from './queue';

/** The lesson's words, slide by slide (what's shown and what's said): what the professor answers from in static vs adaptive */
export function lessonText(deck: Deck, max = 14000): string {
  return deck.slides.map((s, i) => {
    const parts = s.elements.flatMap((el) => {
      const shown = shownWords(el).replace(/\s+/g, ' ').trim();
      const said = el.silent ? '' : spokenText(el).replace(/\s+/g, ' ').trim();
      return [shown, said !== shown ? said : ''].filter(Boolean);
    });
    return `Slide ${i + 1}${s.topic ? ` (${s.topic.trim()})` : ''}: ${parts.join(' / ')}`;
  }).join('\n').slice(0, max);
}
