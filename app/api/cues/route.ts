import { NextResponse } from 'next/server';
import { CUE_TEXT } from '@/lib/canvas/cues';
import { recordClip } from '@/lib/canvas/prepare';
import { audioKey } from '@/lib/canvas/aiFields';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public: GET → { urls: { cmd_nextSlide: "https://…mp3", … } } for the canvas
// page's short spoken lines. Each is recorded once (same words + voice = same
// file) and remembered per server instance; missing ones are spoken live.
let cached: { urls: Record<string, string>; key: string } | null = null;
const versionKey = audioKey(JSON.stringify(CUE_TEXT), false);

export async function GET() {
  if (cached?.key === versionKey) return NextResponse.json({ urls: cached.urls });
  const urls: Record<string, string> = {};
  await Promise.all(
    Object.entries(CUE_TEXT).map(async ([key, text]) => {
      try {
        urls[key] = (await recordClip(text, false)).url;
      } catch (e) {
        console.warn(`Cue "${key}" not recorded:`, e instanceof Error ? e.message : e);
      }
    }),
  );
  if (Object.keys(urls).length === Object.keys(CUE_TEXT).length) cached = { urls, key: versionKey };
  return NextResponse.json({ urls });
}
