import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Gate for corpus-write endpoints (/api/embed, /api/image-Ingest).
 * Requires a logged-in Supabase user whose email is in INGEST_ADMIN_EMAILS
 * (comma-separated, set in Vercel env). Returns null when authorized,
 * otherwise a 401/403 response to return immediately.
 *
 * Why not middleware: middleware only guards page routes (its matcher
 * excludes /api), so the gate must live at the route handler.
 */
export async function requireIngestAdmin(request: Request): Promise<NextResponse | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  // The ingest pages call these APIs with the browser's Supabase session.
  if (!token) {
    return NextResponse.json({ error: 'Sign in required to ingest content.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'Server auth not configured.' }, { status: 500 });
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  }

  const allowRaw = (process.env.INGEST_ADMIN_EMAILS ?? '').toLowerCase();
  const allowed = allowRaw.split(',').map((e) => e.trim()).filter(Boolean);
  const email = (data.user.email ?? '').toLowerCase();

  // Fail closed: if the allowlist isn't configured, nobody can ingest.
  if (allowed.length === 0 || !allowed.includes(email)) {
    return NextResponse.json({ error: 'Not authorized to ingest content.' }, { status: 403 });
  }

  return null;
}
