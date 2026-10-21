import type { BankQuestion, Deck, Slide } from './types';
import { chat, knowledge, STYLE } from './ai';
import { autoFix, formatGuide, imagesFor, markAi, problems, toSlide, type LibImage } from './generate';
import { hasWords } from './pictures';
import { BANK_PER_TOPIC, fingerprint, slideBasis } from './aiFields';
import { spokenText } from './queue';

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
You prepare a lesson's QUESTION BANK for ONE topic: questions 10-14 year olds might really ask in class after its slides.
Write ${BANK_PER_TOPIC} questions:
- 2 "curious": what a word means, why or how something happens, how big or how many
- 2 "practical": what people can do about it, what it means for fishermen, food, the Bay or the learner
- 2 "checking": a kid checking they understood ("So does that mean…?", "Wait, is it because…?")
Each: under 16 words, in kid words, different from the others, answered by the SOURCE CONTENT (leave out any it can't answer).
Go a bit beyond what the slides already say, or ask it another way; never just repeat a slide.
Reply as JSON: {"questions":[{"q":"...","kind":"curious|practical|checking"}]}`;

const ANSWER = `${STYLE}
A kid in class asked the question below. Make ONE slide that answers it; the professor shows it and says its spoken words.

${formatGuide({ visuals: true })}

The slide: a short silent title (the answer's idea in under 7 words), and 1 or 2 speaking elements that answer it: short bullet text,
a picture from AVAILABLE IMAGES that really fits, a chart, or a diagram. A chart or diagram when the answer has numbers, steps, a change
over time or a comparison. The FIRST speaking element's "say" answers the question straight away in its first sentence, then explains
(30 to 60 words in all on the slide). No "plain". No hands-on boxes.
Every fact comes from the SOURCE CONTENT or the topic's slides; never invent numbers.
Reply as JSON: {"slide":{"background":"#hex","elements":[...]}}`;

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
  const slides = deck.slides.filter((s) => s.topic?.trim() === topic);
  const taught = slides.map((s) => `${slideBasis(s)}\n${s.elements.map(spokenText).filter(Boolean).join(' ')}`).join('\n---\n').slice(0, 6000);
  const facts = await knowledge(`${deck.title} ${topic}: details, reasons, numbers, what people do`, 15);
  const out = JSON.parse(await chat(QUESTIONS, `Lesson: ${deck.title}\nTOPIC: ${topic}\n\nWHAT THE TOPIC'S SLIDES TEACH:\n${taught}\n\nSOURCE CONTENT:\n${facts || '(none found)'}`, true, 1500));
  const asks = (Array.isArray(out?.questions) ? out.questions : [])
    .filter((x: any) => typeof x?.q === 'string' && x.q.trim()).slice(0, BANK_PER_TOPIC)
    .map((x: any) => ({ q: String(x.q).trim().slice(0, 200), kind: x.kind as keyof typeof KIND_ASKER }));
  if (!asks.length) return [];

  // Pictures per question, each picture to one answer only, and none the lesson already uses
  const found: LibImage[][] = await Promise.all(asks.map((a: { q: string }) => imagesFor(`${topic}: ${a.q}`, 6)));
  const offered = found.map((list) => {
    const mine = list.filter((i) => !used.has(i.url) && !hasWords(i.description ?? '')).slice(0, PICTURES_EACH);   // (just visuals: no words in them)
    for (const i of mine) used.add(i.url);
    return mine.map((i, n) => ({ ...i, id: `img${n + 1}` }));
  });

  const stamp = fingerprint(`${topic}|${Date.now()}`).slice(0, 6);
  const made = await Promise.all(asks.map(async (a: { q: string; kind: keyof typeof KIND_ASKER }, n: number): Promise<BankQuestion | null> => {
    const id = `bank-${stamp}-${n}`;
    const images: LibImage[] = offered[n];
    const list = images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none: use text, a chart or a diagram)';
    try {
      let raw = JSON.parse(await chat(ANSWER,
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
      return { id, topic, q: a.q, asker: KIND_ASKER[a.kind] ?? 'maya', slide, byAI: true };
    } catch {
      return null;   // this one failed: the others still count
    }
  }));
  return made.filter((q): q is BankQuestion => !!q);
}
