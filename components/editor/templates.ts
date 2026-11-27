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
  ['numberline', 'Number line (math)'], ['fraction', 'Fraction bars (math)'], ['graph', 'Graph (math)'], ['worked', 'Worked example (math)'],
] as const;

export const ACTIVITY_KINDS = [
  ['sort', 'Sort into groups'], ['order', 'Put in order'], ['cards', 'Guess & flip cards'], ['hotspots', 'Explore a picture'], ['slider', 'Slider'], ['answer', 'Type the answer'],
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
    numberline: [{ label: '1/4', value: 0.25 }, { label: '3/4', value: 0.75 }],
    fraction: [{ label: '1/2' }, { label: '2/4', detail: 'the same amount' }],
    graph: [{ label: '', x: 0, value: 1 }, { label: '', x: 1, value: 3 }, { label: '', x: 2, value: 5 }, { label: '', x: 3, value: 7 }],
    worked: [{ label: '1/2 + 1/3', detail: 'the bottoms differ' }, { label: '= 3/6 + 2/6', detail: 'make them both sixths' }, { label: '= 5/6', detail: 'add the tops' }],
  };
  return {
    ...box, type: 'diagram', kind, items: kind === 'graph' ? items.graph.map((p) => ({ ...p, label: `(${p.x}, ${p.value})` })) : items[kind],
    columns: kind === 'compare' ? ['Blue catfish', 'Native fish'] : kind === 'graph' ? ['x', 'y'] : undefined, unit: kind === 'sizes' ? 'lbs' : undefined,
    ...(kind === 'numberline' ? { from: 0, to: 1, parts: 4 } : {}), ...(kind === 'graph' ? { connect: true } : {}),
    // (a worked example is talked through, one line at a time: it speaks)
    ...(kind === 'worked' ? { silent: undefined } : {}),
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
    answer: { kind: 'answer', prompt: 'Type your answer, then press Check',
      items: [{ text: 'A blue catfish can weigh over how many pounds?', back: '100 | one hundred' }, { text: 'About how many years can a blue catfish live?', back: '20 | twenty' }],
      say: 'Your turn! Type your answer in the box and press Check. Numbers are fine as digits or words.' },
  };
  return { ...box, type: 'activity', ...by[kind] } as ActivityElement;
}
