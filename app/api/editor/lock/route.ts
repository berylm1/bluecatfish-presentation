import { NextResponse } from 'next/server';
import { AUTH_COOKIE, NAME_COOKIE } from '@/lib/editorAuth';

// POST → forgets the password on this browser
export async function POST(req: Request) {
  // Only from this site's own pages (was: any site could post here and lock an editor out mid-work)
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  let sameOrigin = true;
  try { if (origin) sameOrigin = new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host')); } catch { sameOrigin = false; }
  if (!sameOrigin || (site && site !== 'same-origin' && site !== 'none')) return NextResponse.json({ ok: false, error: 'Not from this site' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(NAME_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
