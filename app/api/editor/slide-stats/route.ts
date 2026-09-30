import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { isLessonId } from '@/lib/canvas/store';
import { slideStats, type EventRow } from '@/lib/canvas/slideStats';

// Per-slide learner stats for the slide editor's heatmap (editor-only: the
// password gate in middleware.ts covers /api/editor/*).
//   GET ?lesson=<id>&days=30

const supabase = lazySupabaseAdmin();
const PAGE = 1000;       // Supabase returns at most 1000 rows per request
const MAX_ROWS = 20000;  // the newest this many events are plenty for a heatmap
const TYPES = ['step_start', 'dwell', 'emotion_state', 'confusion_click', 'simplify_request', 'repeat_request',
  'tutor_question', 'presence_away', 'self_check', 'tutor_decision'];

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lesson = params.get('lesson');
  if (!isLessonId(lesson)) return NextResponse.json({ error: 'Bad lesson' }, { status: 400 });
  const days = Math.min(365, Math.max(1, Number(params.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const rows: EventRow[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from('events')
        .select('session_id, event_type, value, dwell_ms')
        .filter('value->>lesson', 'eq', lesson)
        .in('event_type', TYPES)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as EventRow[]));
      if (!data || data.length < PAGE) break;
    }
    return NextResponse.json(
      { lesson, days, events: rows.length, capped: rows.length >= MAX_ROWS, slides: slideStats(rows) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('slide-stats error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
