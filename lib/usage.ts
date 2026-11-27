import { addToCounters, getCounters } from '@/src/redisClient';

/*
 * How much AI a lesson has used: every call to OpenAI made for a lesson (lib/canvas/ai.ts openai(), the read-aloud
 * route) adds its size to the lesson's running totals in Redis. The editor shows them with an ESTIMATE in dollars.
 *
 * The estimate is only as good as the prices below: set them to your account's (per million tokens / characters) with
 * the AI_PRICE_IN, AI_PRICE_OUT and AI_PRICE_VOICE environment variables. Your OpenAI bill is the real number.
 */

const num = (v: string | undefined, dflt: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : dflt);
export const AI_PRICES = {
  /** $ per million tokens sent (instructions, slides, sources) */
  input: num(process.env.AI_PRICE_IN, 1.25),
  /** $ per million tokens written back (including the model's thinking) */
  output: num(process.env.AI_PRICE_OUT, 10),
  /** $ per million characters spoken (about 1.5 cents a minute of speech) */
  voice: num(process.env.AI_PRICE_VOICE, 17),
  /** $ per million tokens of text turned into search numbers (embeddings) */
  search: 0.02,
};

export type AiUsage = { calls: number; tokensIn: number; tokensOut: number; voiceChars: number; searchTokens: number };
const key = (lesson: string) => `ai-usage:${lesson}`;
const clean = (lesson: string | undefined) => (lesson && /^[a-z0-9][a-z0-9-]{0,60}$/.test(lesson) ? lesson : 'blue-catfish');

/** Adds to a lesson's totals. Never throws and never takes long: a busy or unreachable Redis is given up on. */
export async function addUsage(lesson: string | undefined, add: Partial<AiUsage>): Promise<void> {
  try {
    await Promise.race([addToCounters(key(clean(lesson)), { calls: 1, ...add }), new Promise((r) => setTimeout(r, 300))]);
  } catch { /* the lesson goes on */ }
}

export async function readUsage(lesson: string): Promise<AiUsage & { dollars: number }> {
  const c = await getCounters(key(clean(lesson)));
  const u: AiUsage = { calls: c.calls ?? 0, tokensIn: c.tokensIn ?? 0, tokensOut: c.tokensOut ?? 0, voiceChars: c.voiceChars ?? 0, searchTokens: c.searchTokens ?? 0 };
  const dollars = (u.tokensIn * AI_PRICES.input + u.tokensOut * AI_PRICES.output + u.voiceChars * AI_PRICES.voice + u.searchTokens * AI_PRICES.search) / 1e6;
  return { ...u, dollars: Math.round(dollars * 100) / 100 };
}

/**
 * What one OpenAI call used, from what was sent and what came back. (res is read from a copy: the caller still gets
 * the whole answer.) A streamed answer doesn't say its size: what was sent is counted by its length.
 */
export async function usageOf(path: string, body: unknown, res: Response): Promise<Partial<AiUsage> | null> {
  if (!res.ok) return null;
  let sent: { input?: unknown; stream?: unknown } = {};
  try { sent = typeof body === 'string' ? JSON.parse(body) : {}; } catch { /* not JSON */ }
  if (path === 'audio/speech') return { voiceChars: typeof sent.input === 'string' ? sent.input.length : 0 };
  if (sent.stream === true) return { tokensIn: Math.round((typeof body === 'string' ? body.length : 0) / 4) };
  try {
    const usage = (await res.clone().json())?.usage;
    if (!usage) return null;
    if (path === 'embeddings') return { searchTokens: Number(usage.total_tokens) || 0 };
    return { tokensIn: Number(usage.prompt_tokens) || 0, tokensOut: Number(usage.completion_tokens) || 0 };
  } catch {
    return null;
  }
}

/** One OpenAI call, counted for its lesson (the hook lib/canvas/ai.ts calls: set in instrumentation.ts) */
export async function recordUsage(path: string, body: unknown, res: Response, lesson?: string): Promise<void> {
  try {
    const used = await usageOf(path, body, res);
    if (used) await addUsage(lesson, used);
  } catch { /* counting never gets in the way of the call */ }
}
