import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { ACTIVITY_GUIDE, VISUALS_GUIDE } from './visualGuide';
import { activityReady } from './queue';
import type { Deck, Slide, SlideElement, TextElement } from './types';
import type { LessonInfo } from './lessons';
import { sanitizeDeck } from './sanitize';
import { fitStatus, neededHeight, textMetrics } from './fitEstimate';
import { growMedia } from './fillSpace';
import { fingerprint, needsAnswerCheck, sayBasis, slideBasis } from './aiFields';
import { chat, knowledge, STYLE } from './ai';
import { writeRecap } from './prepare';
import { removeRepeats } from './repeats';
import { checkActivityAnswers } from './activityCheck';
import { fixStoryOrder } from './storyOrder';
import { lessonPictures, pictureCandidates, pictureIdea } from './pictures';
import { pictureCheckable } from './aiFields';

const GENERATE_BUDGET_MS = 270_000;   // the ai-deck route's maxDuration is 300 s
const ANSWER_CHECK_MS = 30_000;        // a hands-on box's answer check, roughly, with room to spare
const STORY_ORDER_MS = 40_000;         // the story-order read and the recap after it
const PICTURES_MS = 30_000;            // the picture pass (in parallel over the slides), and the recap after it

// Step 5: the AI makes a whole deck in the canvas format.
//   1. plan the lesson's topics from the knowledge base
//   2. per topic (in parallel): lay out slides — positions, styles, spoken
//      words, plain versions — using images from the library by description
//   3. check every slide (text that won't fit, off the slide, overlapping
//      text); broken slides go back to the AI once, then get small automatic fixes
//   4. read the whole deck for repeated content (up to 3 times) and rewrite repeats
//   5. check the hands-on boxes' answer keys against the knowledge base
//   6. put the whole lesson in story order (storyOrder.ts): the right first and last topics
//   7. add library pictures it doesn't use yet where a slide talks about what one shows (pictures.ts)
// Audio is made afterwards by the save-time AI (prepare.ts).

const supabase = lazySupabaseAdmin();

/** score: how close it is to the search (0-1), when the library search gives it; used: the lesson already shows it (the picture check) */
export type LibImage = { id: string; url: string; description: string; score?: number; used?: boolean };
type TopicPlan = { title: string; query: string; covers: string[] };

export async function imagesFor(query: string, count: number): Promise<LibImage[]> {
  try {
    const emb = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
    }).then((r) => r.json());
    const { data, error } = await supabase.rpc('match_images2', { query_embedding: emb.data[0].embedding, match_count: count });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any, i: number) => ({ id: `img${i + 1}`, url: r.url, description: r.description ?? '', ...(typeof r.similarity === 'number' ? { score: r.similarity } : {}) }));
  } catch (e) {
    console.warn('Image lookup failed:', e);
    return [];
  }
}

/* ------------------------------------------------------------- prompts */

// The canvas format, explained to the model. Numbers come from fitEstimate.ts
// so the model's sense of "fits" matches the checker's.
/** visuals: charts and diagrams too; activities: hands-on boxes too (lib/canvas/visualGuide.ts) */
export function formatGuide(opts: { visuals?: boolean; activities?: boolean } = {}): string {
  const m = (style: 'title' | 'body' | 'caption' | 'bigNumber', w: number) => {
    const { charsPerLine, lineHeight } = textMetrics(style, w);
    return `${style}: in a box ${w} wide, about ${charsPerLine} characters per line, each line ${lineHeight.toFixed(1)} tall`;
  };
  return `SLIDE FORMAT
A slide is a 16:9 canvas. Every element has x, y (top-left corner), w, h — all in PERCENT of the slide (0-100). x+w ≤ 100 and y+h ≤ 100.
Keep a 4% margin from the edges for text. Text boxes must NOT overlap each other. An image may sit behind text only if it is "silent" decoration.

Elements:
- {"type":"text","x":..,"y":..,"w":..,"h":..,"text":"what is SHOWN","style":"title"|"body"|"caption"|"bigNumber","color":"#hex","bold":true|false,"align":"left"|"center"|"right", ...speech}
- {"type":"image","image":"img3","x":..,"y":..,"w":..,"h":..,"fit":"contain"|"cover", ...speech}   ("image" is an id from the AVAILABLE IMAGES list; never invent one)
Speech fields (on any element):
- "silent": true for titles, labels, captions and decoration — they don't speak.
- "say": what the professor SAYS while this element is highlighted: 40-80 words that explain and expand on it in fresh words (never read the shown text out). Name the subject in the first sentence.
- "plain": one or two short, plain sentences with the same facts, for a learner who asked "simpler please". No jokes.
- "queue": optional speaking order number; without it, elements speak top-left to bottom-right.

Text sizing (font scales with the slide; text that doesn't fit is a failure):
- ${m('title', 90)}; ${m('title', 45)}
- ${m('body', 45)}; ${m('body', 90)}
- ${m('caption', 30)}
- ${m('bigNumber', 45)}
Make every text box tall enough: lines × line height + 2. Shown text is SHORT: bullet fragments under 8 words ("• Can top 100 pounds", one per line), a title under 6 words, a big number like "100+ lbs".

Design: every slide looks different. Mix layouts, e.g. an image in the middle with short text around it; two or three images side by side each with a spoken explanation; a big number with a label; text on one side and an image on the other; a full-width title over bullets. 2-4 speaking elements per slide. Backgrounds are soft light colors ("#eaf6fb", "#fff7ed", "#f0fdf4", "#f5f3ff") or a deep blue "#0b3b5c" with light text. Text colors must contrast with the background.` +
    (opts.visuals ? `\n\n${VISUALS_GUIDE}` : '') + (opts.activities ? `\n\n${ACTIVITY_GUIDE}` : '');
}

