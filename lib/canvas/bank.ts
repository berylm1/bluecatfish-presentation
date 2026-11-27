import type { BankQuestion, Deck, Slide } from './types';
import { enterProfile } from './lessonContext';
import { profileOf } from './profile';
import { chat, knowledge, STYLE } from './ai';
import { autoFix, formatGuide, imagesFor, markAi, problems, toSlide, type LibImage } from './generate';
import { hasWords } from './pictures';
import { BANK_PER_TOPIC, fingerprint, slideBasis } from './aiFields';
import { spokenText } from './queue';
import { slidesOnly } from '@/lib/study/content';
import { CLASSMATES_ON_SCREEN } from '@/lib/settings';

/*
 * The question bank (Deck.bank): about BANK_PER_TOPIC questions per topic that kids in class might
 * ask, each with its answer as a slide made like the lesson's own (positions, a picture from the
 * library, a chart or diagram, the professor's spoken words; the audio is recorded with the rest
 * by the save-time AI, prepare.ts). Written when the lesson is saved, again for a topic whose
 * slides changed (a person's edited question is kept).
 *
 * In the lesson: a learner's question close to one plays its answer slide at once, and the
 * classmates ask the related ones (app/presentation/page.tsx, /api/bank/match). At a topic's end
 * a classmate can ask one too.
 */

// (what's needed, bankBasis / needsBank, is in aiFields.ts, so the editor can use it too)
const KIND_ASKER = { curious: 'maya', practical: 'leo', checking: 'finn' } as const;

/**
 * Picture addresses already used: in the lesson's slides and helpers, and by bank answers (each picture once).
 * Not the AI answers of `redoing` (topics being written again: theirs are replaced).
 */
export function usedPictures(deck: Deck, redoing: string[] = []): Set<string> {
  const used = new Set<string>();
  const add = (s: Slide) => { for (const e of s.elements) if ((e.type === 'image' || e.type === 'activity') && e.src) used.add(e.src); };
  for (const s of deck.slides) { add(s); if (s.helper) add({ ...s, elements: s.helper.elements }); }
  for (const q of deck.bank?.questions ?? []) if (!q.byAI || !redoing.includes(q.topic)) add(q.slide);
  return used;
}

const QUESTIONS = `${STYLE}
You prepare a lesson's QUESTION BANK for ONE topic: questions {{ages}} year olds might really ask in class after its slides.
Write ${BANK_PER_TOPIC} questions:
- 2 "curious": what a word means, why or how something happens, how big or how many
- 2 "practical": what people can do about it, what it means for {{practical}} or the learner
- 2 "checking": a kid checking they understood ("So does that mean…?", "Wait, is it because…?")
Each: under 16 words, in kid words, different from the others, answered by the SOURCE CONTENT (leave out any it can't answer).
Go a bit beyond what the slides already say, or ask it another way; never just repeat a slide.
Reply as JSON: {"questions":[{"q":"...","kind":"curious|practical|checking"}]}`;

// (CLASSMATES_ON_SCREEN, the lesson on its own) Each question is for one slide, asked while it's up: it has to fit
// what's on the screen. (was QUESTIONS: questions about the topic as a whole, so a classmate asked about eggs on a slide about whiskers)
const QUESTIONS_ON_SCREEN = `${STYLE}
You prepare a lesson's QUESTION BANK for ONE topic: questions {{ages}} year olds might really ask in class, each WHILE ONE OF THE
TOPIC'S SLIDES IS ON THE SCREEN (the slides are numbered below, with their pictures).
Write up to ${BANK_PER_TOPIC} questions, one per slide that has something worth asking about (skip a title or a slide with little on it;
two for a slide only when the topic has fewer slides than that). Each question:
- is about ITS slide: what it says, or what its picture shows. It makes sense to someone looking at that slide right now.
- is one of these, the kind of thing a real kid wonders:
  - a likely mix-up or wrong idea ("Wait, so are they…?"), kind "checking"
  - the difference between two things on the slide, kind "checking" or "curious"
  - a prediction ("What would happen if…?", "So what happens when…?"), kind "practical" or "curious"
  - something in the picture ("Why does it have…?"), kind "curious"
  - what it means for people, {{practical}}, kind "practical"
- NEVER asks for a fact the slide just said (its answer must not be a line read back off the slide), and never repeats another question.
- is under 16 words, in kid words, and answered by the SOURCE CONTENT or the slides (leave out any they can't answer).
Mix the kinds (some of each, when the slides allow).
Reply as JSON: {"questions":[{"q":"...","kind":"curious|practical|checking","slide":1}]}`;

