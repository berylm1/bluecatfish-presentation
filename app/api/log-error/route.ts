import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST { kind, message, detail?, page?, participant?, test? } → one row in client_errors (migration 023).
// Sent by the browser only when something goes wrong (components/ErrorReporter.tsx, lib/reportError.ts): a normal
// lesson sends nothing. Never fails loudly: a problem here mustn't become another error.
const supabase = lazySupabaseAdmin();
const KINDS = new Set(['crash', 'promise', 'tutor']);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'errors');
  if (limited) return limited;
  const raw = await req.text().catch(() => '');
  if (raw.length > 8000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const kind = KINDS.has(body?.kind) ? body.kind : null;
  const message = text(body?.message, 500);
  if (!kind || !message) return NextResponse.json({ ok: false }, { status: 400 });
  const session = req.headers.get('x-learner-session');
  const participant = text(body.participant, 64);
  try {
    const { error } = await supabase.from('client_errors').insert({
      kind, message,
      detail: text(body.detail, 2000),
      page: text(body.page, 200)?.replace(/[?#].*$/, '') ?? null,
      participant: participant && /^[\w-]+$/.test(participant) ? participant : null,
      session: session && /^[\w-]{1,64}$/.test(session) ? session : null,
      browser: text(req.headers.get('user-agent'), 300),
      is_test: typeof body.test === 'boolean' ? body.test : null,
    });
    if (error) console.error('log-error:', error.message);   // (e.g. migration 023 not run yet)
  } catch (e) {
    console.error('log-error:', e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
