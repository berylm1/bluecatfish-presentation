import { NextResponse } from 'next/server';
import { AUTH_COOKIE, NAME_COOKIE } from '@/lib/editorAuth';

// POST → forgets the password on this browser
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(NAME_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
