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
