import { chatVision, imageForVision } from './ai';

// "✨ Describe it" in the editor: the AI looks at a picture and writes its
// description, which the spoken words, the caption and the laser marks are
// written from, and which screen readers read out.

export class CantDescribe extends Error {}

export async function describeImage(src: string, about: { lesson?: string; topic?: string } = {}): Promise<string> {
  const picture = await imageForVision(src);
  if (!picture) {
    throw new CantDescribe(/\.svg(\?|$)/i.test(src)
      ? 'Drawings in SVG format can\'t be described by the AI: type the description yourself.'
      : 'The AI can\'t read this picture: it has to be a PNG, JPEG, WebP or GIF on the web (https), under 8 MB.');
  }
  const out = JSON.parse(await chatVision(
    'You describe a picture used in a lesson for 10-14 year olds. Write 1 or 2 plain sentences (15 to 40 words) saying exactly what is shown: ' +
      'the animals, objects, people and setting, and any words written in it. Be specific (e.g. "a blue catfish" if that is clearly what it is), ' +
      'but only describe what you can actually see: never guess names, places or numbers that aren\'t clear from the picture. ' +
      'No "This image shows", no opinions. Reply as JSON: {"description": "..."}',
    `Lesson: ${about.lesson || '(not given)'}\nTopic of the slide: ${about.topic || '(not given)'}`,
    picture,
  ));
  const text = typeof out.description === 'string' ? out.description.trim().replace(/^(this|the) (image|picture|photo) shows\s+/i, '') : '';
  if (!text) throw new Error('The AI didn\'t write a description');
  return (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, 600);
}
