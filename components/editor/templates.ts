import type { ActivityElement, ChartElement, DiagramElement, SlideElement } from '@/lib/canvas/types';
import { newId } from './useEditorDeck';

/*
 * Starting points for the editor's "＋ Visual" and "＋ Hands-on" menus: filled
 * in with Blue Catfish examples so they draw straight away; change the
 * words in the panel on the right. (Or "✨ Hands-on slide from this slide"
 * has the AI make one from what the slide teaches.)
 */

export const VISUAL_KINDS = [
  ['bar', 'Bar chart'], ['line', 'Line chart (over time)'], ['pie', 'Pie chart (parts of a whole)'],
  ['steps', 'Steps (arrows)'], ['cycle', 'Cycle (round a circle)'], ['timeline', 'Timeline'], ['compare', 'Compare (two columns)'], ['sizes', 'Sizes (circles)'],
] as const;

export const ACTIVITY_KINDS = [
  ['sort', 'Sort into groups'], ['order', 'Put in order'], ['cards', 'Guess & flip cards'], ['hotspots', 'Explore a picture'], ['slider', 'Slider'],
] as const;

export function visualTemplate(kind: (typeof VISUAL_KINDS)[number][0]): SlideElement {
  const box = { id: newId('el'), x: 10, y: 22, w: 80, h: 62, silent: true as const };
  if (kind === 'bar' || kind === 'line' || kind === 'pie') {
    const bars: ChartElement['bars'] = kind === 'line'
      ? [{ label: 'Year 1', value: 1 }, { label: 'Year 2', value: 3 }, { label: 'Year 3', value: 6 }, { label: 'Year 4', value: 9 }]   // example: put real numbers in
      : kind === 'pie'
        ? [{ label: 'Blue catfish', value: 75 }, { label: 'Other fish', value: 25 }]
        : [{ label: 'Blue catfish', value: 100 }, { label: 'A 12 year old', value: 90 }, { label: 'Striped bass', value: 20 }];
    return { ...box, type: 'chart', kind: kind === 'bar' ? undefined : kind, bars, unit: kind === 'bar' ? 'lbs' : kind === 'pie' ? '%' : undefined,
      alt: kind === 'line' ? 'Example numbers: replace them with real ones' : undefined };
  }
  const items: Record<string, DiagramElement['items']> = {
    steps: [{ label: 'Stocked in rivers', detail: '1970s, for fishing' }, { label: 'Spread downstream' }, { label: 'Took over the Bay' }],
    cycle: [{ label: 'Blue catfish' }, { label: 'Eat blue crabs' }, { label: 'Fewer crabs' }, { label: 'More catfish' }],
    timeline: [{ label: '1970s', detail: 'Brought to Virginia rivers' }, { label: '1990s', detail: 'Numbers climb' }, { label: 'Today', detail: 'Most of the fish in some rivers' }],
    compare: [{ label: 'Eat almost anything', detail: 'Pickier eaters' }, { label: 'Can top 100 lbs', detail: 'Usually under 20 lbs' }],
    sizes: [{ label: 'Blue catfish', value: 100 }, { label: 'You', value: 90 }, { label: 'Blue crab', value: 1 }],
  };
  return {
    ...box, type: 'diagram', kind, items: items[kind],
    columns: kind === 'compare' ? ['Blue catfish', 'Native fish'] : undefined, unit: kind === 'sizes' ? 'lbs' : undefined,
  };
}

export function activityTemplate(kind: (typeof ACTIVITY_KINDS)[number][0]): SlideElement {
  const box = { id: newId('el'), x: 6, y: 20, w: 88, h: 74 };
  const by: Record<string, Omit<ActivityElement, 'id' | 'x' | 'y' | 'w' | 'h' | 'type'>> = {
    sort: { kind: 'sort', prompt: 'Native to the Bay, or an invader?', groups: ['Native', 'Invader'],
      items: [{ text: 'Blue crab', group: 0 }, { text: 'Striped bass', group: 0 }, { text: 'Blue catfish', group: 1 }, { text: 'Flathead catfish', group: 1 }],
      say: 'Your turn! Some of these animals have always lived in the Chesapeake Bay, and some are newcomers. Drag each one into the group where you think it belongs.' },
    order: { kind: 'order', prompt: 'How did they take over? Tap in order',
      items: [{ text: 'People stocked them in rivers' }, { text: 'They ate almost everything' }, { text: 'Nothing big enough ate them' }, { text: 'They spread through the Bay' }],
      say: 'Your turn! These steps of the blue catfish story got mixed up. Tap them in the order they happened, starting with the first.' },
    cards: { kind: 'cards', prompt: 'Guess first, then tap to flip',
      items: [{ text: 'How heavy can they get?', back: 'Over 100 pounds!' }, { text: 'How long can they live?', back: '20 years or more' }, { text: 'What do they eat?', back: 'Almost anything' }],
      say: 'Your turn! Make a guess for each card first, then tap it to flip it over and see if you were right.' },
    hotspots: { kind: 'hotspots', prompt: 'Tap the spots to explore', src: '/canvas-sample/catfish.svg', alt: 'A blue catfish',
      items: [{ text: 'Whiskers', back: 'Barbels taste the water to find food', x: 8, y: 68 }, { text: 'Big mouth', back: 'Swallows crabs and fish whole', x: 14, y: 52 }, { text: 'Tail', back: 'A forked tail for strong swimming', x: 92, y: 45 }],
      say: 'Your turn! Each orange spot hides something about the blue catfish body. Tap them one by one to find out.' },
    slider: { kind: 'slider', prompt: 'Slide to watch it grow', src: '/canvas-sample/catfish.svg', alt: 'A blue catfish',
      slider: { label: 'Age', unit: 'years', min: 0, max: 20, step: 1, stops: [
        { at: 0, text: 'Smaller than your hand', scale: 0.3 }, { at: 5, text: 'As long as your arm', scale: 0.7 }, { at: 12, text: 'Heavier than a big dog', scale: 1 }, { at: 20, text: 'As heavy as a grown-up!', scale: 1.2 }] },
      say: 'Your turn! Drag the slider to make the catfish older, and watch how big it gets over the years.' },
  };
  return { ...box, type: 'activity', ...by[kind] } as ActivityElement;
}
