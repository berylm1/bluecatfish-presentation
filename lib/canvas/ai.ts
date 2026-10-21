import { lazySupabaseAdmin } from '@/lib/supabase/admin';

// Shared by the save-time AI (prepare.ts), the AI deck (generate.ts) and the
// helper drafts (helperDraft.ts): the house style, chat and the knowledge base.

const supabase = lazySupabaseAdmin();
const MODEL = 'gpt-6.1-sol';

export const STYLE =
  'You are Professor Marine, a fun science teacher talking to 10 to 14 year olds about the blue catfish invasion ' +
  'of the Chesapeake Bay. Upbeat and conversational, like telling a story. A little goofy, with light, dry, ' +
  'playful sarcasm aimed at the fish, never at the learner. Facts must be exactly right.';

/**
 * A call to OpenAI that waits out a busy moment: "too many requests" (429) or a brief outage (500, 502, 503)
 * is tried again at most twice, after its Retry-After or 2 s then 6 s (a little random, so calls made
 * together don't come back together). Anything else, or a third failure, is returned as it is.
 */
export async function openai(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.openai.com/v1/${path}`, init);
    if (attempt >= 2 || ![429, 500, 502, 503].includes(res.status)) return res;
    const after = Number(res.headers.get('retry-after'));
    const wait = Math.min(15_000, Number.isFinite(after) && after > 0 ? after * 1000 : attempt ? 6000 : 2000) + Math.random() * 1000;
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, wait));
  }
}

export async function chat(system: string, user: string, json = false, maxTokens = 2000): Promise<string> {
  const res = await openai('chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'low',
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: maxTokens,
    }),
  });
  const raw = await res.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* not JSON: a proxy or outage page */ }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) throw new Error(data?.error?.message || `OpenAI request failed (${res.status}): ${raw.slice(0, 120)}`);
  return text;
}

/** An https address on a public host (not localhost or a private/link-local IP written out). */
export function isPublicHttps(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (h.includes(':')) {   // IPv6
    if (h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:')) return false;
  }
  return true;
}

/** chat, looking at a picture too (for the laser marks). */
const VISION_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 8_000_000;

/**
 * The picture as a data URL the model can read, or null if it can't be (not
 * found, too big, or a kind the model doesn't take, like SVG). Fetched here,
 * not by OpenAI: its downloader failed on some storage links ("Error while
 * downloading file. Upstream status code: 400").
 */
export async function imageForVision(url: string): Promise<string | null> {
  try {
    // Our server fetches it, so only a public web picture: https, not an address inside a
    // network (localhost, 10.x, 192.168.x, the cloud's 169.254.x…), and no redirects to one
    if (!isPublicHttps(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!VISION_TYPES.includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function chatVision(system: string, user: string, imageUrl: string): Promise<string> {
  const res = await openai('chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: imageUrl } }] },
      ],
      max_completion_tokens: 1500,
    }),
  });
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) throw new Error(data?.error?.message || `OpenAI request failed (${res.status})`);
  return text;
}

export async function knowledge(query: string, count = 6): Promise<string> {
  try {
    const emb = await openai('embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query.slice(0, 2000) }),
    }).then((r) => r.json());
    const { data, error } = await supabase.rpc('match_documents3', { query_embedding: emb.data[0].embedding, match_count: count });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => String(r.content ?? '')).filter(Boolean).join('\n\n');
  } catch (e) {
    console.warn('Knowledge base lookup failed:', e);
    return '';
  }
}

/** A knowledge-base excerpt and the file it came from (the upload's name). */
export type Excerpt = { content: string; source: string };

/**
 * Like knowledge(), but each excerpt with where it came from (for "Check this
 * slide"). The source is on the search result if the database function
 * returns it, otherwise looked up by id in documents3. Throws when the
 * search fails, so a failed search isn't mistaken for "not in the sources".
 */
export async function knowledgeExcerpts(query: string, count = 4): Promise<Excerpt[]> {
  return (await knowledgeExcerptsMany([query], count))[0];
}

/**
 * knowledgeExcerpts for several searches at once (the fact check: one per box on the slide): every search still its
 * own, but the searches' embeddings in one request (was: one request each), and the sources looked up together.
 */
export async function knowledgeExcerptsMany(queries: string[], count = 4): Promise<Excerpt[][]> {
  if (!queries.length) return [];
  const emb = await openai('embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: queries.map((q) => q.slice(0, 2000)) }),
  }).then((r) => r.json());
  const vectors: number[][] = queries.map((_, i) => emb?.data?.find((d: { index: number }) => d.index === i)?.embedding);
  if (vectors.some((v) => !v)) throw new Error(emb?.error?.message || 'The search could not be made');
  type Row = { id?: number | string; content?: string; source?: string; metadata?: { source?: string } };
  const results: Row[][] = await Promise.all(vectors.map(async (v) => {
    const { data, error } = await supabase.rpc('match_documents3', { query_embedding: v, match_count: count });
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }));
  const byId = new Map<string, string>();
  const missing = [...new Set(results.flat().filter((r) => !r.source && !r.metadata?.source && r.id != null).map((r) => String(r.id)))];
  if (missing.length) {
    const { data: found } = await supabase.from('documents3').select('id, source').in('id', missing);
    for (const d of (found ?? []) as { id: number | string; source?: string }[]) if (d.source) byId.set(String(d.id), d.source);
  }
  return results.map((rows) => rows
    .map((r) => ({ content: String(r.content ?? '').trim(), source: String(r.source || r.metadata?.source || (r.id != null && byId.get(String(r.id))) || 'knowledge base').slice(0, 200) }))
    .filter((e) => e.content));
}
