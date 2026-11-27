import { NextResponse } from 'next/server';
import { incrWindow } from '@/src/redisClient';
import { AUTH_COOKIE, verifyToken } from '@/lib/editorAuth';

/*
 * Limits on the public endpoints that cost OpenAI money, so one visitor (or a
 * bot) can't run up the bill (and on the free ones that write to the database,
 * so a bot can't fill it). Counted in Redis, so every server instance sees
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

// The limits themselves (how many, how often) are in lib/rateLimits.ts: one entry each, to change there.
import { LIMITS, MAX, type Rule } from './rateLimits';
export { LIMITS, MAX };

export const SESSION_HEADER = 'x-learner-session';

function address(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (fwd || req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

/** The unlocked editor's name, or null. */
export async function editorOf(req: Request): Promise<string | null> {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
  return m ? (await verifyToken(decodeURIComponent(m[1]))) ?? null : null;
}

export function tooLarge(what: string): NextResponse {
  return NextResponse.json({ error: `That ${what} is too long.`, limited: true }, { status: 413 });
}

/**
 * null = go ahead; otherwise a 429 response to return as is.
 * editorsToo: unlocked editors are limited as well (counted per editor, as the "session"), for
 * editor tools that cost money per use (the ✨ helper).
 */
export async function rateLimit(req: Request, name: keyof typeof LIMITS, opts: { editorsToo?: boolean } = {}): Promise<NextResponse | null> {
  const rule: Rule = LIMITS[name];
  const editor = await editorOf(req);
  if (editor && !opts.editorsToo) return null;

  const now = Date.now();
  const window = Math.floor(now / 1000 / rule.windowSec);
  const retryAfter = rule.windowSec - (Math.floor(now / 1000) % rule.windowSec);
  const session = req.headers.get(SESSION_HEADER);
  const checks: [string, number, number][] = [[`rl:${name}:a:${address(req)}:${window}`, rule.perAddress, rule.windowSec]];
  if (editor) checks.push([`rl:${name}:e:${editor.replace(/[^\w-]/g, '_').slice(0, 40)}:${window}`, rule.perSession, rule.windowSec]);
  else if (session && /^[\w-]{6,64}$/.test(session)) checks.push([`rl:${name}:s:${session}:${window}`, rule.perSession, rule.windowSec]);

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
