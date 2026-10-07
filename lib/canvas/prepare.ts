import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { TTS_VOICE, VOICE_INSTRUCTIONS, SIMPLE_VOICE_INSTRUCTIONS } from '@/lib/voice';
import type { Deck, Pointer, Slide, SlideElement } from './types';
import { spokenText } from './queue';
import {
  applyPatches, audioKey, fingerprint, helperElements, needsAudio, needsHelper, needsPlain, needsPlainAudio, needsPointers, needsSay, needsTopic,
  pointersBasis,
  plainText, sayBasis, slideBasis, type Patch,
} from './aiFields';

// Save-time AI (step 4, server side). Fills in what the editor left blank:
// spoken words from the knowledge base, plain versions, topic names, and the
// audio clips. Works in phases (words → plain versions → audio) inside a time
// budget; the editor calls again until nothing is left.

const supabase = lazySupabaseAdmin();
const CONCURRENCY = 6;
const AUDIO_BUCKET = 'slide-audio';
const AUDIO_FOLDER = 'canvas';

// Shared AI helpers live in ai.ts (re-exported here: generate.ts imports them from this file)
export { STYLE, chat, knowledge } from './ai';
import { STYLE, chat, chatVision, imageForVision, knowledge } from './ai';
import { draftHelper } from './helperDraft';

const otherText = (slide: Slide, el: SlideElement) =>
  slide.elements.filter((e) => e.id !== el.id).map(sayBasis).filter(Boolean).join(' | ');

async function writeSay(el: SlideElement, slide: Slide, deck: Deck): Promise<string> {
  const basis = sayBasis(el);
  const facts = await knowledge(`${slide.topic ?? ''} ${basis}`);
  const what = el.type === 'image'
    ? `An IMAGE on the slide. Its description: "${basis}". Point the learner to it naturally ("Take a look at…"), say what it shows, and why it matters here. Only describe what the description says is in it.`
    : el.type === 'chart' || el.type === 'diagram'
      ? `A ${el.type === 'chart' ? 'CHART' : 'DIAGRAM'} on the slide: ${basis}. Walk the learner through it ("Look at…"): what it shows and what the big takeaway is.`
      : el.type === 'activity'
        // a hands-on box: the words invite the learner to do it (the lesson waits for them)
        ? `A HANDS-ON ACTIVITY the learner does next: ${basis}. In 20 to 40 words, start with "Your turn" (or similar), say in one line why it's worth doing, and say exactly what to do (drag, tap, slide). NEVER give away the answers.`
        : `A TEXT BOX on the slide that reads: "${basis}". Explain and expand on it in fresh words; never read it out word for word.`;
  // A hands-on box's words are short instructions that open with "Your turn" (was: the 40-80 word explanation rules, which contradicted them)
  const handsOn = el.type === 'activity';
  return chat(
    `${STYLE}\nWrite what the professor SAYS while this part of the slide is highlighted. ${handsOn ? '20 to 40 words' : '40 to 80 words (about 15-30 seconds)'}, ` +
      'plain spoken sentences, no lists, no stage directions, no quotation marks around the whole thing. At most one joke. ' +
      'Every fact must come from the knowledge base excerpts or the slide itself; if they don\'t cover something, leave it out. ' +
      (handsOn ? '' : 'Name the subject in the first sentence (never open with "It", "This" or "They"), because learners can jump straight here.'),
    `Lesson: ${deck.title}\nTopic: ${slide.topic ?? '(not set)'}\n${what}\nOther things on this slide: ${otherText(slide, el) || '(nothing)'}\n\nKnowledge base excerpts:\n${facts || '(none found)'}`,
  );
}

