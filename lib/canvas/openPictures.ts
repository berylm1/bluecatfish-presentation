import { createHash } from 'crypto';
import { chat, chatVision, isPublicHttps, openai } from './ai';
import { kbColumns } from './kb';
import { lazySupabaseAdmin } from '@/lib/supabase/admin';

/*
 * Openly licensed pictures for a lesson on any topic (server only): found on Wikimedia Commons (and Openverse, which
 * searches Flickr, museums and more), copied into our own picture library with who made each one, its licence and
 * where it came from, so the lesson can show the credit (a small line on the picture, and the sources page).
 *
 * Only licences that allow reuse with credit: CC BY, CC BY-SA, CC0 and the public domain. Before a picture goes in,
 * the AI looks at it: it writes the description the library is searched by, and says whether it fits the lesson and
 * is right for children. One that isn't is left out.
 */

const supabase = lazySupabaseAdmin();
const BUCKET = 'slide-imagesv2';
const AGENT = 'lesson-picture-search/1.0 (educational lessons; openly licensed pictures with credit)';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 6_000_000;

export interface OpenPicture {
  /** Where it's from, and its name there (a Commons file title, an Openverse id) */
  source: 'wikimedia' | 'openverse';
  id: string;
  title: string;
  /** A rendition about 960 px wide (what's copied), and a small one for the results */
  url: string;
  thumb: string;
  /** Its page (the credit links to it) */
  page: string;
  author: string;
  /** "CC BY-SA 4.0", "CC0", "Public domain" */
  license: string;
}

/** The line shown with the picture: who made it and under which licence */
export const creditLine = (p: Pick<OpenPicture, 'author' | 'license' | 'source'>): string =>
  [p.author || 'Unknown author', p.license, p.source === 'wikimedia' ? 'Wikimedia Commons' : 'via Openverse'].filter(Boolean).join(' · ').slice(0, 200);

const text = (html: unknown, max: number): string =>
  String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** A licence that allows reuse with credit, as it's shown ("CC BY-SA 4.0"), or null (not one we take) */
export function openLicense(raw: string): string | null {
  const s = raw.trim();
  if (/\b(nc|nd|noncommercial|no ?deriv)/i.test(s)) return null;
  if (/^(cc[ -]?0|cc0)/i.test(s) || /^cc[- ]zero/i.test(s)) return 'CC0';
  if (/^(public domain|pd\b|pdm|no restrictions)/i.test(s)) return 'Public domain';
  const m = s.match(/^cc[ -]by(?:[ -](sa))?(?:[ -](\d(?:\.\d)?))?/i);
  if (m) return `CC BY${m[1] ? '-SA' : ''}${m[2] ? ` ${m[2]}` : ''}`;
  return null;
}

async function getJson(url: string): Promise<any> {
  // (429: asked too fast. Once more after a moment, then give up on this one)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 1) throw new Error(`${new URL(url).host} answered ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/* ------------------------------------------------------------ sources */

const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=960' +
  '&iiextmetadatafilter=LicenseShortName%7CArtist%7CImageDescription%7CObjectName';

function fromCommons(pages: any): OpenPicture[] {
  return Object.values(pages ?? {}).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).flatMap((p: any): OpenPicture[] => {
    const ii = p?.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const license = openLicense(String(meta.LicenseShortName?.value ?? ''));
    // (photos and drawings a slide can show: not sound, video, PDFs or huge scans; SVGs come as a PNG rendition)
    if (!ii || !license || !/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(ii.mime ?? '') || (ii.width ?? 0) < 300) return [];
    const url = ii.thumburl || ii.url;
    // (Commons' own picture servers: the full files on upload.…, the smaller renditions on thumb.…)
    if (typeof url !== 'string' || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)) return [];
    return [{
      source: 'wikimedia', id: String(p.title), title: text(meta.ObjectName?.value || String(p.title).replace(/^File:/, '').replace(/\.\w+$/, '').replace(/_/g, ' '), 120),
      url, thumb: url.replace(/\/(\d+)px-/, '/330px-'), page: String(ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title))}`),
      // (Commons' filler around a name it worked out itself: "No machine-readable author provided. X assumed (based on copyright claims).")
      author: text(String(meta.Artist?.value ?? '').replace(/No machine-readable author provided\.?/i, '').replace(/assumed\s*\(based on copyright claims\)\.?/i, ''), 80), license,
    }];
  });
}

async function searchCommons(query: string, count: number): Promise<OpenPicture[]> {
  const d = await getJson(`${COMMONS}&generator=search&gsrnamespace=6&gsrlimit=${Math.min(30, count * 2)}&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap|drawing`)}`);
  return fromCommons(d?.query?.pages).slice(0, count);
}

