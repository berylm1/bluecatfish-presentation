import { NextResponse } from 'next/server';
import { cacheTag, lessonOf } from '@/lib/canvas/lessonProfiles';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { createHash } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { getValue, setValue } from '@/src/redisClient';
import { chat, knowledge, STYLE } from '@/lib/canvas/ai';
import { formatGuide, imagesFor, problems } from '@/lib/canvas/generate';
import { toBoard } from '@/lib/canvas/board';
import { dropOverlaps } from '@/lib/canvas/checks';
import { VISUALS_GUIDE } from '@/lib/canvas/visualGuide';

/*
 * The professor draws while answering: for a question that a quick drawing
 * helps (a comparison, a size, numbers over time, steps, what eats what), a
 * small board in the canvas format that the slide morphs into while the
 * answer is spoken. { board: null } when words are enough.
 *   POST { question, topic?, slideText? }
 * Boards are kept (same question on the same slide = same board).
 */

export const maxDuration = 30;

const SYSTEM = `${STYLE}
A learner ({{ages}}) asked a question during the lesson. While you answer out loud, you can DRAW a quick board that the slide turns into.
Draw only when a picture of the answer really helps: comparing sizes or numbers, a change over time, a few steps, cause and effect,
what eats what. Otherwise reply {"board": null}. Facts only from the knowledge base or the slide; never invent numbers.

A board has 2 to 5 elements, all "silent": true (your spoken answer comes separately):
- a short title (under 7 words) naming the idea,
- and ONE main visual that fits the question best: a chart (bar, line or pie) or a diagram (steps, cycle, timeline, compare, sizes),
  or a big number with a label, or one picture; plus at most one or two short text boxes (under 8 words each).
  Pick by the question: how big / how many → bar or sizes; over time → line or timeline; how it happens → steps; goes round → cycle;
  this vs that → compare; parts of a whole → pie.
${VISUALS_GUIDE}
Keep it simple and big: this is a board for kids, not a report.

${formatGuide()}

Reply as JSON: {"board": {"background": "#hex", "elements": [ ... ]}} or {"board": null}`;

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'board');
  if (limited) return limited;
  // (the lesson asking: its profile fills the AI's instructions, lib/canvas/lessonContext.ts)
  enterProfile(await lessonOf(req));
  const body = await req.json().catch(() => null) ?? {};
  const question = String(body.question ?? '').trim().slice(0, 500);
  const topic = String(body.topic ?? '').slice(0, 200);
  const slideText = String(body.slideText ?? '').slice(0, 1500);
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });

  // (the lesson in the key: was without it, and boards made before the lesson fix used blue catfish's sources)
  const key = `board:v2:${cacheTag(req)}${createHash('sha1').update(`${question.toLowerCase()}|${topic}|${slideText}`).digest('hex').slice(0, 16)}`;
  const cached = await getValue(key);
  if (cached) {
    // (kept from before the no-overlap rule: tidied the same way)
    const board = JSON.parse(cached);
    if (Array.isArray(board?.elements)) board.elements = dropOverlaps(board.elements);
    return NextResponse.json({ board });
  }

  try {
    const [facts, images] = await Promise.all([knowledge(`${topic} ${question}`, 5), imagesFor(`${topic} ${question}`.slice(0, 500), 8)]);
    const user = `Question: ${question}\nTopic: ${topic || '(none)'}\nOn the slide: ${slideText || '(nothing)'}\n\n` +
      `AVAILABLE IMAGES:\n${images.map((i) => `${i.id}: ${i.description}`).join('\n') || '(none)'}\n\nKnowledge base excerpts:\n${facts || '(none found)'}`;
    let raw = JSON.parse(await chat(SYSTEM, user, true, 2500));
    let board = toBoard(raw, images);
    if (board) {
      const issues = problems(raw.board, board, images);
      if (issues.length) {
        raw = JSON.parse(await chat(SYSTEM, `${user}\n\nYour board had problems, fix them:\n- ${issues.join('\n- ')}\nPrevious answer: ${JSON.stringify(raw).slice(0, 3000)}`, true, 2500));
        board = toBoard(raw, images) ?? board;
      }
    }
    await setValue(key, JSON.stringify(board));   // "no drawing" is kept too
    return NextResponse.json({ board });
  } catch (e) {
    console.error('board error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ board: null });
  }
}
