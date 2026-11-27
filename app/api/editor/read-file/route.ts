import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import extract from 'pdf-extraction';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

// POST { file: base64, fileType: 'pdf' | 'docx' | 'txt' } → { text }: the words in an uploaded file, for the
// "New lesson" flow's material box (editors only: under /api/editor, see proxy.ts). Nothing is stored here.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.file !== 'string' || !body.file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const buffer = Buffer.from(body.file, 'base64');
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'That file is over 12 MB: paste the part you need instead' }, { status: 413 });
  try {
    let text = '';
    if (body.fileType === 'pdf') text = (await extract(buffer)).text ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else if (body.fileType === 'docx') text = ((await mammoth.extractRawText({ buffer })) as any).value ?? '';
    else if (body.fileType === 'txt') text = buffer.toString('utf-8');
    else return NextResponse.json({ error: 'Use a PDF, a Word file (.docx) or a text file' }, { status: 400 });
    text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return NextResponse.json({ error: 'No words could be read from that file (a scanned PDF is pictures: paste its text instead)' }, { status: 422 });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: `That file couldn’t be read (${e instanceof Error ? e.message : String(e)})` }, { status: 422 });
  }
}
