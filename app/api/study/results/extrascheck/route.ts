import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';
import { chat } from '@/lib/canvas/ai';
import { readSaved } from '@/lib/canvas/saved';
import { readDeck } from '@/lib/canvas/store';
import { lessonText } from '@/lib/canvas/lessonText';
import { shownWords, spokenText } from '@/lib/canvas/queue';
import { STUDY_LESSON } from '@/lib/study/content';
import { getStudyVersion } from '@/lib/study/version';
import type { Deck, SlideElement } from '@/lib/canvas/types';

export const maxDuration = 120;

/*
 * "Check the extras against the slides" (/studyResults, "Ready for the study?"; editors only: under /api/study/results in
 * lib/editorAuth.ts). The study's lesson (its frozen version, else live, else its draft): everything only some learners
 * get (the classmates' questions and the answer slides the professor shows, the helper slides) read against its base
 * slides, for any fact the base slides don't teach. Re-wording and simpler words are fine; a new fact isn't: it would
 * teach one group more than the other.
 *   POST → { lesson, slides, extras, results: [{ id, kind, where, label, added: string[] }] }   (added: [] = fine)
 */
type Extra = { id: string; kind: 'bank' | 'helper'; where: string; label: string; text: string };
const BATCH = 12;
const words = (els: SlideElement[]) => els.map((el) => [shownWords(el), el.silent ? '' : spokenText(el)].filter(Boolean).join(' / ')).filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 1200);

function extrasOf(deck: Deck): Extra[] {
  const out: Extra[] = [];
  if (!deck.bank?.off) {
    for (const q of deck.bank?.questions ?? []) {
      const at = deck.slides.findIndex((s) => s.topic?.trim() === q.topic) + 1;
      out.push({ id: `bank:${q.id}`, kind: 'bank', where: at ? `topic “${q.topic}” (from slide ${at})` : `topic “${q.topic}”`, label: q.q, text: `QUESTION: ${q.q}\nANSWER SLIDE: ${words(q.slide.elements)}` });
    }
  }
  deck.slides.forEach((s, i) => {
    if (s.helper?.elements?.length) out.push({ id: `helper:${s.id}`, kind: 'helper', where: `slide ${i + 1}`, label: `Helper slide (“another way to see it”) for slide ${i + 1}`, text: words(s.helper.elements) });
  });
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  try {
    const version = await getStudyVersion();
    const frozen = version.slug ? await readSaved(STUDY_LESSON, version.slug) : null;
    const live = frozen ? null : await readDeck(STUDY_LESSON, 'live');
    const deck = frozen ?? (live?.slides?.length ? live : await readDeck(STUDY_LESSON, 'draft'));
    if (!deck?.slides?.length) return NextResponse.json({ error: 'The study’s lesson has no slides yet: create it first' }, { status: 400 });
    const lesson = lessonText(deck);
    const extras = extrasOf(deck);
    const batches: Extra[][] = [];
    for (let i = 0; i < extras.length; i += BATCH) batches.push(extras.slice(i, i + BATCH));
    const found = new Map<string, string[]>();
    await Promise.all(batches.map(async (batch) => {
      const out = JSON.parse(await chat(
        'You check the EXTRAS of a lesson for a study: things only some learners see (a classmate\'s question with the answer slide the ' +
          'professor shows, or a slide explaining something "another way"). They may re-word, simplify, give a picture of, or ask about what ' +
          'THE LESSON\'s slides teach. They must NOT teach anything else. For each extra, list every fact it adds that the lesson\'s slides ' +
          'do not teach: a new claim, number, name, place, cause or example. Not a re-wording, a simpler word, or a question. ' +
          'Each in under 15 words. None: an empty list. Reply as JSON: {"results":[{"id":"...","added":["..."]}]}',
        `THE LESSON (its slides)\n${lesson}\n\nEXTRAS\n${batch.map((e) => `[${e.id}]\n${e.text}`).join('\n\n')}`,
        true,
        3000,
      ));
      for (const r of Array.isArray(out?.results) ? out.results : []) {
        if (typeof r?.id === 'string' && batch.some((e) => e.id === r.id)) found.set(r.id, (Array.isArray(r.added) ? r.added : []).filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).map((x: string) => x.trim().slice(0, 200)).slice(0, 6));
      }
    }));
    const results = extras.map((e) => ({ id: e.id, kind: e.kind, where: e.where, label: e.label.slice(0, 200), added: found.get(e.id) ?? null }));
    return NextResponse.json({
      lesson: frozen ? version.name : live?.slides?.length ? 'the live study lesson (not frozen yet)' : 'the study lesson’s draft (not published yet)',
      slides: deck.slides.length, extras: extras.length, results,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
