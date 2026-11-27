import { NextResponse } from 'next/server';
import { editorName } from '@/lib/editorAuth';
import { ensureLesson, listLessons, writeDeck } from '@/lib/canvas/store';
import { profileFromOutline, sanitizeOutline } from '@/lib/canvas/outline';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { profileOf } from '@/lib/canvas/profile';
import { isTeacherVoice } from '@/lib/voice';
import { addToKnowledgeBase, ensureKnowledgeBase } from '@/lib/canvas/kbIngest';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST { outline, material? } → { lesson, notes }: the "New lesson" flow's lesson, made from its (edited) outline: the
// lesson, its own knowledge base with the material in it, and its draft holding the profile (no slides yet: the AI
// drafts them next, /api/editor/ai-deck with the outline's sections)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const outline = sanitizeOutline(body.outline);
  if (!outline) return NextResponse.json({ error: 'The outline needs a title and at least one section' }, { status: 400 });
  const material = typeof body.material === 'string' ? body.material.trim().slice(0, 60000) : '';
  const by = await editorName(req);
  const base = outline.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'lesson';
  const taken = new Set((await listLessons()).map((l) => l.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const notes: string[] = [];
  const warning = await ensureLesson({ id, title: outline.title }, by);
  if (warning) notes.push(warning);
  if (!(await ensureKnowledgeBase(id, outline.title, by))) notes.push('No knowledge base list yet (migration 024 not run): the lesson uses its material directly.');
  if (material) {
    try {
      const r = await addToKnowledgeBase(material, `${outline.title} (pasted material)`, id);
      if (r.note) notes.push(r.note);
      else if (r.pieces) notes.push(`Added the material to the lesson’s knowledge base (${r.pieces} pieces).`);
    } catch (e) {
      notes.push(`The material couldn’t be added to the knowledge base (${e instanceof Error ? e.message : String(e)}); the lesson is still made from it.`);
    }
  }
  // The teacher picked in the wizard (a name, a voice): not set, the AI's suggestion or the usual one
  const profile = profileFromOutline(outline, id);
  const teacherName = typeof body.teacher?.name === 'string' ? body.teacher.name.trim().slice(0, 60) : '';
  const voice = isTeacherVoice(body.teacher?.voice) ? body.teacher.voice : undefined;
  if (teacherName || voice) {
    const base = profileOf({ lessonId: id, title: outline.title, profile }).teacher;
    profile.teacher = { ...base, ...(teacherName ? { name: teacherName, signOff: base.signOff.replace(base.name, teacherName), picture: '' } : {}), ...(voice ? { voice } : {}) };
  }
  const deck = sanitizeDeck({ title: outline.title, slides: [], profile }, id, 'hand');
  const failed = await writeDeck(id, 'draft', deck, by);
  if (failed) notes.push(failed);
  return NextResponse.json({ lesson: { id, title: outline.title }, notes });
}