async function planTopics(lesson: LessonInfo): Promise<TopicPlan[]> {
  const facts = await knowledge(`${lesson.title}: overview, causes, impacts, what people can do`, 40);
  const out = await chat(
    'You plan a short interactive lesson for 10-14 year olds. Split it into 4 to 6 topics in a sensible teaching order ' +
      '(what it is → why it matters → what is being done). Each topic covers DIFFERENT facts: never plan the same fact into two topics. ' +
      'Only use what the source content supports. Reply as JSON: {"topics":[{"title":"2-5 words","query":"search phrase for this topic\'s facts","covers":["fact or idea", "..."]}]}',
    `Lesson: ${lesson.title}\n\nSOURCE CONTENT:\n${facts}`,
    true,
    3000,
  );
  const topics = (JSON.parse(out).topics ?? []) as TopicPlan[];
  const clean = topics
    .filter((t) => typeof t?.title === 'string' && t.title.trim())
    .map((t) => ({ title: t.title.trim().slice(0, 80), query: String(t.query || t.title), covers: (t.covers ?? []).map(String).slice(0, 8) }));
  if (!clean.length) throw new Error('The AI did not plan any topics');
  return clean.slice(0, 7);
}

async function writeTopicSlides(
  lesson: LessonInfo, topic: TopicPlan, others: TopicPlan[], images: LibImage[], facts: string, fixes?: string,
): Promise<any[]> {
  const imageList = images.length
    ? images.map((i) => `${i.id}: ${i.description}`).join('\n')
    : '(none: use text only)';
  const out = await chat(
    `${STYLE}\nYou design the slides for ONE topic of the lesson, as JSON.\n\n${formatGuide({ visuals: true, activities: true })}\n\n` +
      'Write 3 to 5 slides for this topic. The first slide of the topic introduces it with a title. ' +
      'Where numbers, change over time, steps or a comparison come up, show them with a chart or diagram instead of bullets. ' +
      'End the topic with ONE hands-on slide (a short silent title and one hands-on box) when the topic has something to sort, order, guess, ' +
      'explore or adjust; it must use facts taught in this topic. ' +
      'Every fact must come from the SOURCE CONTENT. Do not teach what the OTHER TOPICS cover. ' +
      'Use an image only if its description fits the slide, and describe only what the description says is in it. ' +
      'Reply as JSON: {"slides":[{"background":"#hex","elements":[...]}]}',
    `Lesson: ${lesson.title}\nTOPIC: ${topic.title}\nThis topic covers: ${topic.covers.join('; ') || '(see source)'}\n` +
      `OTHER TOPICS (don't repeat them): ${others.map((o) => `${o.title} (${o.covers.join('; ')})`).join(' | ')}\n\n` +
      `AVAILABLE IMAGES:\n${imageList}\n\nSOURCE CONTENT:\n${facts}` +
      (fixes ? `\n\nYOUR PREVIOUS SLIDES HAD PROBLEMS. Fix them and return ALL the slides again:\n${fixes}` : ''),
    true,
    12000,
  );
  const slides = JSON.parse(out).slides;
  if (!Array.isArray(slides) || !slides.length) throw new Error(`No slides for "${topic.title}"`);
  return slides;
}

