import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { getValue, setValue } from '@/src/redisClient';
import { chat, knowledge, STYLE } from '@/lib/canvas/ai';
import { formatGuide, imagesFor, problems } from '@/lib/canvas/generate';
import { toBoard } from '@/lib/canvas/board';

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
A learner (10-14) asked a question during the lesson. While you answer out loud, you can DRAW a quick board that the slide turns into.
Draw only when a picture of the answer really helps: comparing sizes or numbers, a change over time, a few steps, cause and effect,
what eats what. Otherwise reply {"board": null}. Facts only from the knowledge base or the slide; never invent numbers.

A board has 2 to 5 elements, all "silent": true (your spoken answer comes separately):
- a short title (under 7 words) naming the idea,
- and some of: a bar chart, a big number with a label, short text boxes (under 8 words each; "→" works as an arrow), one picture.
Bar chart element: {"type":"chart","x":..,"y":..,"w":..,"h":..,"bars":[{"label":"Blue catfish","value":100},{"label":"You","value":90}],"unit":"lbs","silent":true}
(2-5 bars, short labels; leave room: h at least 40). Keep it simple and big: this is a board for kids, not a report.

${formatGuide()}

Reply as JSON: {"board": {"background": "#hex", "elements": [ ... ]}} or {"board": null}`;

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'board');
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? '').trim().slice(0, 500);
  const topic = String(body.topic ?? '').slice(0, 200);
  const slideText = String(body.slideText ?? '').slice(0, 1500);
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });

  const key = `board:v1:${createHash('sha1').update(`${question.toLowerCase()}|${topic}|${slideText}`).digest('hex').slice(0, 16)}`;
  const cached = await getValue(key);
  if (cached) return NextResponse.json({ board: JSON.parse(cached) });

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
