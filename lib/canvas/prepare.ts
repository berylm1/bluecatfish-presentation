import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { TTS_VOICE, VOICE_INSTRUCTIONS, SIMPLE_VOICE_INSTRUCTIONS } from '@/lib/voice';
import type { Deck, Pointer, Slide, SlideElement } from './types';
import { spokenText } from './queue';
import { introBasis, introText } from './intro';
import {
  answerBasis, applyPatches, bankBasis, bankElements, needsBank, needsOrderCheck, needsPictureCheck, pictureBasis, needsQuiz, orderBasis, quizBasis, quizKey, audioKey, fingerprint, helperElements, needsAnswerCheck, needsAudio, needsCaption, needsHelper, needsIntro, needsIntroAudio, needsPlain, needsPlainAudio, needsPointers, needsSay, needsTopic,
  pointersBasis,
  plainText, sayBasis, slideBasis, type Patch,
} from './aiFields';

// Save-time AI (step 4, server side). Fills in what the editor left blank:
// spoken words from the knowledge base, plain versions, topic names, and the
// audio clips. Works in phases (words → plain versions → audio) inside a time
// budget; the editor calls again until nothing is left.

const supabase = lazySupabaseAdmin();
const CONCURRENCY = 10;   // AI calls at a time, per stage (was 6; a busy moment is waited out: lib/canvas/ai.ts)
const AUDIO_BUCKET = 'slide-audio';
const AUDIO_FOLDER = 'canvas';
const QUIZ_TIME_MS = 25_000;   // the quiz's check, write and check, roughly
const ORDER_TIME_MS = 12_000;  // the story-order check, roughly
const BANK_TIME_MS = 35_000;
const PICTURE_TIME_MS = 15_000;   // a slide's picture check (a search, one AI read, maybe a fix), roughly   // a topic's question bank (one long AI write, a fix or two), roughly

// Shared AI helpers live in ai.ts (re-exported here: generate.ts imports them from this file)
export { STYLE, chat, knowledge } from './ai';
import { STYLE, chat, chatVision, imageForVision, knowledge, openai } from './ai';
import { draftHelper } from './helperDraft';
import { checkActivityAnswers } from './activityCheck';
import { refreshQuiz } from './quiz';
import { askStoryOrder } from './storyOrder';
import { movesFor } from './order';
import { usedPictures, writeBankTopic } from './bank';
import { checkPictures, lessonPictures, pictureCandidates } from './pictures';

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

/** A topic's introduction: what the professor says before its first slide. */
async function writeIntro(deck: Deck, i: number): Promise<string> {
  const slide = deck.slides[i];
  const topic = introBasis(slide);
  // What the topic's slides show, so the opener promises what's actually coming
  const coming: string[] = [];
  for (let j = i; j < deck.slides.length && (j === i || deck.slides[j].topic?.trim() === slide.topic?.trim()); j++) coming.push(slideBasis(deck.slides[j]));
  const before = deck.slides.slice(0, i).map((s) => s.topic?.trim()).filter(Boolean);
  const previous = before[before.length - 1];
  return chat(
    `${STYLE}\nWrite the professor's short introduction to the next part of the lesson, said just before its first slide. ` +
      '1 or 2 spoken sentences, 15 to 35 words: name what this part is about and why it\'s worth knowing, so the learner knows what\'s coming. ' +
      (previous ? 'Link it to the part before in a few words ("Now that we know…", "Next, let\'s…"). ' : 'This is the first part of the lesson: open it ("Let\'s start with…"). ') +
      'Don\'t teach the facts yet, no question at the end, no quotation marks.',
    `Lesson: ${deck.title}\n${previous ? `Part before: ${previous}\n` : ''}This part: ${topic}\nWhat its slides show: ${coming.join(' || ').slice(0, 3000)}`,
  ).then((t) => t.trim().slice(0, 1000));   // (the stored limit; live read-aloud takes up to 1500)
}

