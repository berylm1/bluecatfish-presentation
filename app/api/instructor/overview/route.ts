import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Instructor view — read-only aggregate over the learner tables.
 * Service role, server-only. Returns the recent per-section learner-state
 * rollups plus a 24h event-type histogram for the dashboard.
 */
let client: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return client;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // Recent learner-state rollups (browser keeps writing these live)
    const { data: statesRaw, error: statesErr } = await supabase
      .from('learner_state')
      .select('session_id, section, seq, visits, repeats, simplify_requests, confusion_marks, barge_ins, questions, last_state, updated_at')
      .order('updated_at', { ascending: false })
      .limit(60);

    // 24h event histogram — what actually happened, per type
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: eventsRaw, error: eventsErr } = await supabase
      .from('events')
      .select('event_type, created_at')
      .gte('created_at', since)
      .limit(2000);

    // Finn's deliberate mistakes (last 24h): how often learners caught them.
    // From the events log, so no new table; a failure here doesn't break the page.
    const finn = { caught: 0, fooled: 0, unsure: 0, other: 0 };
    const { data: finnRaw } = await supabase
      .from('events')
      .select('value')
      .eq('event_type', 'tutor_decision')
      .filter('value->>action', 'eq', 'classmate_mistake_answer')
      .gte('created_at', since)
      .limit(2000);
    for (const row of (finnRaw ?? []) as { value?: { kind?: string } }[]) {
      const k = row.value?.kind;
      if (k === 'caught' || k === 'fooled' || k === 'unsure') finn[k]++;
      else finn.other++;
    }

    if (statesErr || eventsErr) {
      return NextResponse.json(
        { error: statesErr?.message || eventsErr?.message || 'query failed' },
        { status: 500 }
      );
    }

    const states = (statesRaw ?? []) as Record<string, any>[];
    const events = (eventsRaw ?? []) as { event_type: string }[];

    const histogram: Record<string, number> = {};
    for (const e of events) {
      histogram[e.event_type] = (histogram[e.event_type] ?? 0) + 1;
    }

    // Mood distribution across the rollups
    const moods: Record<string, number> = {};
    for (const s of states) {
      moods[s.last_state ?? 'neutral'] = (moods[s.last_state ?? 'neutral'] ?? 0) + 1;
    }

    return NextResponse.json(
      { states, histogram, moods, finn, sessions: new Set(states.map((s) => s.session_id)).size },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unexpected error' },
      { status: 500 }
    );
  }
}
