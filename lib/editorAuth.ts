// Password gate for the editor pages and their APIs (see proxy.ts).
// Editors live in the EDITOR_PASSWORDS env var, each "Name:password", comma-separated:
// "Kai:some-long-password,Beryl:another-one,Dr. Cao:a-third". The name is what's shown
// ("last edited by Dr. Cao"); the password (after the first ":") is what's typed.
// An entry with no ":" is the old form, where the name is the password ("Kai"): it still
// works, but a name is easy to guess (and the editor holds the study's answers).
//
// After unlocking, the browser keeps a signed cookie: name.expiry.signature.
// The signature is an HMAC keyed with the password list, so changing the
// passwords in Vercel logs everyone out. Web Crypto only, so it runs in the
// middleware (edge) and in API routes alike.

export const AUTH_COOKIE = 'editor_auth';
export const NAME_COOKIE = 'editor_name';   // readable by the page, for "Unlocked as Kai"
export const AUTH_DAYS = 30;

/** Pages and APIs that need the password. */
export const PROTECTED_PAGES = ['/slideEditor', '/imageIngest', '/textIngest', '/instructor-view', '/lessonReview', '/studyResults'];
export const PROTECTED_APIS = [
  '/api/editor',        // deck save / publish / upload (step 3)
  '/api/image-Ingest',  // /imageIngest uploads
  '/api/embed',         // /textIngest adds to the knowledge base
  '/api/write-mp3',     // writes audio into storage
  '/api/reanimate',     // starts a (paid) Manim render
  '/api/instructor',    // learner data for /instructor-view (was readable by anyone)
  '/api/chat',          // relay to the OpenClaw agent; no page uses it now, and it was open to anyone
  '/api/study/results', // the study's answers (/studyResults); /api/study itself is open (people taking part)
];
// Open even under /api/editor: the unlock endpoint itself
const OPEN_APIS = ['/api/editor/unlock', '/api/editor/lock'];

export function isProtected(rawPath: string): 'page' | 'api' | null {
  // Compare decoded and lowercased, so /api/%65mbed or /API/embed can't slip past
  let path = rawPath;
  try { path = decodeURIComponent(rawPath); } catch { /* keep as is */ }
  path = path.toLowerCase().replace(/\/+$/, '') || '/';
  const under = (p: string, prefix: string) => {
    const pre = prefix.toLowerCase();
    return p === pre || p.startsWith(pre + '/');
  };
  if (OPEN_APIS.some((p) => under(path, p))) return null;
  if (PROTECTED_APIS.some((p) => under(path, p))) return 'api';
  if (PROTECTED_PAGES.some((p) => under(path, p))) return 'page';
  return null;
}

type Editor = { name: string; password: string; old: boolean };
function editors(): Editor[] {
  return (process.env.EDITOR_PASSWORDS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(':');
      return at > 0
        ? { name: entry.slice(0, at).trim(), password: entry.slice(at + 1).trim(), old: false }
        : { name: entry, password: entry, old: true };
    })
    .filter((e) => e.name && e.password);
}

export function gateConfigured(): boolean {
  return editors().length > 0;
}

/** The name for a password, or null. A real password must match exactly; an old name-as-password entry isn't case-sensitive ("kai" works for "Kai"). */
export function checkPassword(input: string): string | null {
  const typed = input.trim();
  if (!typed) return null;
  return editors().find((e) => (e.old ? e.password.toLowerCase() === typed.toLowerCase() : e.password === typed))?.name ?? null;
}

async function sign(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`editor-gate:${editors().map((e) => `${e.name}:${e.password}`).join(',')}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeToken(name: string): Promise<string> {
  const expires = Date.now() + AUTH_DAYS * 24 * 60 * 60 * 1000;
  // Dots are encoded too: the token's parts are split on "." (a name like
  // "Dr. Cao" otherwise made a cookie that never verified)
  const body = `${encodeURIComponent(name).replace(/\./g, '%2E')}.${expires}`;
  return `${body}.${await sign(body)}`;
}

/** The unlocked name if the cookie is valid and not expired, otherwise null. */
export async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token || !gateConfigured()) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [name, expires, sig] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return null;
  const expected = await sign(`${name}.${expires}`);
  // Constant-time compare
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  const decoded = decodeURIComponent(name);
  // An editor removed from the list stops working even with a valid cookie
  return editors().some((e) => e.name === decoded) ? decoded : null;
}

/** The unlocked editor's name for an API request (the middleware already checked the cookie). */
export async function editorName(req: Request): Promise<string> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
  return (await verifyToken(m ? decodeURIComponent(m[1]) : undefined)) ?? 'unknown';
}