/** Up to 3 laser marks on a picture: what to point at while saying which phrase. */
async function placePointers(el: SlideElement): Promise<Pointer[]> {
  if (el.type !== 'image') return [];
  const spoken = spokenText(el);
  // A picture the model can't read (gone, an SVG, too big): no marks, and no error (kept as "none", so it isn't retried every save)
  const picture = await imageForVision(el.src);
  if (!picture) return [];
  const out = JSON.parse(await chatVision(
    'You place a teacher\'s laser pointer on a picture shown in a lesson. Given the picture and what the teacher says about it, ' +
      'pick up to 3 moments where pointing at one specific, clearly visible part of the picture helps (the words name or describe it). ' +
      'For each: "word" = the short phrase (1-4 words) copied EXACTLY from the spoken words, at the moment to point; ' +
      '"x", "y" = that spot in the picture, in percent of its width and height (0-100, from the top-left). ' +
      'Only point at things you can clearly see. None is fine. Reply as JSON: {"points": [{"word": "...", "x": 0, "y": 0}]}',
    `What the teacher says: "${spoken}"\nPicture description: ${el.alt ?? '(none)'}`,
    picture,
  ));
  const lower = spoken.toLowerCase();
  return (Array.isArray(out.points) ? out.points : [])
    .filter((p: any) => typeof p?.word === 'string' && p.word.trim() && lower.includes(p.word.toLowerCase().trim()))
    .slice(0, 3)
    .map((p: any) => ({
      word: p.word.trim().slice(0, 60),
      x: Math.min(100, Math.max(0, Math.round(Number(p.x) * 10) / 10 || 50)),
      y: Math.min(100, Math.max(0, Math.round(Number(p.y) * 10) / 10 || 50)),
    }));
}

async function writePlain(spoken: string): Promise<string> {
  return chat(
    'Rewrite this for a 10 year old who is a bit lost: one or two short sentences, everyday words, no jokes, same facts, nothing new.',
    spoken,
  );
}

/** Names every slide whose topic is blank (or AI-named from text that changed), keeping the deck's topic runs sensible. */
async function nameTopics(deck: Deck): Promise<Map<number, string>> {
  const lines = deck.slides.map((s, i) =>
    `${i}. [${needsTopic(s) ? 'NEEDS TOPIC' : `topic: ${s.topic}`}] ${slideBasis(s).slice(0, 400)}`);
  const out = await chat(
    'You group lesson slides into topics. Slides in a row with the same topic form one topic, which learners navigate ' +
      'by ("next topic", "go to the part about crabs"). For every slide marked NEEDS TOPIC, give a topic of 2 to 5 words. ' +
      'If the slide continues the slide before it, reuse that slide\'s topic EXACTLY; start a new topic only when the subject changes. ' +
      'Reply as JSON: {"topics": [{"index": 3, "topic": "Why They Spread"}]}',
    `Lesson: ${deck.title}\n\n${lines.join('\n')}`,
    true,
  );
  const parsed = JSON.parse(out);
  const map = new Map<number, string>();
  for (const t of parsed.topics ?? []) {
    if (Number.isInteger(t.index) && typeof t.topic === 'string' && t.topic.trim()) map.set(t.index, t.topic.trim().slice(0, 80));
  }
  return map;
}

export async function writeRecap(deck: Deck): Promise<string> {
  const outline = deck.slides.map((s) => `[${s.topic ?? ''}] ${s.elements.map((e) => spokenText(e)).filter(Boolean).join(' ')}`).join('\n').slice(0, 12000);
  return chat(
    `${STYLE}\nWrite the professor's end-of-lesson recap: 3 to 5 spoken sentences (60-100 words) pulling together the main ideas ` +
      'in order, ending on an upbeat note. Only facts from the lesson.',
    outline,
  );
}

/* ------------------------------------------------------------- audio */

export async function recordClip(text: string, simple: boolean): Promise<{ url: string; key: string }> {
  const key = audioKey(text, simple);
  const path = `${AUDIO_FOLDER}/${key}.mp3`;
  const url = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
  // Same words + voice were recorded before (another slide, an earlier save): reuse it
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (head?.ok) return { url, key };

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: TTS_VOICE,
      instructions: simple ? SIMPLE_VOICE_INSTRUCTIONS : VOICE_INSTRUCTIONS,
      input: text,
    }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${(await res.text()).slice(0, 200)}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`Audio upload failed: ${error.message}`);
  return { url, key };
}

/* ------------------------------------------------------------ runner */