function fromOpenverse(r: any): OpenPicture | null {
  const license = openLicense(`cc-${r?.license ?? ''} ${r?.license_version ?? ''}`.replace('cc-cc0', 'cc0').replace('cc-pdm', 'pdm'));
  if (!license || typeof r?.url !== 'string' || !isPublicHttps(r.url) || !r?.id) return null;
  return {
    source: 'openverse', id: String(r.id), title: text(r.title, 120) || 'Untitled', url: r.url, thumb: typeof r.thumbnail === 'string' ? r.thumbnail : r.url,
    page: typeof r.foreign_landing_url === 'string' && isPublicHttps(r.foreign_landing_url) ? r.foreign_landing_url : `https://openverse.org/image/${r.id}`,
    author: text(r.creator, 80), license,
  };
}

async function searchOpenverse(query: string, count: number): Promise<OpenPicture[]> {
  const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=by,by-sa,cc0,pdm&mature=false&page_size=${Math.min(20, count)}`);
  return (Array.isArray(d?.results) ? d.results : []).flatMap((r: any) => fromOpenverse(r) ?? []).slice(0, count);
}

/** Openly licensed pictures for these words: Wikimedia Commons first, Openverse to fill up */
export async function searchOpenPictures(query: string, count = 12): Promise<OpenPicture[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!q) return [];
  const commons = await searchCommons(q, count).catch((e) => { console.warn('Commons search failed:', e instanceof Error ? e.message : e); return [] as OpenPicture[]; });
  // (Openverse only when Commons has little: it allows few searches a day without an account)
  if (commons.length >= Math.min(count, 4)) return commons;
  const more = await searchOpenverse(q, count - commons.length).catch((e) => { console.warn('Openverse search failed:', e instanceof Error ? e.message : e); return [] as OpenPicture[]; });
  return [...commons, ...more];
}

/** One picture, looked up again at its source by its id (so what's stored is the source's word, not the page's) */
export async function openPictureById(source: string, id: string): Promise<OpenPicture | null> {
  try {
    if (source === 'wikimedia' && /^File:[^|#<>[\]{}]{1,240}$/.test(id)) {
      const d = await getJson(`${COMMONS}&titles=${encodeURIComponent(id)}`);
      return fromCommons(d?.query?.pages)[0] ?? null;
    }
    if (source === 'openverse' && /^[0-9a-f-]{36}$/i.test(id)) return fromOpenverse(await getJson(`https://api.openverse.org/v1/images/${id}/`));
  } catch (e) {
    console.warn('Open picture lookup failed:', e instanceof Error ? e.message : e);
  }
  return null;
}

/* -------------------------------------------------------------- adding */

export type Added = { url: string; description: string; credit: string; creditUrl: string; title: string };

async function embed(input: string): Promise<number[]> {
  const res = await openai('embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  });
  const d = await res.json();
  if (!d?.data?.[0]?.embedding) throw new Error('The picture couldn\'t be indexed');
  return d.data[0].embedding;
}

/**
 * Copies an open picture into the library of knowledge base `kb`, with its credit. The AI looks at it first.
 * strict (pictures nobody picked by hand): it must also fit what the lesson is about.
 * Returns what was added, or why not ({ skipped }).
 */
export async function addOpenPicture(pic: OpenPicture, kb: string, about: string, strict = false): Promise<Added | { skipped: string }> {
  if (!(await kbColumns())) return { skipped: 'Run supabase/migrations/024_knowledge_bases.sql first (the library keeps each picture\'s credit in it).' };
  if (!isPublicHttps(pic.url)) return { skipped: 'not a public web picture' };
  const name = `open_${createHash('sha1').update(`${pic.source}|${pic.id}`).digest('hex').slice(0, 20)}`;
  const credit = creditLine(pic);

  // Already in the library (this lesson's, or another's): the same file, and this knowledge base gets its own entry
  const before = await supabase.from('images2').select('url, description, kb').like('url', `%/${name}.%`).limit(10);
  const same = before.data?.find((r: any) => r.kb === kb);
  if (same) return { url: same.url, description: same.description ?? '', credit, creditUrl: pic.page, title: pic.title };

  let url = before.data?.[0]?.url as string | undefined;
  let description = before.data?.[0]?.description as string | undefined;
  if (!url || !description) {
    const res = await fetch(pic.url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000), redirect: 'error' }).catch(() => null);
    const type = (res?.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res?.ok || !TYPES[type]) return { skipped: 'the picture couldn\'t be fetched' };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return { skipped: 'the picture is too big' };

    const seen = JSON.parse(await chatVision(
      'You look at a picture someone wants to use in a lesson for {{ages}} year olds about {{about}}. Reply as JSON: ' +
        '{"description":"1 or 2 plain sentences (15 to 40 words) saying exactly what is shown: the things, people, setting, and any words in it; only what you can see",' +
        '"forChildren":true|false,"fits":true|false,"why":"a few words"}. ' +
        'forChildren: false for anything violent, sexual, frightening, hateful, or otherwise not for a school lesson. ' +
        'fits: could it help teach this lesson (it shows something the lesson talks about, or a clear everyday example of it)? ' +
        'false for a logo, a book cover, a screenshot, a page of text, a map of somewhere unrelated, or a picture about something else.',
      `The lesson: ${about}\nThe picture's title at its source: ${pic.title}`,
      `data:${type};base64,${bytes.toString('base64')}`,
    ));
    description = typeof seen.description === 'string' ? seen.description.trim().slice(0, 600) : '';
    if (!description) return { skipped: 'the AI couldn\'t describe it' };
    if (seen.forChildren === false) return { skipped: `not right for a children's lesson${seen.why ? ` (${String(seen.why).slice(0, 80)})` : ''}` };
    if (strict && seen.fits === false) return { skipped: `doesn't fit the lesson${seen.why ? ` (${String(seen.why).slice(0, 80)})` : ''}` };

    const file = `${name}.${TYPES[type]}`;
    const up = await supabase.storage.from(BUCKET).upload(file, bytes, { contentType: type, upsert: true });
    if (up.error) return { skipped: `it couldn't be stored (${up.error.message})` };
    url = supabase.storage.from(BUCKET).getPublicUrl(file).data.publicUrl;
  }
  const ins = await supabase.from('images2').insert({ url, description, embedding: await embed(description), kb, credit, license: pic.license, source_url: pic.page });
  if (ins.error) return { skipped: `it couldn't be added to the library (${ins.error.message})` };
  return { url, description, credit, creditUrl: pic.page, title: pic.title };
}

