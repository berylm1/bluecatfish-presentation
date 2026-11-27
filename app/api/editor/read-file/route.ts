import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import extract from 'pdf-extraction';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The host turns away a request over about 4.5 MB before it gets here, so that's the most a file can be
// (was: "up to 12 MB", sent as text inside JSON, a third bigger again: anything over about 3 MB failed with no reason given)
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A PDF's words. The reader the site has always used can fail on its very first file after the server wakes up
 * ("bad XRef entry") and read the same file a moment later, so it gets three goes; then a second reader, for a
 * file the first really can't follow.
 */
async function pdfText(buffer: Buffer): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = (await extract(Buffer.from(buffer))).text ?? '';
      if (text.trim()) return text;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text ?? '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (e) {
    throw last instanceof Error ? last : e;
  }
}

// POST (a form with the file in "file") → { text }: the words in an uploaded PDF, Word or text file, for the
// "New lesson" flow's material box (editors only: under /api/editor, see proxy.ts). Nothing is stored here.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 4 MB: paste the part you need instead' }, { status: 413 });
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ['txt', 'md', 'csv'].includes(ext) ? 'txt' : '';
  if (!fileType) return NextResponse.json({ error: 'Use a PDF, a Word file (.docx) or a text file' }, { status: 400 });
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';
    if (fileType === 'pdf') text = await pdfText(buffer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else if (fileType === 'docx') text = ((await mammoth.extractRawText({ buffer })) as any).value ?? '';
    else text = buffer.toString('utf-8');
    text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return NextResponse.json({ error: 'No words could be read from that file (a scanned PDF is pictures: paste its text instead)' }, { status: 422 });
    // (the wizard's box holds 60,000 characters: there's no use sending back a whole book)
    return NextResponse.json({ text: text.slice(0, 200_000) });
  } catch (e) {
    console.error('read-file error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'That file couldn’t be read. If it’s a PDF, try saving it again, or paste its text instead.' }, { status: 422 });
  }
}