const ANSWER = `${STYLE}
A kid in class asked the question below. Make ONE slide that answers it; the professor shows it and says its spoken words.

${formatGuide({ visuals: true })}

The slide: a short silent title (the answer's idea in under 7 words), and 1 or 2 speaking elements that answer it: short bullet text,
a picture from AVAILABLE IMAGES that really fits, a chart, or a diagram. A chart or diagram when the answer has numbers, steps, a change
over time or a comparison. The FIRST speaking element's "say" answers the question straight away in its first sentence, then explains
(30 to 60 words in all on the slide). No "plain". No hands-on boxes.
Every fact comes from the SOURCE CONTENT or the topic's slides; never invent numbers.
Reply as JSON: {"slide":{"background":"#hex","elements":[...]}}`;

// The study's lesson (lib/study/content.ts slidesOnly): the questions and answers stay inside what its slides teach
const SLIDES_ONLY_SOURCE = '(none: use only WHAT THE TOPIC\'S SLIDES TEACH)';
const QUESTIONS_SLIDES_ONLY = `${STYLE}
You prepare a lesson's QUESTION BANK for ONE topic: questions {{ages}} year olds might really ask in class after its slides.
Write ${BANK_PER_TOPIC} questions:
- 2 "curious": what a word on the slides means, or why or how something on them happens
- 2 "practical": what something on the slides means for people, {{practical}} or the learner
- 2 "checking": a kid checking they understood ("So does that mean…?", "Wait, is it because…?")
Each: under 16 words, in kid words, different from the others, and FULLY answered by WHAT THE TOPIC'S SLIDES TEACH.
Never ask about anything the slides don't teach: no new facts, numbers or examples. Ask about what they teach in another way.
Reply as JSON: {"questions":[{"q":"...","kind":"curious|practical|checking"}]}`;
const ANSWER_SLIDES_ONLY = ANSWER.replace('Every fact comes from the SOURCE CONTENT or the topic\'s slides; never invent numbers.',
  'Every fact comes from WHAT THE TOPIC\'S SLIDES TEACH, and nothing else: no new facts, numbers or examples. Re-explain what the slides say, in other words.');
const FIX = `You fix ONE lesson slide (JSON) so it follows the slide format. Keep its words and pictures; move and resize boxes so nothing
overflows, goes off the slide or overlaps.

${formatGuide({ visuals: true })}

Reply as JSON: {"slide":{"background":"#hex","elements":[...]}}`;

const PICTURES_EACH = 2;   // pictures offered per answer (each picture goes to one answer only)

/**
 * The topic's questions and answer slides: one AI call for the questions, then one per answer slide, in
 * parallel (each a short write, so a topic fits in a save round). The slides' spoken words get their
 * audio afterwards, like any slide.
 */
