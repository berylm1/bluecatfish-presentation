import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Variant slide lookup — returns the best reviewed variant for a topic + learner state.
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

/* ---------------------------------------------------------------
 * Semantic matching — embed the query once, compare against cached
 * concept embeddings (cosine). Word matching stays as the fallback
 * for when the embedding API is unreachable.
 * ------------------------------------------------------------- */
const EMBED_MODEL = 'text-embedding-3-small';
const conceptEmbeddings = new Map<string, number[]>();   // row id -> vector
let conceptText = new Map<string, string>();             // row id -> concept + title + body head

function rowText(row: any): string {
  return `${row.concept ?? ''} ${row.title ?? ''} ${(row.body ?? '').slice(0, 300)}`;
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 2000) }),
    });
    const data = await res.json();
    const v = data?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/* ---------------------------------------------------------------
 * Live explanation — the professor explains the slide conversationally
 * (grounded in the reviewed narration + factsheet quote), instead of
 * reading the canned clip. Falls back to the stored narration.
 * ------------------------------------------------------------- */
async function generateExplanation(row: any, learnerState: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              `You are Professor Marine, a warm, witty marine-science lecturer teaching the Blue Catfish invasion of the Chesapeake Bay. ` +
              `The learner is ${learnerState}. You are showing them your authored slide titled "${row.title}". ` +
              `Teach FROM the slide: start by pointing at what's on it, then expand with the reviewed fact below. ` +
              `Speak 4-6 short conversational spoken sentences — contractions, natural rhythm, a light joke if it fits. ` +
              `Never read the slide verbatim; explain the WHY behind it. End by inviting the learner back to the lesson.`,
          },
          {
            role: 'user',
            content:
              `Slide title: ${row.title}\nSlide text: ${row.body}\n` +
              `Reviewed narration (the fact to teach, do not just repeat): ${row.narration}\n` +
              (row.source_quote ? `Factsheet backing: ${row.source_quote}` : ''),
          },
        ],
        max_tokens: 220,
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
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
    // `explain=1` — generate a fresh conversational explanation for the
    // chosen slide instead of returning only the canned narration.
    const explain = params.get('explain') === '1';

    // was `section > 5` — the planner can make up to 7 sections
    if (!q && (!Number.isInteger(section) || section < 0 || section > 9)) {
      return NextResponse.json({ error: 'section must be 0-9' }, { status: 400 });
    }
    const preferences = STATE_VARIANT_PREFERENCE[state] ?? STATE_VARIANT_PREFERENCE.confused;

    let query = getSupabase().from('slide_templates').select('*').in('variant', preferences).order('sort_order', { ascending: true });
    query = q ? query : query.eq('section', section);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows: any[] = data ?? [];
    const matchAgainst = q || title;

    // Rank candidates. Semantic first (embeddings), word-match fallback.
    let ranked: { row: any; score: number }[] = [];

    if (matchAgainst) {
      const qv = await embed(matchAgainst);
      if (qv) {
        for (const row of rows) {
          let v = conceptEmbeddings.get(row.id);
          if (!v || conceptText.get(row.id) !== rowText(row)) {
            v = (await embed(rowText(row))) ?? undefined;
            if (v) {
              conceptEmbeddings.set(row.id, v);
              conceptText.set(row.id, rowText(row));
            }
          }
          if (v) ranked.push({ row, score: cosine(qv, v) });
        }
        ranked.sort((a, b) => b.score - a.score);
        // keep only plausibly-related slides
        ranked = ranked.filter((r) => r.score >= 0.32);
      }
    }

    if (ranked.length === 0 && matchAgainst) {
      // Word matcher: stem overlap, then raw-word fallback
      let rows2 = rows.filter((row) => sameTopic(row.concept, matchAgainst));
      if (rows2.length === 0) {
        const rawWords = (s: string) => new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !['the', 'and', 'for', 'are', 'what'].includes(w)));
        const qw = rawWords(matchAgainst);
        rows2 = rows.filter((row) => {
          const cw = rawWords(row.concept ?? '');
          for (const w of qw) if (cw.has(w)) return true;
          return false;
        });
      }
      ranked = rows2.map((row) => ({ row, score: 0.4 }));
    } else if (!matchAgainst) {
      ranked = rows.map((row) => ({ row, score: 1 }));
    }

    // Rank-first selection with a tie window: the semantically best slide wins
    // outright — UNLESS other candidates are within 0.08 of it (same topic,
    // different teaching style), in which case the state's variant preference
    // picks the style (confused → analogy, lost → remedial, bored → visual).
    let chosen: any = null;
    ranked.sort((a, b) => b.score - a.score);
    if (ranked.length > 0) {
      const best = ranked[0].score;
      const nearTies = ranked.filter((r) => best - r.score <= 0.08);
      for (const v of preferences) {
        const pick = nearTies.find((r) => r.row.variant === v);
        if (pick) { chosen = pick.row; break; }
      }
      if (!chosen && best >= 0.45) chosen = ranked[0].row;
      if (!chosen && nearTies.length > 0) chosen = nearTies[0].row;
    }

    if (chosen && explain) {
      const live = await generateExplanation(chosen, state);
      if (live) chosen = { ...chosen, live_narration: live, canned_narration: chosen.narration };
    }

    const debug = params.get('debug') === '1';
    return NextResponse.json({
      ok: true,
      variant: chosen ?? null,
      ...(debug ? { scores: ranked.slice(0, 6).map((r) => ({ concept: r.row.concept, variant: r.row.variant, title: r.row.title, score: Number(r.score.toFixed(3)) })) } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('tutor/variant error:', message);
    return NextResponse.json({ ok: false, error: message, variant: null }, { status: 500 });
  }
}