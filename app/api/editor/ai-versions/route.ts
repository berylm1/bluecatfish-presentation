import { NextResponse } from 'next/server';
import { getValue, scanKeys } from '@/src/redisClient';
import { SECTIONS_CACHE_KEY } from '@/src/cacheVersion';

export const dynamic = 'force-dynamic';

// Every AI lesson version cached in Redis, for "Start from AI" in the editor.
// GET → the list. GET ?key=<one of them> → that version's raw slides.
const PATTERNS = ['bluecatfish_sections_ai_*', 'bluecatfish_slides_ai:*'];
const allowed = (key: string) => /^bluecatfish_(sections_ai_[\w.-]+|slides_ai:[\w:.-]+)$/.test(key);

function label(key: string): string {
  return key
    .replace(/^bluecatfish_sections_ai_/, '')
    .replace(/^bluecatfish_slides_ai:/, 'first version, ');
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  if (key) {
    if (!allowed(key)) return NextResponse.json({ error: 'Not a lesson version' }, { status: 400 });
    const raw = await getValue(key);
    if (!raw) return NextResponse.json({ error: 'That version is no longer in Redis' }, { status: 404 });
    return NextResponse.json({ data: JSON.parse(raw) });
  }

  const keys = (await Promise.all(PATTERNS.map((p) => scanKeys(p)))).flat().filter(allowed);
  const versions = await Promise.all(
    keys.map(async (k) => {
      let count = 0;
      try {
        const raw = JSON.parse((await getValue(k)) ?? 'null');
        const list = Array.isArray(raw) ? raw : raw?.sections ?? [];
        count = list.reduce((n: number, s: any) => n + (Array.isArray(s?.steps) ? s.steps.length : 1), 0);
      } catch { /* unreadable: still listed */ }
      return { key: k, label: label(k), slides: count, current: k === SECTIONS_CACHE_KEY };
    }),
  );
  // Current first, then newest-looking names first
  versions.sort((a, b) => Number(b.current) - Number(a.current) || b.label.localeCompare(a.label, undefined, { numeric: true }));
  return NextResponse.json({ versions: versions.filter((v) => v.slides > 0) });
}
