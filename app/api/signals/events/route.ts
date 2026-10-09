import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { EVENT_TYPES } from '@/lib/eventTypes';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST { events: [...] } → writes learner events to the events log, checked
// one by one. The browser sends them here in small batches (lib/signals.ts).
// was: the browser wrote straight to Supabase with the public key, so anyone
// could add any number of rows; migration 009 takes that public write away.
const supabase = lazySupabaseAdmin();

const MAX_BODY = 64_000;      // a keepalive request carries at most 64 KB anyway
const MAX_EVENTS = 50;        // the browser sends 5 at a time (more on page hide)
const MAX_VALUE = 4_000;      // characters of JSON per event (the table allows 8 KB)
const TYPES = new Set<string>(EVENT_TYPES);
const DAY = 86_400_000;

const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

/** One event as the table takes it, or null when it isn't one. */
function clean(raw: any, now: number) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.session_id !== 'string' || !/^[\w-]{1,64}$/.test(raw.session_id)) return null;
  if (!TYPES.has(raw.event_type)) return null;
  const value = raw.value && typeof raw.value === 'object' && !Array.isArray(raw.value) ? raw.value : {};
  if (JSON.stringify(value).length > MAX_VALUE) return null;
  // the browser's clock, unless it's far off (then now)
  const at = typeof raw.created_at === 'string' ? Date.parse(raw.created_at) : NaN;
  return {
    session_id: raw.session_id,
    learner_ref: typeof raw.learner_ref === 'string' && /^[\w-]{1,64}$/.test(raw.learner_ref) ? raw.learner_ref : null,
    section: int(raw.section, 0, 99),
    step: int(raw.step, 0, 999),
    event_type: raw.event_type,
    value,
    dwell_ms: int(raw.dwell_ms, 0, DAY),
    created_at: new Date(Number.isFinite(at) && Math.abs(at - now) < DAY ? at : now).toISOString(),
  };
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'events');
  if (limited) return limited;
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: 'Too much at once' }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(body)?.events; } catch { return NextResponse.json({ error: 'Not JSON' }, { status: 400 }); }
  if (!Array.isArray(raw) || !raw.length) return NextResponse.json({ error: 'No events' }, { status: 400 });
  const now = Date.now();
  const rows = raw.slice(0, MAX_EVENTS).map((e) => clean(e, now)).filter((e): e is NonNullable<typeof e> => !!e);
  if (!rows.length) return NextResponse.json({ error: 'No usable events' }, { status: 400 });
  try {
    const { error } = await supabase.from('events').insert(rows);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, written: rows.length, dropped: Math.min(raw.length, MAX_EVENTS) - rows.length });
  } catch (e) {
    // tracking is best effort: say what went wrong, the lesson doesn't wait for it
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