async function pool<T>(items: T[], deadline: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

type Job = { slide: Slide; el: SlideElement; helper?: boolean };
/** Elements that need something; withHelpers also looks at the helpers' elements (as their own slide, for context). */
const jobs = (deck: Deck, need: (el: SlideElement) => boolean, withHelpers = false): Job[] =>
  deck.slides.flatMap((slide) => [
    ...slide.elements.filter(need).map((el) => ({ slide, el })),
    ...(withHelpers ? helperElements(slide).filter(need).map((el) => ({
      slide: { id: `${slide.id}~helper`, topic: slide.topic, elements: helperElements(slide) } as Slide, el, helper: true,
    })) : []),
  ]);
// Patches address the real slide, not the helper view
const baseId = (id: string) => id.split('~')[0];

/**
 * Does as much as fits before `deadline`, on a working copy of the deck.
 * Returns the results as patches (the caller applies them to the stored draft,
 * which may have been edited meanwhile) and any errors.
 */
export async function prepareDeck(source: Deck, deadline: number): Promise<{ patches: Patch[]; errors: string[] }> {
  const deck: Deck = structuredClone(source);
  const patches: Patch[] = [];
  const errors: string[] = [];
  const keep = (p: Patch) => { patches.push(p); applyPatches(deck, [p]); };
  const fail = (what: string, e: unknown) => {
    const msg = `${what}: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(msg);
    if (errors.length < 5) errors.push(msg);
  };

  // 1. Topics (one call for the whole deck) and spoken words
  const topicTask = deck.slides.some(needsTopic)
    ? nameTopics(deck)
        .then((names) => {
          for (const [i, topic] of names) {
            const s = deck.slides[i];
            if (s && needsTopic(s)) keep({ slideId: s.id, kind: 'topic', topic, topicFrom: fingerprint(slideBasis(s)) });
          }
        })
        .catch((e) => fail('Naming topics', e))
    : Promise.resolve();
  await Promise.all([
    topicTask,
    pool(jobs(deck, needsSay, true), deadline, async ({ slide, el, helper }) => {
      try {
        const say = await writeSay(el, slide, deck);
        keep({ slideId: baseId(slide.id), elId: el.id, helper, kind: 'say', say, sayFrom: fingerprint(sayBasis(el)) });
      } catch (e) { fail('Writing spoken words', e); }
    }),
    // Helpers ("explain it another way" versions the slide morphs into) for slides without one
    pool(deck.slides.filter(needsHelper), deadline, async (slide) => {
      try {
        keep({ slideId: slide.id, kind: 'helper', helper: await draftHelper(slide, deck) });
      } catch (e) { fail('Drafting a helper', e); }
    }),
  ]);

  // 2. Plain versions (from the spoken words, including ones just written)
  await pool(jobs(deck, needsPlain), deadline, async ({ slide, el }) => {
    try {
      const spoken = spokenText(el);
      keep({ slideId: slide.id, elId: el.id, kind: 'plain', plain: await writePlain(spoken), plainFrom: fingerprint(spoken) });
    } catch (e) { fail('Writing a plain version', e); }
  });

  // 2b. Laser marks on pictures (from the spoken words, including ones just written)
  await pool(jobs(deck, needsPointers, true), deadline, async ({ slide, el, helper }) => {
    try {
      keep({ slideId: baseId(slide.id), elId: el.id, helper, kind: 'pointers', pointers: await placePointers(el), pointersFrom: fingerprint(pointersBasis(el)) });
    } catch (e) { fail('Placing laser marks', e); }
  });

  // 3. Audio for the spoken words and the plain versions
  const clips = [
    ...jobs(deck, needsAudio, true).map((j) => ({ ...j, simple: false })),
    ...jobs(deck, needsPlainAudio).map((j) => ({ ...j, simple: true })),
  ];
  await pool(clips, deadline, async ({ slide, el, simple, helper }) => {
    try {
      const text = simple ? plainText(el) : spokenText(el);
      const { url, key } = await recordClip(text, simple);
      keep(simple
        ? { slideId: baseId(slide.id), elId: el.id, helper, kind: 'plainAudio', plainAudioUrl: url, plainAudioFor: key }
        : { slideId: baseId(slide.id), elId: el.id, helper, kind: 'audio', audioUrl: url, audioFor: key });
    } catch (e) { fail('Making audio', e); }
  });

  return { patches, errors };
}