/* ---------------------------------------------------------- building */

/** Model output → a Slide: image ids become library URLs + descriptions. */
export function toSlide(raw: any, topic: string, images: LibImage[], id: string): Slide {
  const byId = new Map(images.map((i) => [i.id, i]));
  const elements = (Array.isArray(raw?.elements) ? raw.elements : []).flatMap((e: any, j: number) => {
    if (e?.type === 'image') {
      const img = byId.get(String(e.image));
      if (!img) return [];   // invented or missing image: drop it
      return [{ ...e, id: `${id}-e${j}`, src: img.url, alt: img.description }];
    }
    if (e?.type === 'activity' && e.image) {
      // a hands-on box's picture (hotspots, slider): from the library, or none
      const img = byId.get(String(e.image));
      return [{ ...e, id: `${id}-e${j}`, src: img?.url, alt: e.alt ?? img?.description }];
    }
    return [{ ...e, id: `${id}-e${j}` }];
  });
  return { id, topic, background: raw?.background ? { color: raw.background } : undefined, elements };
}

/** What's wrong with a slide, in words the model can act on (empty = fine). */
export function problems(raw: any, slide: Slide, images: LibImage[]): string[] {
  const out: string[] = [];
  const known = new Set(images.map((i) => i.id));
  for (const e of Array.isArray(raw?.elements) ? raw.elements : []) {
    if (typeof e?.x === 'number' && (e.x < 0 || e.y < 0 || e.x + e.w > 100.5 || e.y + e.h > 100.5)) {
      out.push(`an element at x=${e.x}, y=${e.y}, w=${e.w}, h=${e.h} goes off the slide`);
    }
    if ((e?.type === 'image' || (e?.type === 'activity' && e.image)) && !known.has(String(e.image))) out.push(`image "${e.image}" is not in the AVAILABLE IMAGES list`);
  }
  const texts = slide.elements.filter((e): e is TextElement => e.type === 'text');
  for (const t of texts) {
    if (fitStatus(t) === 'overflows') {
      out.push(`the ${t.style} box "${t.text.slice(0, 40)}" (w=${t.w}, h=${t.h}) is too small: it needs about h=${Math.ceil(neededHeight(t))}; make it bigger or the text shorter`);
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 0.5 && h > 0.5) out.push(`text boxes "${a.text.slice(0, 25)}" and "${b.text.slice(0, 25)}" overlap`);
    }
  }
  return out;
}

/**
 * Last resort for what the retry didn't fix: grow boxes that overflow, as far as the slide allows. Then a slide
 * that's mostly empty gets its pictures, charts and diagrams grown into the space (fillSpace.ts).
 */
export function autoFix(slide: Slide): void {
  for (const e of slide.elements) {
    if (e.type !== 'text' || fitStatus(e) !== 'overflows') continue;
    const want = Math.ceil(neededHeight(e, 0.8));
    e.h = Math.min(100 - e.y, Math.max(e.h, want));
    if (fitStatus(e) === 'overflows' && e.y > 4) {   // still too tall: move it up
      e.y = Math.max(4, 100 - Math.max(e.h, want));
      e.h = Math.min(100 - e.y, Math.max(e.h, want));
    }
  }
  slide.elements = growMedia(slide).elements;
}

/** Marks everything as AI-written, with fingerprints, so the save-time AI keeps it until its source changes. */
export function markAi(slide: Slide): void {
  for (const el of slide.elements as SlideElement[]) {
    if (el.say) Object.assign(el, { sayByAI: true, sayFrom: fingerprint(sayBasis(el)) });
    if (el.plain && el.say) Object.assign(el, { plainByAI: true, plainFrom: fingerprint(el.say) });
  }
  Object.assign(slide, { topicByAI: true, topicFrom: fingerprint(slideBasis(slide)) });
}

