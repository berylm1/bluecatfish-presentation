import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Variant slide lookup — returns the best reviewed variant for a section + learner state.
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

const STATE_VARIANT_PREFERENCE: Record<string, string[]> = {
  confused: ['analogy', 'remedial', 'visual'],
  frustrated: ['remedial', 'analogy', 'visual'],
  bored: ['visual', 'deep-dive', 'analogy'],
  engaged: ['deep-dive', 'visual'],
  neutral: ['visual', 'analogy', 'remedial'],
};

const STOP = new Set(['the', 'a', 'an', 'are', 'is', 'they', 'them', 'why', 'what', 'how', 'do', 'does', 'of', 'to', 'and', 'in', 'on', 'blue', 'catfish', 'fish']);
const words = (t: string) =>
  new Set((t.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 6)));

// "Why Are They Invasive?" vs "Why They're Invasive": share at least one real word
function sameTopic(concept: string, title: string): boolean {
  const a = words(concept ?? '');
  for (const w of words(title)) if (a.has(w)) return true;
  return false;
}

function sharedWords(a: string, b: string): number {
  const x = words(a ?? '');
  let n = 0;
  for (const w of words(b)) if (x.has(w)) n++;
  return n;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const state = (params.get('state') ?? 'confused').toLowerCase();
    const title = params.get('title') ?? '';
    const preferences = STATE_VARIANT_PREFERENCE[state] ?? STATE_VARIANT_PREFERENCE.confused;

    // Without a section number (the canvas page, whose topics aren't numbered
    // like the old planner's sections): match on the topic title, plus the
    // slide's own words (`about`), and take the best match.
    if (params.get('section') === null) {
      const about = params.get('about') ?? '';
      if (!title && !about) return NextResponse.json({ error: 'title or about is required' }, { status: 400 });
      const { data, error } = await getSupabase().from('slide_templates').select('*').in('variant', preferences);
      if (error) throw new Error(error.message);
      const scored = (data ?? [])
        .map((row: any) => ({ row, score: 2 * sharedWords(row.concept, title) + sharedWords(`${row.concept} ${row.title} ${row.body}`, about) }))
        .filter((r) => r.score >= 2)
        .sort((a, b) => b.score - a.score || preferences.indexOf(a.row.variant) - preferences.indexOf(b.row.variant) || a.row.sort_order - b.row.sort_order);
      return NextResponse.json({ ok: true, variant: scored[0]?.row ?? null });
    }

    const section = Number(params.get('section'));
    // was `section > 5` — the planner can make up to 7 sections
    if (!Number.isInteger(section) || section < 0 || section > 9) {
      return NextResponse.json({ error: 'section must be 0-9' }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from('slide_templates')
      .select('*')
      .eq('section', section)
      .in('variant', preferences)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);

    // Section numbers come from the AI planner and can shift when the lesson is
    // regenerated, so a variant must also be about this section's topic.
    const rows = (data ?? []).filter((row: any) => !title || sameTopic(row.concept, title));

    // pick the highest-preference variant that exists
    let chosen = null;
    for (const v of preferences) {
      chosen = rows.find((row: any) => row.variant === v);
      if (chosen) break;
    }

    return NextResponse.json({ ok: true, variant: chosen ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('tutor/variant error:', message);
    return NextResponse.json({ ok: false, error: message, variant: null }, { status: 500 });
  }
}
