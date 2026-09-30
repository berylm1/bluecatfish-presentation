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

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const section = Number(params.get('section'));
    const state = (params.get('state') ?? 'confused').toLowerCase();
    const title = params.get('title') ?? '';
    // `q` = free-text topic search (a learner's question or a "show me the
    // slide on X" command). Searches the whole knowledge base by concept
    // words instead of pinning to a section number.
    const q = (params.get('q') ?? '').trim();

    // was `section > 5` — the planner can make up to 7 sections
    if (!q && (!Number.isInteger(section) || section < 0 || section > 9)) {
      return NextResponse.json({ error: 'section must be 0-9' }, { status: 400 });
    }
    const preferences = STATE_VARIANT_PREFERENCE[state] ?? STATE_VARIANT_PREFERENCE.confused;

    let query = getSupabase().from('slide_templates').select('*').in('variant', preferences).order('sort_order', { ascending: true });
    query = q ? query : query.eq('section', section);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Section numbers come from the AI planner and can shift when the lesson is
    // regenerated, so a variant must also be about this section's topic.
    const matchAgainst = q || title;
    let rows = (data ?? []).filter((row: any) => !matchAgainst || sameTopic(row.concept, matchAgainst));

    // Fallback when the stem matcher comes up empty ("what is the blue catfish"
    // is all stop-words): raw word overlap between the query and the concept.
    if (matchAgainst && rows.length === 0) {
      const rawWords = (s: string) => new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !['the', 'and', 'for', 'are', 'what'].includes(w)));
      const qw = rawWords(matchAgainst);
      rows = (data ?? []).filter((row: any) => {
        const cw = rawWords(row.concept ?? '');
        for (const w of qw) if (cw.has(w)) return true;
        return false;
      });
    }

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
