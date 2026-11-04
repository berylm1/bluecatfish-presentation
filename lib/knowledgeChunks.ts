// Shared by the server's upload (app/api/embed) and its tests: no imports.
/*
 * The knowledge base's pieces (documents3 rows): what the professor is handed when answering (the
 * closest few, by meaning). Each piece is whole sentences, about CHUNK_CHARS long, and starts with the
 * heading of the section it came from ("What blue catfish eat: …"), so it makes sense on its own.
 * (was: cut every 200 characters wherever that fell, so 57 of 59 pieces ended mid-sentence)
 */

export const CHUNK_CHARS = 300;

/** A line that's a section heading: short, all capitals, not a sentence ("WHAT BLUE CATFISH EAT") */
function isHeading(line: string): boolean {
  return line.length >= 3 && line.length <= 80 && /[A-Z]/.test(line) && line === line.toUpperCase() && !/[.!?,;]$/.test(line);
}

/** "WHAT BLUE CATFISH EAT" → "What blue catfish eat" */
function headingWords(line: string): string {
  const lower = line.toLowerCase().replace(/\s+/g, ' ').trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The sentences of a run of text (a full stop, ! or ? followed by a capital, a digit or a quote) */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["”'’)]?)\s+(?=["“'‘(]?[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

/** A sentence longer than a piece: cut at word breaks (rare; a piece never ends mid-word) */
function splitLong(sentence: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of sentence.split(' ')) {
    if (cur && cur.length + 1 + w.length > max) { out.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** The text's pieces: whole sentences up to about `max` characters each, each led by its section heading */
export function chunkBySentences(text: string, max = CHUNK_CHARS): string[] {
  // sections: a heading line, then the text under it (lines joined: a PDF breaks its lines mid-sentence)
  const sections: { heading: string; text: string }[] = [{ heading: '', text: '' }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (isHeading(line)) sections.push({ heading: headingWords(line), text: '' });
    else sections[sections.length - 1].text += ` ${line}`;
  }
  const chunks: string[] = [];
  for (const { heading, text: body } of sections) {
    const lead = heading ? `${heading}: ` : '';
    let cur = '';
    const flush = () => { if (cur) chunks.push(lead + cur); cur = ''; };
    for (const s of sentences(body).flatMap((s) => (s.length > max ? splitLong(s, max) : [s]))) {
      if (cur && cur.length + 1 + s.length > max) flush();
      cur = cur ? `${cur} ${s}` : s;
    }
    flush();
  }
  return chunks;
}