export async function writeBankTopic(deck: Deck, topic: string,
  /** Pictures taken (usedPictures): shared by topics written at the same time, so no two answers get the same one */
  used: Set<string> = usedPictures(deck, [topic]),
): Promise<BankQuestion[]> {
  enterProfile(profileOf(deck));   // (the AI's instructions: this lesson's teacher and topic)
  const slides = deck.slides.filter((s) => s.topic?.trim() === topic);
  const taught = slides.map((s) => `${slideBasis(s)}\n${s.elements.map(spokenText).filter(Boolean).join(' ')}`).join('\n---\n').slice(0, 6000);
  // (the study's lesson: its slides only, never the knowledge base, so the classmates re-explain and don't teach more)
  const only = slidesOnly(deck.lessonId);
  const facts = only ? SLIDES_ONLY_SOURCE : await knowledge(`${deck.title} ${topic}: details, reasons, numbers, what people do`, 15);
  // (the lesson on its own, CLASSMATES_ON_SCREEN: each question for one slide, which is numbered with its pictures)
  const onScreen = CLASSMATES_ON_SCREEN && !only;
  const numbered = slides.map((s, n) => {
    const pics = s.elements.filter((e) => e.type === 'image' && e.alt?.trim()).map((e) => (e.type === 'image' ? e.alt : '')).join('; ');
    return `SLIDE ${n + 1}: ${slideBasis(s)}\n${s.elements.map(spokenText).filter(Boolean).join(' ')}${pics ? `\n[its picture: ${pics}]` : ''}`;
  }).join('\n---\n').slice(0, 7000);
  const out = JSON.parse(await chat(onScreen ? QUESTIONS_ON_SCREEN : only ? QUESTIONS_SLIDES_ONLY : QUESTIONS,
    `Lesson: ${deck.title}\nTOPIC: ${topic}\n\n${onScreen ? `THE TOPIC'S SLIDES:\n${numbered}` : `WHAT THE TOPIC'S SLIDES TEACH:\n${taught}`}\n\nSOURCE CONTENT:\n${facts || '(none found)'}`, true, 1500));
  const asks = (Array.isArray(out?.questions) ? out.questions : [])
    .filter((x: any) => typeof x?.q === 'string' && x.q.trim()).slice(0, BANK_PER_TOPIC)
    .map((x: any) => ({ q: String(x.q).trim().slice(0, 200), kind: x.kind as keyof typeof KIND_ASKER,
      anchor: onScreen && Number.isInteger(x.slide) ? slides[x.slide - 1]?.id : undefined }));
  if (!asks.length) return [];

  // Pictures per question, each picture to one answer only, and none the lesson already uses
  const found: LibImage[][] = await Promise.all(asks.map((a: { q: string }) => imagesFor(`${topic}: ${a.q}`, 6)));
  const offered = found.map((list) => {
    const mine = list.filter((i) => !used.has(i.url) && !hasWords(i.description ?? '')).slice(0, PICTURES_EACH);   // (just visuals: no words in them)
    for (const i of mine) used.add(i.url);
    return mine.map((i, n) => ({ ...i, id: `img${n + 1}` }));
  });

  const stamp = fingerprint(`${topic}|${Date.now()}`).slice(0, 6);
  const made = await Promise.all(asks.map(async (a: { q: string; kind: keyof typeof KIND_ASKER; anchor?: string }, n: number): Promise<BankQuestion | null> => {
    const id = `bank-${stamp}-${n}`;
    const images: LibImage[] = offered[n];
    const list = images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none: use text, a chart or a diagram)';
    try {
      let raw = JSON.parse(await chat(only ? ANSWER_SLIDES_ONLY : ANSWER,
        `Lesson: ${deck.title}\nTOPIC: ${topic}\nQUESTION: ${a.q}\n\nWHAT THE TOPIC'S SLIDES TEACH:\n${taught.slice(0, 3000)}\n\nAVAILABLE IMAGES:\n${list}\n\nSOURCE CONTENT:\n${facts || '(none found)'}`,
        true, 3000)).slide;
      let slide = toSlide(raw, topic, images, `${id}-s`);
      const issues = problems(raw, slide, images);
      if (issues.length) {
        // one fix (time allows at save), then the automatic fixes
        try {
          const fixed = JSON.parse(await chat(FIX, `PROBLEMS: ${issues.join('; ')}\n\nAVAILABLE IMAGES:\n${list}\n\nSLIDE:\n${JSON.stringify(raw)}`, true, 3000)).slide;
          if (fixed?.elements?.length) { raw = fixed; slide = toSlide(raw, topic, images, `${id}-s`); }
        } catch { /* kept as it was */ }
      }
      if (!slide.elements.some((e) => !e.silent && e.say?.trim())) return null;   // nothing said: no answer
      autoFix(slide);
      markAi(slide);
      return { id, topic, q: a.q, asker: KIND_ASKER[a.kind] ?? 'maya', slide, byAI: true, ...(a.anchor ? { anchor: a.anchor } : {}) };
    } catch {
      return null;   // this one failed: the others still count
    }
  }));
  return made.filter((q): q is BankQuestion => !!q);
}