export async function generateAiDeck(lesson: LessonInfo): Promise<{ deck: Deck; notes: string[] }> {
  const started = Date.now();
  const notes: string[] = [];
  const plan = await planTopics(lesson);

  const perTopic = await Promise.all(plan.map(async (topic, ti) => {
    const others = plan.filter((_, j) => j !== ti);
    const [facts, images] = await Promise.all([knowledge(topic.query, 15), imagesFor(`${topic.title} ${topic.query}`, 6)]);
    const build = (raws: any[]) => raws.map((r, si) => toSlide(r, topic.title, images, `ai${ti}-${si}`));

    let raws = await writeTopicSlides(lesson, topic, others, images, facts);
    let slides = build(raws);
    let issues = slides.map((s, i) => problems(raws[i], s, images));
    if (issues.some((x) => x.length)) {
      // Send it back once, with the problems spelled out per slide
      const fixes = issues.map((x, i) => (x.length ? `Slide ${i + 1}: ${x.join('; ')}` : '')).filter(Boolean).join('\n');
      try {
        raws = await writeTopicSlides(lesson, topic, others, images, facts, fixes);
        slides = build(raws);
        issues = slides.map((s, i) => problems(raws[i], s, images));
      } catch (e) {
        notes.push(`"${topic.title}": the retry failed (${e instanceof Error ? e.message : String(e)}), kept the first version`);
      }
    }
    slides.forEach(autoFix);
    const left = issues.flat().length;
    if (left) notes.push(`"${topic.title}": ${left} layout problem(s) remained after the retry and were auto-fixed where possible`);
    return slides;
  }));

  // Clean like any saved deck (clamps boxes onto the slide, drops bad fields)
  const deck = sanitizeDeck({ title: lesson.title, slides: perTopic.flat() }, lesson.id, 'ai');
  // A hands-on box the model left half made (no groups, one card) is dropped, and so is a slide left with only its title
  deck.slides = deck.slides.filter((s) => {
    const before = s.elements.length;
    s.elements = s.elements.filter((e) => e.type !== 'activity' || activityReady(e));
    return s.elements.length === before || s.elements.some((e) => !e.silent);
  });
  // Before markAi, so the fingerprints are of the final words (and audio is made for them only)
  await removeRepeats(deck, notes, started + GENERATE_BUDGET_MS);
  // Hands-on answer keys against the knowledge base (the save-time AI checks any left over)
  await Promise.all(deck.slides.flatMap((s) => s.elements.filter(needsAnswerCheck).map(async (el) => {
    // (with room left for it: one not checked here is checked by the save-time AI)
    if (el.type !== 'activity' || Date.now() > started + GENERATE_BUDGET_MS - ANSWER_CHECK_MS) return;
    try {
      const r = await checkActivityAnswers(el, { lesson: lesson.title, topic: s.topic });
      Object.assign(el, { ...(r.items ? { items: r.items } : {}), ...(r.slider ? { slider: r.slider } : {}), answerCheck: r.check });
      // its words were written for the old key: the save-time AI writes them again from the corrected one
      if (r.check.fixed?.length) { delete el.say; delete el.plain; }
      if (r.check.fixed?.length) notes.push(`"${s.topic}": corrected a hands-on answer key: ${r.check.fixed.join('; ')}`);
      if (!r.check.ok) notes.push(`"${s.topic}": a hands-on box's answers need a look: ${r.check.notes?.join('; ')}`);
    } catch (e) {
      notes.push(`Checking a hands-on box failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  })));
  // Last check before any audio: the whole lesson in story order (the topics were written
  // in parallel): the right first and last topics, each slide building on the one before
  // (with room left for it and the recap after it: else the save-time AI suggests the moves instead)
  if (Date.now() < started + GENERATE_BUDGET_MS - STORY_ORDER_MS) {
    try {
      notes.push(...(await fixStoryOrder(deck, lesson.title)));
    } catch (e) {
      notes.push(`Checking the slide order failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Pictures: the library's pictures the lesson doesn't use yet (no words in them), added where a slide talks
  // about what one shows, the slide laid out again with them (with room left for it: else the save-time AI suggests them)
  if (Date.now() < started + GENERATE_BUDGET_MS - PICTURES_MS) {
    try {
      const slides = deck.slides.filter(pictureCheckable);
      const candidates = await pictureCandidates(deck, slides, lessonPictures(deck, false));
      let added = 0;
      await Promise.all(slides.map(async (s) => {
        const idea = await pictureIdea(deck, s, candidates.get(s.id) ?? []).catch(() => null);
        if (idea) { s.elements = idea.elements; added += idea.pictures.length; }
      }));
      if (added) notes.push(`Added ${added} picture${added === 1 ? '' : 's'} from the library where slides talk about what they show`);
    } catch (e) {
      notes.push(`Adding pictures failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  deck.slides.forEach(markAi);
  try {
    deck.recap = await writeRecap(deck);
    deck.recapByAI = true;
  } catch (e) {
    notes.push(`The recap couldn't be written: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { deck, notes };
}
