import { NextResponse } from 'next/server';
import { CUE_TEXT } from '@/lib/canvas/cues';
import { recordClip } from '@/lib/canvas/prepare';
import { audioKey } from '@/lib/canvas/aiFields';
import { rateLimit } from '@/lib/rateLimit';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { lessonOf } from '@/lib/canvas/lessonProfiles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public: GET → { urls: { cmd_nextSlide: "https://…mp3", … } } for the canvas
// page's short spoken lines. Each is recorded once (same words + voice = same
// file) and remembered per server instance; missing ones are spoken live.
// (per voice: a lesson whose teacher has another voice gets the lines in that voice. Was: Professor Marine's for all)
const cached = new Map<string, Record<string, string>>();

export async function GET(req: Request) {
  const limited = await rateLimit(req, 'cues');
  if (limited) return limited;
  enterProfile(await lessonOf(req));   // (the asking lesson: its teacher's voice)
  const versionKey = audioKey(JSON.stringify(CUE_TEXT), false);
  const hit = cached.get(versionKey);
  if (hit) return NextResponse.json({ urls: hit });
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
  if (Object.keys(urls).length === Object.keys(CUE_TEXT).length) { if (cached.size > 50) cached.clear(); cached.set(versionKey, urls); }
  return NextResponse.json({ urls });
}
