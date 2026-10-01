import { NextResponse } from 'next/server';
import { incrWindow } from '@/src/redisClient';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';

/*
 * Limits on the public endpoints that cost OpenAI money, so one visitor (or a
 * bot) can't run up the bill. Counted in Redis, so every server instance sees
 * the same numbers.
 *
 * - per session: the browser's lesson session (X-Learner-Session header), so
 *   one student can't use up a whole class's share
 * - per address: the internet address; a school shares one, so these are
 *   generous
 * - per day, for the whole site: past it, that feature pauses until tomorrow
 *   (pre-recorded lesson audio is just files and is never limited)
 *
 * Unlocked editors (Kai, Beryl, Dr. Cao) are never limited. If Redis can't be reached,
 * requests are allowed: a Redis problem mustn't break the lesson.
 */

type Rule = { perSession: number; perAddress: number; windowSec: number; perDay?: number; label: string };

export const LIMITS = {
  tutor: { perSession: 10, perAddress: 60, windowSec: 60, perDay: 3000, label: 'questions' },
  tts: { perSession: 30, perAddress: 200, windowSec: 60, perDay: 20000, label: 'read-aloud requests' },
  transcribe: { perSession: 20, perAddress: 120, windowSec: 60, perDay: 6000, label: 'recordings' },
  search: { perSession: 20, perAddress: 120, windowSec: 60, perDay: 5000, label: 'searches' },
  slides: { perSession: 15, perAddress: 120, windowSec: 60, perDay: 5000, label: 'slide lookups' },
  // Making the whole /presentationv2 lesson (only when it isn't cached yet): many paid calls
  lesson: { perSession: 2, perAddress: 4, windowSec: 3600, perDay: 20, label: 'lesson builds' },
  cues: { perSession: 10, perAddress: 60, windowSec: 60, label: 'requests' },
} satisfies Record<string, Rule>;

/** Longest inputs accepted (characters / bytes). */
export const MAX = {
  question: 500,
  systemPrompt: 8000,
  conversationTurns: 12,
  conversationChars: 2000,   // per turn
  ttsText: 1500,
  audioBytes: 5_000_000,     // ~15 s turn is ~0.5 MB as 16 kHz WAV
  searchQuery: 300,
  searchDocs: 400,
};

export const SESSION_HEADER = 'x-learner-session';

function address(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (fwd || req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

async function isEditor(req: Request): Promise<boolean> {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
  return !!m && !!(await verifyToken(decodeURIComponent(m[1])));
}

export function tooLarge(what: string): NextResponse {
  return NextResponse.json({ error: `That ${what} is too long.`, limited: true }, { status: 413 });
}

/** null = go ahead; otherwise a 429 response to return as is. */
export async function rateLimit(req: Request, name: keyof typeof LIMITS): Promise<NextResponse | null> {
  const rule: Rule = LIMITS[name];
  if (await isEditor(req)) return null;

  const now = Date.now();
  const window = Math.floor(now / 1000 / rule.windowSec);
  const retryAfter = rule.windowSec - (Math.floor(now / 1000) % rule.windowSec);
  const session = req.headers.get(SESSION_HEADER);
  const checks: [string, number, number][] = [[`rl:${name}:a:${address(req)}:${window}`, rule.perAddress, rule.windowSec]];
  if (session && /^[\w-]{6,64}$/.test(session)) checks.push([`rl:${name}:s:${session}:${window}`, rule.perSession, rule.windowSec]);

  for (const [key, max, ttl] of checks) {
    const n = await incrWindow(key, ttl + 5);
    if (n !== null && n > max) return limited(`Too many ${rule.label} for a moment`, retryAfter);
  }
  if (rule.perDay) {
    const day = new Date(now).toISOString().slice(0, 10);
    const n = await incrWindow(`rl:${name}:day:${day}`, 26 * 3600);
    if (n !== null && n > rule.perDay) return limited(`The daily limit for ${rule.label} is used up`, 3600);
  }
  return null;
}

function limited(error: string, retryAfter: number): NextResponse {
  return NextResponse.json(
    { error, limited: true, retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
