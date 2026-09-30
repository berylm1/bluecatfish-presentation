import { NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_DAYS, NAME_COOKIE, checkPassword, gateConfigured, makeToken } from '@/lib/editorAuth';

// POST { password } → sets the editor cookie for 30 days
export async function POST(req: Request) {
  if (!gateConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'The editor password is not set up yet. Add EDITOR_PASSWORDS in Vercel → Settings → Environment Variables, then redeploy.' },
      { status: 503 },
    );
  }
  const { password } = await req.json().catch(() => ({ password: '' }));
  // A short pause on every try makes guessing slow
  await new Promise((r) => setTimeout(r, 400));
  const name = checkPassword(String(password ?? ''));
  if (!name) return NextResponse.json({ ok: false, error: 'That password isn’t right.' }, { status: 401 });

  const res = NextResponse.json({ ok: true, name });
  const maxAge = AUTH_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(AUTH_COOKIE, await makeToken(name), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge });
  res.cookies.set(NAME_COOKIE, name, { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge });
  return res;
}
