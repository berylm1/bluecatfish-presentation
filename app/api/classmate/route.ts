import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { getValue, setValue } from '@/src/redisClient';
import { chat } from '@/lib/canvas/ai';
import { CLASSMATE_NAME } from '@/lib/voice';

/*
 * Finn, the AI classmate: one short question for the professor about what
 * was just taught, the kind a kid who's a bit lost (or shy) would ask. The
 * professor then answers it like any question.
 * mistake: Finn gets something wrong on purpose ("So catfish breathe air, right?")
 * and the learner gets to catch it; `truth` is what's actually right, for the professor.
 *   POST { topic?, slideText, asked?: string[], mistake?: boolean } → { question, truth? } | { question: null }
 * Kept per slide (and per question already asked), so it's instant next time.
 */

const SYSTEM =
  `You are ${CLASSMATE_NAME}, a curious, friendly 12 year old in a class about the blue catfish invasion of the Chesapeake Bay. ` +
  'The teacher, Professor Marine, just taught the slide below. Ask ONE question out loud, the kind a classmate who is a bit lost ' +
  'or curious would ask about it: what a word means, why something happens, how big or how many, what happens next. ' +
  'Start with "Professor Marine," and keep it under 20 words, in kid words. Never ask something already asked, never answer it yourself, ' +
  'nothing off topic or silly. Reply with only the question.';

const MISTAKE_SYSTEM =
  `You are ${CLASSMATE_NAME}, a friendly 12 year old in a class about the blue catfish invasion of the Chesapeake Bay. ` +
  'The teacher, Professor Marine, just taught the slide below. Say ONE thing that is WRONG about it, on purpose, so your classmate ' +
  'can catch the mistake: a common mix-up a kid could really make (a number too big or small, cause and effect swapped, the wrong ' +
  'animal or place), that the slide clearly shows is wrong. Not silly, not mean, nothing scary. Say it as checking with the teacher: ' +
  'start with "Professor Marine, so" and end with "right?", under 22 words, in kid words. Never repeat something already asked.\n' +
  'Reply as JSON: {"question": "...", "truth": "what is actually right, one short sentence"}';

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'classmate');
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? '').slice(0, 200);
  const slideText = String(body.slideText ?? '').slice(0, 2000);
  const asked = (Array.isArray(body.asked) ? body.asked : []).slice(-6).map((q: unknown) => String(q).slice(0, 300));
  const mistake = body.mistake === true;
  if (!slideText.trim()) return NextResponse.json({ question: null });

  if (mistake) {
    const mkey = `classmate:mistake:v1:${createHash('sha1').update(`${topic}|${slideText}|${asked.join('|')}`).digest('hex').slice(0, 16)}`;
    const hit = await getValue(mkey);
    if (hit) { try { return NextResponse.json(JSON.parse(hit)); } catch { /* old or broken: write it again */ } }
    try {
      const raw = JSON.parse(await chat(MISTAKE_SYSTEM, `Topic: ${topic || '(none)'}\nSlide: ${slideText}\nAlready asked: ${asked.join(' | ') || '(nothing)'}`, true, 400));
      const q = String(raw?.question ?? '').replace(/^["']|["']$/g, '').trim().slice(0, 200);
      const truth = String(raw?.truth ?? '').trim().slice(0, 300);
      if (!q || !/\?$/.test(q) || !truth) return NextResponse.json({ question: null });
      const out = { question: q, truth };
      await setValue(mkey, JSON.stringify(out));
      return NextResponse.json(out);
    } catch (e) {
      console.error('classmate mistake error:', e instanceof Error ? e.message : e);
      return NextResponse.json({ question: null });
    }
  }

  const key = `classmate:v1:${createHash('sha1').update(`${topic}|${slideText}|${asked.join('|')}`).digest('hex').slice(0, 16)}`;
  const cached = await getValue(key);
  if (cached) return NextResponse.json({ question: cached });
  try {
    const q = (await chat(SYSTEM, `Topic: ${topic || '(none)'}\nSlide: ${slideText}\nAlready asked: ${asked.join(' | ') || '(nothing)'}`, false, 300))
      .replace(/^["']|["']$/g, '').trim().slice(0, 200);
    if (!q || !/\?$/.test(q)) return NextResponse.json({ question: null });   // not a question: skip rather than say something odd
    await setValue(key, q);
    return NextResponse.json({ question: q });
  } catch (e) {
    console.error('classmate error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ question: null });
  }
}
