import { NextResponse } from 'next/server';
import { backupDeck, ensureLesson, listLessons, readDeck } from '@/lib/canvas/store';
import { listSaved, readSaved } from '@/lib/canvas/saved';
import { backupFile, backupPath } from '@/lib/canvas/backup';
import { storedHere } from '@/lib/canvas/aiFields';
import type { Deck, SlideElement } from '@/lib/canvas/types';

export const maxDuration = 120;

/*
 * Every lesson in Redis, copied into Supabase (editors only: the gate in proxy.ts covers /api/editor/*):
 * its draft and live decks into canvas_decks, and every version as a file in its folder of the
 * lesson-backups bucket (lib/canvas/backup.ts). Nothing in Redis changes. Safe to run again.
 * Also lists the pictures that pointed at the deleted Supabase project, slide by slide, to upload again.
 */
type Lost = { lesson: string; slide: number; topic: string; where: string; alt: string; file: string };

function lostPictures(lesson: string, deck: Deck): Lost[] {
  const out: Lost[] = [];
  const file = (src: string) => decodeURIComponent(src.split('/').pop() ?? src).slice(0, 120);
  const look = (els: SlideElement[] | undefined, slide: number, topic: string, where: string) => {
    for (const e of els ?? []) if (e.type === 'image' && e.src && !storedHere(e.src)) out.push({ lesson, slide, topic, where, alt: (e.alt ?? '').slice(0, 160), file: file(e.src) });
  };
  deck.slides.forEach((s, i) => {
    const topic = s.topic?.trim() ?? '';
    look(s.elements, i + 1, topic, 'slide');
    if (s.background?.image && !storedHere(s.background.image)) out.push({ lesson, slide: i + 1, topic, where: 'background', alt: '', file: file(s.background.image) });
    look(s.helper?.elements, i + 1, topic, 'helper (when lost)');
  });
  for (const q of deck.bank?.questions ?? []) {
    const n = deck.slides.findIndex((s) => s.topic?.trim() === q.topic) + 1;
    look(q.slide?.elements, n, q.topic, `answer slide: "${q.q.slice(0, 60)}"`);
  }
  return out;
}

export async function POST() {
  const done: { lesson: string; copied: string[] }[] = [];
  const problems: string[] = [];
  const lost: Lost[] = [];
  let audioToRemake = 0;
  for (const lesson of await listLessons()) {
    const copied: string[] = [];
    const warn = await ensureLesson(lesson);
    if (warn) problems.push(`${lesson.id}: ${warn}`);
    const decks: Partial<Record<'draft' | 'live', Deck>> = {};
    for (const kind of ['draft', 'live'] as const) {
      const deck = await readDeck(lesson.id, kind);
      if (!deck?.slides?.length) continue;
      decks[kind] = deck;
      const w = await backupDeck(lesson.id, kind, deck);
      if (w) problems.push(`${lesson.id} ${kind}: ${w}`);
      else copied.push(kind);
    }
    // the pictures to upload again: in the version learners see (else the draft); the recordings: in the draft (the next save)
    const seen = decks.live ?? decks.draft;
    if (seen) lost.push(...lostPictures(lesson.id, seen));
    for (const s of decks.draft?.slides ?? []) for (const e of s.elements) if ((e.audioUrl && !storedHere(e.audioUrl)) || (e.plainAudioUrl && !storedHere(e.plainAudioUrl))) audioToRemake++;
    for (const v of await listSaved(lesson.id)) {
      const deck = await readSaved(lesson.id, v.slug);
      if (!deck) continue;
      const w = await backupFile(backupPath.saved(lesson.id, v.slug), deck);
      if (w) problems.push(w);
      else copied.push(`saved: ${v.name}`);
    }
    done.push({ lesson: lesson.id, copied });
  }
  return NextResponse.json({ lessons: done, problems, lostPictures: lost, boxesToRecordAgain: audioToRemake }, { headers: { 'Cache-Control': 'no-store' } });
}