/** A short caption for a picture, from its description. */
async function writeCaption(el: SlideElement): Promise<string> {
  const out = await chat(
    'Write a short caption shown under a picture in a lesson for 10-14 year olds: 3 to 10 words saying what the picture shows ' +
      '("A blue catfish caught in the James River"). Only what the description says. No "Image of", no quotation marks, no full stop at the end.',
    `Picture description: ${el.type === 'image' ? el.alt ?? '' : ''}`,
  );
  return out.trim().replace(/^["']|["'.]$/g, '').slice(0, 120);
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
  // was: 3 to 5 sentences (60-100 words) on the main ideas; the ending now goes on to the learner's own achievements, so this is one quick line
  return chat(
    `${STYLE}\nWrite the professor's end-of-lesson recap: ONE spoken sentence, under 40 words, that runs through what the learner did in each ` +
      'part of the lesson, in order, starting with "You", like: "You met the blue catfish, learned how they spread, found out why they matter, ' +
      'saw what they eat, and how people can help." One short phrase per part, from the lesson. No other sentences, no quotation marks.',
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

  const res = await openai('audio/speech', {
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

type Job = { slide: Slide; el: SlideElement; helper?: boolean; bank?: string };
/**
 * Elements that need something; withHelpers also looks at the helpers' elements (as their own slide, for context),
 * withBank at the question bank's answer slides.
 */
const jobs = (deck: Deck, need: (el: SlideElement, slide: Slide) => boolean, withHelpers = false, withBank = false): Job[] => [
  ...(withBank ? bankElements(deck).filter(({ q, el }) => need(el, q.slide)).map(({ q, el }) => ({ slide: q.slide, el, bank: q.id })) : []),
  ...deck.slides.flatMap((slide) => [
    ...slide.elements.filter((el) => need(el, slide)).map((el) => ({ slide, el })),
    ...(withHelpers ? (() => {
      const view = { id: `${slide.id}~helper`, topic: slide.topic, elements: helperElements(slide) } as Slide;
      return view.elements.filter((el) => need(el, view)).map((el) => ({ slide: view, el, helper: true }));
    })() : []),
  ]),
];
// Patches address the real slide, not the helper view
const baseId = (id: string) => id.split('~')[0];

/**
 * A queue of jobs worked CONCURRENCY at a time, that can grow while it runs (a box's spoken words, once
 * written, add its plain version and laser marks). Done when it's empty and nothing is running, or the
 * deadline has passed and what was running has finished.
 */
function workQueue<T>(deadline: number, work: (item: T, add: (item: T) => void) => Promise<void>) {
  const items: T[] = [];
  let running = 0;
  let finish: () => void = () => {};
  const done = new Promise<void>((r) => { finish = r; });
  const pump = () => {
    while (running < CONCURRENCY && items.length && Date.now() < deadline) {
      const item = items.shift()!;
      running++;
      work(item, add).finally(() => { running--; pump(); });
    }
    if (!running && (!items.length || Date.now() >= deadline)) finish();
  };
  function add(item: T) { items.push(item); queueMicrotask(pump); }
  /** Something that will add jobs later (the topic names, then their introductions): the queue waits for it */
  const hold = (p: Promise<unknown>) => { running++; p.finally(() => { running--; pump(); }); };
  return { add, hold, done, start: () => queueMicrotask(pump) };
}

type WordJob =
  | ({ kind: 'say' | 'plain' | 'pointers' | 'check' } & Job)
  | { kind: 'intro'; i: number }
  | { kind: 'caption'; slide: Slide; el: SlideElement }
  | { kind: 'helper'; slide: Slide };

/**
 * Does as much as fits before `deadline`, on a working copy of the deck.
 * Returns the results as patches (the caller applies them to the stored draft,
 * which may have been edited meanwhile) and any errors.
 *
 * The words first, each box on its own: its spoken words, then straight on to its plain version and
 * laser marks (was: every box's spoken words, then every box's plain version, then the marks, each
 * stage waiting for the slowest box). A hands-on box's answer key is checked first, alongside the other
 * boxes' words, so its words are written from the right answers. Audio comes last, once the lesson's
 * words are final (nothing records words that are about to change); the question bank's answer slides
 * get theirs once the bank is written. The bank, the quiz, the story order and the picture check run
 * alongside: none of them changes the lesson's own words.
 */
export async function prepareDeck(
  source: Deck,
  deadline: number,
  /** Where results go as they're made: the caller can take what's done if it has to stop waiting (a hard time limit) */
  out: { patches: Patch[]; errors: string[] } = { patches: [], errors: [] },
): Promise<{ patches: Patch[]; errors: string[] }> {
  const deck: Deck = structuredClone(source);
  const { patches, errors } = out;
  const keep = (p: Patch) => { patches.push(p); applyPatches(deck, [p]); };
  const fail = (what: string, e: unknown) => {
    const msg = `${what}: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(msg);
    if (errors.length < 5) errors.push(msg);
  };
  const timeFor = (ms: number) => deadline - Date.now() > ms;

  // 1. The words
  const words = workQueue<WordJob>(deadline, async (job, add) => {
    // after a box's spoken words: its plain version and laser marks (lesson boxes; a bank answer's only get audio)
    const after = ({ slide, el, helper, bank }: Job) => {
      if (bank) return;
      if (!helper && needsPlain(el)) add({ kind: 'plain', slide, el });
      if (needsPointers(el)) add({ kind: 'pointers', slide, el, helper });
    };
    try {
      switch (job.kind) {
        case 'say': {
          const { slide, el, helper, bank } = job;
          const say = await writeSay(el, slide, deck);
          keep({ slideId: baseId(slide.id), elId: el.id, helper, bank, kind: 'say', say, sayFrom: fingerprint(sayBasis(el)) });
          after(job);
          break;
        }
        case 'plain': {
          const spoken = spokenText(job.el);
          keep({ slideId: job.slide.id, elId: job.el.id, kind: 'plain', plain: await writePlain(spoken), plainFrom: fingerprint(spoken) });
          break;
        }
        case 'pointers':
          keep({ slideId: baseId(job.slide.id), elId: job.el.id, helper: job.helper, kind: 'pointers', pointers: await placePointers(job.el), pointersFrom: fingerprint(pointersBasis(job.el)) });
          break;
        case 'check': {
          // A hands-on box's answer key against the knowledge base (a key the sources contradict is corrected; a doubtful
          // one is flagged for a person). Then its words: written from the answers as they now are
          const { slide, el, helper } = job;
          if (el.type !== 'activity') break;
          const r = await checkActivityAnswers(el, { lesson: deck.title, topic: slide.topic });
          keep({ slideId: baseId(slide.id), elId: el.id, helper, kind: 'answerCheck', from: answerBasis(el), items: r.items, slider: r.slider, check: r.check });
          if (needsSay(el)) add({ ...job, kind: 'say' });
          else after(job);
          break;
        }
        case 'intro': {
          const slide = deck.slides[job.i];
          keep({ slideId: slide.id, kind: 'intro', say: await writeIntro(deck, job.i), sayFrom: fingerprint(introBasis(slide)) });
          break;
        }
        case 'caption': {
          const { slide, el } = job;
          keep({ slideId: slide.id, elId: el.id, kind: 'caption', caption: await writeCaption(el), captionFrom: fingerprint(el.type === 'image' ? el.alt?.trim() ?? '' : '') });
          break;
        }
        case 'helper': {
          // ("explain it another way": the slide morphs into it) then its boxes' words, this round if there's time
          keep({ slideId: job.slide.id, kind: 'helper', helper: await draftHelper(job.slide, deck) });
          const live = deck.slides.find((x) => x.id === job.slide.id);
          if (live) {
            const view = { id: `${live.id}~helper`, topic: live.topic, elements: helperElements(live) } as Slide;
            for (const el of view.elements) {
              if (needsSay(el)) add({ kind: 'say', slide: view, el, helper: true });
              else if (needsPointers(el)) add({ kind: 'pointers', slide: view, el, helper: true });
            }
          }
          break;
        }
      }
    } catch (e) {
      fail({ say: 'Writing spoken words', plain: 'Writing a plain version', pointers: 'Placing laser marks', check: 'Checking hands-on answers',
        intro: 'Writing a topic introduction', caption: 'Writing a caption', helper: 'Drafting a helper' }[job.kind], e);
    }
  });
  // what each box needs first: a hands-on box waiting for its answer check starts there; otherwise its words,
  // or (words already there) its plain version and marks
  for (const j of jobs(deck, needsAnswerCheck, true)) words.add({ ...j, kind: 'check' });
  for (const j of jobs(deck, (el) => needsSay(el) && !needsAnswerCheck(el), true, true)) words.add({ ...j, kind: 'say' });
  for (const j of jobs(deck, (el) => !needsSay(el) && !needsAnswerCheck(el) && needsPlain(el))) words.add({ ...j, kind: 'plain' });
  for (const j of jobs(deck, (el) => !needsSay(el) && !needsAnswerCheck(el) && needsPointers(el), true)) words.add({ ...j, kind: 'pointers' });
  for (const j of jobs(deck, needsCaption)) words.add({ kind: 'caption', slide: j.slide, el: j.el });
  for (const slide of deck.slides.filter(needsHelper)) words.add({ kind: 'helper', slide });
  // Topics (one call for the whole deck), then the introductions (each written for its topic's name)
  if (deck.slides.some(needsTopic)) {
    words.hold(nameTopics(deck)
      .then((names) => {
        for (const [i, topic] of names) {
          const s = deck.slides[i];
          if (s && needsTopic(s)) keep({ slideId: s.id, kind: 'topic', topic, topicFrom: fingerprint(slideBasis(s)) });
        }
      })
      .catch((e) => fail('Naming topics', e))
      .then(() => { for (let i = 0; i < deck.slides.length; i++) if (needsIntro(deck.slides, i)) words.add({ kind: 'intro', i }); }));
  } else {
    for (let i = 0; i < deck.slides.length; i++) if (needsIntro(deck.slides, i)) words.add({ kind: 'intro', i });
  }
  words.start();

  // 1b. The picture check, alongside: library pictures not used yet, where a slide talks about what one shows.
  //     Suggestions for the editor's Check tab (a person adds them); pictures already suggested for other slides
  //     aren't suggested again
  const toCheck = deck.slides.filter((sl) => needsPictureCheck(deck, sl));
  const pictureTask = toCheck.length && timeFor(PICTURE_TIME_MS) ? (async () => {
    const taken = lessonPictures(deck, false);
    for (const c of Object.values(deck.checks?.pictures ?? {})) for (const pic of c.idea?.pictures ?? []) taken.add(pic.src);
    try {
      const candidates = await pictureCandidates(deck, toCheck, taken);
      const results = await checkPictures(deck, toCheck, candidates, deadline);
      for (const { slide: sl, from, idea, note } of results) keep({ slideId: sl.id, kind: 'pictures', from, at: new Date().toISOString(), idea, ...(note ? { note } : {}) });
    } catch (e) { fail('Checking for pictures', e); }
  })() : Promise.resolve();

  await words.done;

  // 2. Once the words are final: the quiz, the story order and the question bank (whole-lesson reads, started only
  //    with time for them, else the next round), alongside the audio
  const quizTask = needsQuiz(deck) && timeFor(QUIZ_TIME_MS) ? (async () => {
    const from = quizBasis(deck);
    const prev = quizKey(deck.quiz?.questions);
    try {
      const { questions } = await refreshQuiz(structuredClone(deck));
      keep({ slideId: '', kind: 'quiz', from, prev, questions });
    } catch (e) { fail('Writing the quiz', e); }
  })() : Promise.resolve();

  const orderTask = needsOrderCheck(deck) && timeFor(ORDER_TIME_MS) ? (async () => {
    const from = orderBasis(deck);
    const snapshot = structuredClone(deck);
    try {
      const want = await askStoryOrder(snapshot, deck.title);
      const moves = want ? movesFor(snapshot.slides, want.order, want.reword) : [];
      keep({ slideId: '', kind: 'order', from, at: new Date().toISOString(), why: want?.why, moves });
    } catch (e) { fail('Checking the slide order', e); }
  })() : Promise.resolve();

  // The question bank: a topic's questions and answer slides (each topic one long AI write, in parallel)
  const bankTopicsToDo = needsBank(deck);
  const lessonTopics = new Set(deck.slides.map((sl) => sl.topic?.trim()));
  // a topic no longer in the lesson: its questions are cleared (no AI needed)
  for (const topic of bankTopicsToDo.filter((t) => !lessonTopics.has(t))) keep({ slideId: '', kind: 'bank', topic, from: bankBasis(deck, topic), questions: [] });
  const toWrite = bankTopicsToDo.filter((t) => lessonTopics.has(t));
  const taken = usedPictures(deck, toWrite);   // (shared: no two answers get the same picture)
  const bankTask = toWrite.length && timeFor(BANK_TIME_MS) ? Promise.all(toWrite.map(async (topic) => {
    const from = bankBasis(deck, topic);
    try {
      const questions = await writeBankTopic(structuredClone(deck), topic, taken);
      if (questions.length) keep({ slideId: '', kind: 'bank', topic, from, questions });
    } catch (e) { fail('Writing the question bank', e); }
  })) : Promise.resolve();

  // 3. Audio, last: the lesson's spoken words and plain versions (and its topic introductions) now; the bank's
  //    answer slides once the bank is written
  const record = async ({ slide, el, simple, helper, bank }: Job & { simple: boolean }) => {
    try {
      const text = simple ? plainText(el) : spokenText(el);
      const { url, key } = await recordClip(text, simple);
      keep(simple
        ? { slideId: baseId(slide.id), elId: el.id, helper, kind: 'plainAudio', plainAudioUrl: url, plainAudioFor: key }
        : { slideId: baseId(slide.id), elId: el.id, helper, bank, kind: 'audio', audioUrl: url, audioFor: key });
    } catch (e) { fail('Making audio', e); }
  };
  const lessonAudio = pool([
    ...jobs(deck, needsAudio, true).map((j) => ({ ...j, simple: false })),
    ...jobs(deck, needsPlainAudio).map((j) => ({ ...j, simple: true })),
  ], deadline, record);
  const introAudio = pool(deck.slides.map((_, i) => i).filter((i) => needsIntroAudio(deck.slides, i)), deadline, async (i) => {
    const slide = deck.slides[i];
    try {
      const { url, key } = await recordClip(introText(slide), false);
      keep({ slideId: slide.id, kind: 'introAudio', audioUrl: url, audioFor: key });
    } catch (e) { fail('Making audio', e); }
  });
  const bankAudio = bankTask.then(() => pool(
    jobs(deck, needsAudio, false, true).filter((j) => j.bank).map((j) => ({ ...j, simple: false })), deadline, record));

  await Promise.all([lessonAudio, introAudio, bankAudio, pictureTask, quizTask, orderTask]);
  return { patches, errors };
}
