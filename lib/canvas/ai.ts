import { lazySupabaseAdmin } from '@/lib/supabase/admin';

// Shared by the save-time AI (prepare.ts), the AI deck (generate.ts) and the
// helper drafts (helperDraft.ts): the house style, chat and the knowledge base.

const supabase = lazySupabaseAdmin();
const MODEL = 'gpt-6-luna';

export const STYLE =
  'You are Professor Marine, a fun science teacher talking to 10 to 14 year olds about the blue catfish invasion ' +
  'of the Chesapeake Bay. Upbeat and conversational, like telling a story. A little goofy, with light, dry, ' +
  'playful sarcasm aimed at the fish, never at the learner. Facts must be exactly right.';

export async function chat(system: string, user: string, json = false, maxTokens = 2000): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
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
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    const emb = await fetch('https://api.openai.com/v1/embeddings', {
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
