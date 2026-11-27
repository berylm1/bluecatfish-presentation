import { NextResponse } from 'next/server';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';
import { editorName } from '@/lib/editorAuth';
import { isKbId } from '@/lib/canvas/profile';

export const dynamic = 'force-dynamic';
const supabase = lazySupabaseAdmin();

// The knowledge bases (supabase/migrations/024_knowledge_bases.sql): each a named collection of source chunks and
// pictures that lessons search. GET → the list (with how many chunks and pictures each has). POST { id, title } → a new one.
const DEFAULTS = [{ id: 'blue-catfish', title: 'Blue Catfish' }, { id: 'shared', title: 'Shared by every lesson (pictures)' }];

export async function GET() {
  const { data, error } = await supabase.from('knowledge_bases').select('id, title').order('created_at');
  if (error) return NextResponse.json({ bases: DEFAULTS, migrated: false });
  const count = async (table: string, kb: string) => (await supabase.from(table).select('id', { count: 'exact', head: true }).eq('kb', kb)).count ?? 0;
  const bases = await Promise.all((data ?? []).map(async (b) => ({ ...b, chunks: await count('documents3', b.id), pictures: await count('images2', b.id) })));
  return NextResponse.json({ bases, migrated: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) ?? {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  const id = typeof body.id === 'string' && isKbId(body.id) ? body.id
    : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  if (!title || !id || !isKbId(id)) return NextResponse.json({ error: 'Give the knowledge base a name' }, { status: 400 });
  const { error } = await supabase.from('knowledge_bases').upsert({ id, title, created_by: await editorName(req) }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    const missing = /knowledge_bases|schema cache|does not exist/i.test(error.message);
    return NextResponse.json({ error: missing ? 'Run supabase/migrations/024_knowledge_bases.sql in Supabase first.' : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ base: { id, title } });
}