/* ---------------------------------------------- a new lesson's pictures */

/**
 * Pictures for a lesson that has none: the AI names things worth showing (from the lesson's outline), each is
 * searched for, and the best few that fit go into the lesson's library, for the slides to use.
 * (the lesson's profile is the one being worked on: lib/canvas/lessonContext.ts)
 */
export async function findLessonPictures(opts: { kb: string; about: string; sections: { title: string; covers?: string[] }[]; most?: number; deadline?: number }): Promise<{ added: Added[]; notes: string[] }> {
  const most = Math.min(12, opts.most ?? 8);
  const deadline = opts.deadline ?? Date.now() + 80_000;
  const notes: string[] = [];
  const outline = opts.sections.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}${s.covers?.length ? `: ${s.covers.slice(0, 5).join(', ')}` : ''}`).join('\n');
  let queries: string[] = [];
  try {
    const out = JSON.parse(await chat(
      'You pick pictures for a lesson for {{ages}} year olds about {{about}}. From its outline, name 5 to 8 CONCRETE things a photo or drawing could show ' +
        'that would help teach it: real objects, animals, places, people doing something, everyday examples (for fractions: "pizza cut into slices", "measuring cups", ' +
        '"chocolate bar"). Each is 1 to 4 plain words to search a photo library with. No abstract ideas, no diagrams with text, nothing unsuitable for children. ' +
        'Reply as JSON: {"queries":["...","..."]}',
      `The outline:\n${outline}`, true, 400,
    ));
    queries = (Array.isArray(out?.queries) ? out.queries : []).map((q: unknown) => String(q).replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean).slice(0, 8);
  } catch (e) {
    notes.push(`Couldn't work out what pictures to look for: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!queries.length) return { added: [], notes };

  // (one search after another, a moment apart: the picture sites turn away many at once)
  const found: OpenPicture[][] = [];
  for (const q of queries) {
    if (Date.now() > deadline - 40_000) break;
    found.push(await searchOpenPictures(q, 4).catch(() => [] as OpenPicture[]));
    await new Promise((r) => setTimeout(r, 350));
  }
  // one from each search first, then the seconds: variety before depth
  const line: OpenPicture[] = [];
  const seen = new Set<string>();
  for (let rank = 0; rank < 3; rank++) for (const list of found) { const p = list[rank]; if (p && !seen.has(`${p.source}|${p.id}`)) { seen.add(`${p.source}|${p.id}`); line.push(p); } }
  if (!line.length) { notes.push('No free pictures were found for this lesson (the picture sites may not be reachable).'); return { added: [], notes }; }

  const added: Added[] = [];
  let left = 0, next = 0;
  const worker = async () => {
    while (next < line.length && added.length < most && Date.now() < deadline) {
      const pic = line[next++];
      const r = await addOpenPicture(pic, opts.kb, opts.about, true).catch((e) => ({ skipped: e instanceof Error ? e.message : String(e) }));
      if ('skipped' in r) left++; else if (added.length < most && !added.some((a) => a.url === r.url)) added.push(r);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  notes.push(added.length
    ? `Added ${added.length} free picture${added.length === 1 ? '' : 's'} to the lesson's library (Wikimedia Commons / Openverse, each with its credit)${left ? `; ${left} left out (didn't fit, or not right for children)` : ''}.`
    : 'Free pictures were found, but none fit the lesson well enough to add.');
  return { added, notes };
}
