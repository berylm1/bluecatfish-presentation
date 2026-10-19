import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { getValue, setValue } from '@/src/redisClient';
import { chat } from '@/lib/canvas/ai';
import { formatGuide } from '@/lib/canvas/generate';
import { sanitizeDeck } from '@/lib/canvas/sanitize';
import { autoFix } from '@/lib/canvas/generate';
import type { Slide } from '@/lib/canvas/types';

/*
 * A slide made on the spot for a learner's question that the question bank doesn't answer: from the
 * lesson's ready-made parts (lib/canvas/parts.ts: its text boxes, pictures, charts and diagrams,
 * numbered T1, P1, V1…). The AI only picks parts by number and places them (plus a short title), so
 * the reply is short and quick, and every fact on the slide is one the lesson already shows. Then the
 * quick automatic fixes (no retry). The professor's live answer is said while it's up.
 *   POST { question, parts: [{ id, kind, about, el }], questions?: string[] } → { slide } | { slide: null }
 * questions: several questions answered together on the one slide (the learner's and the classmates'),
 * one after another: something shown for each.
 * Kept per question and parts (the same question in the same lesson = the same slide).
 */

export const maxDuration = 20;

const PICK_MAX = 14;   // parts the AI chooses from (the closest to the question)
const PICK_MAX_TOGETHER = 24;   // (several questions: more to choose from)

const SYSTEM = `You build ONE slide that helps answer a learner's question (10-14 year olds), from READY-MADE PARTS of the lesson.
Each part has an id (T = text box, P = picture, V = chart or diagram) and says what it is.
Pick 2 to 4 parts that together show the answer, and place them on the slide. You may add ONE short title (under 7 words)
naming the idea. Never write other text: everything else comes from the parts. Leave room for the title at the top.
Text parts must be big enough for their words; pictures and visuals at least 30 wide. Nothing overlaps, nothing goes off the slide.
If no part helps answer the question, reply {"slide": null}.

${formatGuide()}

Reply as JSON: {"slide": {"title": "...", "place": [{"part": "P2", "x": 0, "y": 0, "w": 0, "h": 0}]}}`;

const TOGETHER = `
SEVERAL QUESTIONS are answered on this ONE slide, one after another (the professor answers each in turn while it's up).
Show something for EACH question: 3 to 6 parts in all, arranged so each answer has its own area, in the questions' order
(left to right, then top to bottom). The title names what they have in common.`;

const cache = new Map<string, number[]>();
async function embedMany(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: inputs }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Embedding failed (${res.status})`);
  return ((await res.json()).data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

type Part = { id: string; kind: string; about: string; el: any };

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'board');
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const parts: Part[] = (Array.isArray(body.parts) ? body.parts : []).slice(0, 160)
    .filter((p: any) => /^[TPV]\d{1,3}$/.test(String(p?.id)) && typeof p?.about === 'string' && p?.el && typeof p.el === 'object')
    .map((p: any) => ({ id: p.id, kind: String(p.kind), about: p.about.replace(/\s+/g, ' ').slice(0, 300), el: p.el }));
  if (!question || parts.length < 2) return NextResponse.json({ slide: null });
  const questions: string[] = (Array.isArray(body.questions) ? body.questions : []).slice(0, 5).map((q: unknown) => String(q).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean);
  const together = questions.length > 1;

  const key = `compose:v1:${createHash('sha1').update(`${question.toLowerCase()}|${questions.join('|')}|${parts.map((p) => `${p.id}:${p.about}`).join('|')}`).digest('hex').slice(0, 16)}`;
  const cached = await getValue(key);
  if (cached) return NextResponse.json({ slide: JSON.parse(cached) });

  try {
    // The parts closest to the question (by meaning), so the AI reads a short list
    let pick = parts;
    const most = together ? PICK_MAX_TOGETHER : PICK_MAX;
    if (parts.length > most) {
      if (cache.size > 4000) cache.clear();
      const missing = [...new Set(parts.map((p) => p.about).filter((a) => !cache.has(a)))];
      const vectors = await embedMany([question, ...missing]);
      missing.forEach((a, i) => cache.set(a, vectors[i + 1]));
      pick = parts.map((p) => ({ p, s: cosine(vectors[0], cache.get(p.about)!) })).sort((a, b) => b.s - a.s).slice(0, most).map((x) => x.p);
    }
    const out = JSON.parse(await chat(together ? SYSTEM + TOGETHER : SYSTEM,
      `${together ? `Questions, in order:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : `Question: ${question}`}\n\nPARTS:\n${pick.map((p) => `${p.id} (${p.kind === 'text' ? 'text box' : p.kind}): ${p.about}`).join('\n')}`, true, 700));
    const slide = build(out?.slide, pick, together ? 6 : 4);
    await setValue(key, JSON.stringify(slide));   // ("nothing helps" is kept too)
    return NextResponse.json({ slide });
  } catch (e) {
    console.error('compose error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ slide: null });
  }
}

/** The AI's picks → a clean, silent slide (the parts as they are in the lesson, where it put them), or null */
function build(raw: any, parts: Part[], most: number): Slide | null {
  if (!raw || !Array.isArray(raw.place)) return null;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const used = new Set<string>();
  const elements: any[] = [];
  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (title) elements.push({ id: 'spot-title', type: 'text', text: title, style: 'title', x: 5, y: 4, w: 90, h: 13, color: '#0f172a', bold: true, silent: true });
  for (const pl of raw.place.slice(0, most)) {
    const p = byId.get(String(pl?.part));
    if (!p || used.has(p.id)) continue;
    used.add(p.id);
    const { say: _s, plain: _p, audioUrl: _a, plainAudioUrl: _pa, pointers: _ptr, queue: _q, ...el } = p.el;
    elements.push({
      ...el, id: `spot-${p.id}`, silent: true, z: 1,
      x: Number(pl.x), y: Number(pl.y), w: Number(pl.w), h: Number(pl.h),
      // (from a slide with another background: dark text on this light one)
      ...(el.type === 'text' ? { color: '#0f172a' } : {}),
    });
  }
  if (elements.length - (title ? 1 : 0) < 1) return null;
  try {
    const deck = sanitizeDeck({ slides: [{ id: 'spot', background: { color: '#f8fafc' }, elements }] }, 'spot', 'ai');
    const slide = deck.slides[0];
    autoFix(slide);
    return slide;
  } catch {
    return null;
  }
}
