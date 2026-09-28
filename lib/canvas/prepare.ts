import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { TTS_VOICE, VOICE_INSTRUCTIONS, SIMPLE_VOICE_INSTRUCTIONS } from '@/lib/voice';
import type { Deck, Slide, SlideElement } from './types';
import { spokenText } from './queue';
import {
  applyPatches, audioKey, fingerprint, needsAudio, needsPlain, needsPlainAudio, needsSay, needsTopic,
  plainText, sayBasis, slideBasis, type Patch,
} from './aiFields';

// Save-time AI (step 4, server side). Fills in what the editor left blank:
// spoken words from the knowledge base, plain versions, topic names, and the
// audio clips. Works in phases (words → plain versions → audio) inside a time
// budget; the editor calls again until nothing is left.

const supabase = lazySupabaseAdmin();
const MODEL = 'gpt-6-luna';
const CONCURRENCY = 6;
const AUDIO_BUCKET = 'slide-audio';
const AUDIO_FOLDER = 'canvas';

export const STYLE =
  'You are Professor Marine, a fun science teacher talking to 10 to 14 year olds about the blue catfish invasion ' +
  'of the Chesapeake Bay. Upbeat and conversational, like telling a story. A little goofy, with light, dry, ' +
  'playful sarcasm aimed at the fish, never at the learner. Facts must be exactly right.';

/* ------------------------------------------------------------ OpenAI */

export async function chat(system: string, user: string, json = false, maxTokens = 2000): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'low',
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: maxTokens,
    }),
  });
  const raw = await res.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* not JSON: a proxy or outage page */ }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) throw new Error(data?.error?.message || `OpenAI request failed (${res.status}): ${raw.slice(0, 120)}`);
  return text;
}

export async function knowledge(query: string, count = 6): Promise<string> {
  try {
    const emb = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query.slice(0, 2000) }),
    }).then((r) => r.json());
    const { data, error } = await supabase.rpc('match_documents3', { query_embedding: emb.data[0].embedding, match_count: count });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => String(r.content ?? '')).filter(Boolean).join('\n\n');
  } catch (e) {
    console.warn('Knowledge base lookup failed:', e);
    return '';
  }
}

const otherText = (slide: Slide, el: SlideElement) =>
  slide.elements.filter((e) => e.id !== el.id).map(sayBasis).filter(Boolean).join(' | ');

async function writeSay(el: SlideElement, slide: Slide, deck: Deck): Promise<string> {
  const basis = sayBasis(el);
  const facts = await knowledge(`${slide.topic ?? ''} ${basis}`);
  const what = el.type === 'image'
    ? `An IMAGE on the slide. Its description: "${basis}". Point the learner to it naturally ("Take a look at…"), say what it shows, and why it matters here. Only describe what the description says is in it.`
    : `A TEXT BOX on the slide that reads: "${basis}". Explain and expand on it in fresh words; never read it out word for word.`;
  return chat(
    `${STYLE}\nWrite what the professor SAYS while this part of the slide is highlighted. 40 to 80 words (about 15-30 seconds), ` +
      'plain spoken sentences, no lists, no stage directions, no quotation marks around the whole thing. At most one joke. ' +
      'Every fact must come from the knowledge base excerpts or the slide itself; if they don\'t cover something, leave it out. ' +
      'Name the subject in the first sentence (never open with "It", "This" or "They"), because learners can jump straight here.',
    `Lesson: ${deck.title}\nTopic: ${slide.topic ?? '(not set)'}\n${what}\nOther things on this slide: ${otherText(slide, el) || '(nothing)'}\n\nKnowledge base excerpts:\n${facts || '(none found)'}`,
  );
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

async function recordClip(text: string, simple: boolean): Promise<{ url: string; key: string }> {
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

type Job = { slide: Slide; el: SlideElement };
const jobs = (deck: Deck, need: (el: SlideElement) => boolean): Job[] =>
  deck.slides.flatMap((slide) => slide.elements.filter(need).map((el) => ({ slide, el })));

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
    pool(jobs(deck, needsSay), deadline, async ({ slide, el }) => {
      try {
        const say = await writeSay(el, slide, deck);
        keep({ slideId: slide.id, elId: el.id, kind: 'say', say, sayFrom: fingerprint(sayBasis(el)) });
      } catch (e) { fail('Writing spoken words', e); }
    }),
  ]);

  // 2. Plain versions (from the spoken words, including ones just written)
  await pool(jobs(deck, needsPlain), deadline, async ({ slide, el }) => {
    try {
      const spoken = spokenText(el);
      keep({ slideId: slide.id, elId: el.id, kind: 'plain', plain: await writePlain(spoken), plainFrom: fingerprint(spoken) });
    } catch (e) { fail('Writing a plain version', e); }
  });

  // 3. Audio for the spoken words and the plain versions
  const clips = [
    ...jobs(deck, needsAudio).map((j) => ({ ...j, simple: false })),
    ...jobs(deck, needsPlainAudio).map((j) => ({ ...j, simple: true })),
  ];
  await pool(clips, deadline, async ({ slide, el, simple }) => {
    try {
      const text = simple ? plainText(el) : spokenText(el);
      const { url, key } = await recordClip(text, simple);
      keep(simple
        ? { slideId: slide.id, elId: el.id, kind: 'plainAudio', plainAudioUrl: url, plainAudioFor: key }
        : { slideId: slide.id, elId: el.id, kind: 'audio', audioUrl: url, audioFor: key });
    } catch (e) { fail('Making audio', e); }
  });

  return { patches, errors };
}
