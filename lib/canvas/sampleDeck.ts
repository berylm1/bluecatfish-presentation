import type { Deck } from './types';

// A small hand-made deck for trying the canvas page before the editor exists.
// Shows the main layouts: an image surrounded by text, several images, a big
// number with queue numbers that differ from reading order, text + image.
export const SAMPLE_DECK: Deck = {
  lessonId: 'sample',
  title: 'Blue Catfish (sample deck)',
  source: 'hand',
  slides: [
    {
      id: 's1',
      topic: 'Meet the Blue Catfish',
      background: { color: '#eaf6fb' },
      elements: [
        { id: 's1-title', type: 'text', x: 20, y: 4, w: 60, h: 13, text: 'Meet the Blue Catfish', style: 'title', align: 'center', color: '#0b3b5c', silent: true },
        { id: 's1-fish', type: 'image', x: 30, y: 30, w: 40, h: 40, src: '/canvas-sample/catfish.svg', alt: 'A blue catfish with long whiskers', fit: 'contain',
          say: "Say hello to the blue catfish. Those long whiskers are called barbels, and they're covered in taste buds, so this fish can basically taste the water around it. Not the most glamorous superpower, but it works.",
          plain: 'This is a blue catfish. The long whiskers help it taste and find food.',
          // laser-pointer marks: % of the picture itself
          pointers: [{ word: 'long whiskers', x: 6, y: 64 }, { word: 'taste buds', x: 9, y: 76 }] },
        { id: 's1-weight', type: 'text', x: 3, y: 30, w: 25, h: 20, text: 'Can weigh over 100 pounds', style: 'body', bold: true, color: '#0b3b5c',
          say: "First, the size. A big blue catfish can weigh more than a hundred pounds. That's heavier than most of the kids in your class. Imagine trying to reel that in.",
          plain: 'Blue catfish can get really heavy, more than 100 pounds.' },
        { id: 's1-life', type: 'text', x: 72, y: 30, w: 25, h: 20, text: 'Can live 20+ years', style: 'body', bold: true, color: '#0b3b5c', align: 'right',
          say: "They also stick around. A blue catfish can live for twenty years or more, which means a lot of years of eating and a lot of years of making more catfish.",
          plain: 'Blue catfish live a long time, often more than 20 years.' },
        { id: 's1-eats', type: 'text', x: 25, y: 74, w: 50, h: 12, text: 'Eats almost anything', style: 'body', align: 'center', color: '#0b3b5c',
          say: "And they are not picky eaters. Fish, crabs, clams, plants, you name it. If it fits in their mouth, it's on the menu.",
          plain: 'Blue catfish eat almost any food they can find.' },
        { id: 's1-waves', type: 'image', x: 0, y: 86, w: 100, h: 14, src: '/canvas-sample/waves.svg', fit: 'cover', silent: true, z: 0 },
      ],
      // What the slide morphs into when a learner is lost: same ids morph from
      // the slide's elements (title, fish, weight, waves); h-ids fade in
      helper: {
        elements: [
          { id: 's1-title', type: 'text', x: 5, y: 4, w: 90, h: 13, text: 'A fish as heavy as a grown-up', style: 'title', align: 'center', color: '#0b3b5c', silent: true },
          { id: 's1-fish', type: 'image', x: 4, y: 22, w: 52, h: 56, src: '/canvas-sample/catfish.svg', alt: 'A blue catfish with long whiskers', fit: 'contain',
            say: "Here's a way to picture it. The biggest blue catfish weigh about as much as a grown-up person. So if you ever see one in the bay, that's not a fish you carry home in a bucket." },
          { id: 's1-weight', type: 'text', x: 60, y: 26, w: 36, h: 18, text: '100+ pounds', style: 'bigNumber', align: 'center', color: '#0b3b5c', silent: true },
          { id: 's1-h1', type: 'text', x: 60, y: 48, w: 36, h: 26, text: '≈ a grown-up\n≈ 20 bowling balls', style: 'body', bold: true, align: 'center', color: '#0b3b5c',
            say: "Or think bowling balls: a really big blue catfish weighs about as much as twenty of them. Twenty! Good luck reeling that in." },
          { id: 's1-waves', type: 'image', x: 0, y: 86, w: 100, h: 14, src: '/canvas-sample/waves.svg', fit: 'cover', silent: true, z: 0 },
        ],
      },
    },
    {
      id: 's2',
      topic: 'Meet the Blue Catfish',
      background: { color: '#ffffff' },
      elements: [
        { id: 's2-title', type: 'text', x: 5, y: 5, w: 90, h: 12, text: 'They keep growing', style: 'title', color: '#0b3b5c', silent: true },
        { id: 's2-a', type: 'image', x: 5, y: 45, w: 18, h: 20, src: '/canvas-sample/catfish.svg', alt: 'A small young catfish', fit: 'contain',
          say: 'A young blue catfish starts out small, about the size of your hand.',
          plain: 'Baby blue catfish are small.' },
        { id: 's2-b', type: 'image', x: 28, y: 35, w: 28, h: 32, src: '/canvas-sample/catfish.svg', alt: 'A medium catfish', fit: 'contain',
          say: 'Give it a few years of eating everything in sight, and it gets a lot bigger.',
          plain: 'After a few years they are much bigger.' },
        { id: 's2-c', type: 'image', x: 60, y: 22, w: 38, h: 48, src: '/canvas-sample/catfish.svg', alt: 'A huge adult catfish', fit: 'contain',
          say: 'And an old one can be as long as you are tall. At that size, almost nothing in the Bay can eat it.',
          plain: 'Old ones are huge, so nothing can eat them.' },
        { id: 's2-cap', type: 'text', x: 5, y: 78, w: 90, h: 10, text: 'Hand-sized → as long as you are tall', style: 'caption', align: 'center', color: '#475569', silent: true },
      ],
    },
    {
      id: 's3',
      topic: "Why They're a Problem",
      background: { color: '#0b3b5c' },
      elements: [
        { id: 's3-num', type: 'text', x: 5, y: 20, w: 45, h: 30, text: '1970s', style: 'bigNumber', color: '#7dd3fc', queue: 2,
          say: "Blue catfish aren't from here. People brought them to Virginia rivers in the 1970s so anglers would have a big fish to catch. It seemed like a fun idea at the time.",
          plain: 'People put blue catfish in Virginia rivers in the 1970s for fishing.' },
        { id: 's3-label', type: 'text', x: 5, y: 52, w: 45, h: 12, text: 'when people first put them in Virginia rivers', style: 'body', color: '#e0f2fe', silent: true },
        { id: 's3-text', type: 'text', x: 55, y: 20, w: 40, h: 45, text: 'Native to the Mississippi River, not the Chesapeake Bay', style: 'body', color: '#ffffff', queue: 1,
          say: "Here's the twist. Blue catfish come from the Mississippi River, way over in the middle of the country. The Chesapeake Bay was never their home.",
          plain: 'Blue catfish come from the Mississippi River, not from here.' },
        { id: 's3-waves', type: 'image', x: 0, y: 85, w: 100, h: 15, src: '/canvas-sample/waves.svg', fit: 'cover', silent: true, z: 0 },
      ],
    },
    {
      id: 's4',
      topic: "Why They're a Problem",
      background: { color: '#fff7ed' },
      elements: [
        { id: 's4-title', type: 'text', x: 5, y: 6, w: 55, h: 14, text: 'Bad news for blue crabs', style: 'title', color: '#9a3412', silent: true },
        { id: 's4-text', type: 'text', x: 5, y: 26, w: 50, h: 50, text: 'Blue catfish eat blue crabs and other animals the Bay depends on, and adults have almost no predators.', style: 'body', color: '#431407',
          say: "So what's the problem? Blue catfish eat a lot of the animals the Bay depends on, including the famous blue crab. And once they're big, pretty much nothing eats them back. That's what makes a species invasive: it takes and takes, and nothing keeps it in check.",
          plain: 'Blue catfish eat crabs and other animals, and nothing eats the big catfish. That is bad for the Bay.' },
        { id: 's4-crab', type: 'image', x: 62, y: 25, w: 33, h: 45, src: '/canvas-sample/crab.svg', alt: 'A blue crab', fit: 'contain',
          say: "Meet the blue crab. Maryland loves it, restaurants love it, and unfortunately, so do blue catfish.",
          plain: 'This is a blue crab. Blue catfish like to eat them.' },
      ],
    },
  ],
  recap: 'Blue catfish are huge, long-lived, eat almost anything, and came from the Mississippi, which is why they are a problem in the Bay.',
};
