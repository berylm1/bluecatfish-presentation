// Password gate for the editor pages and their APIs (see proxy.ts).
// Passwords live in the EDITOR_PASSWORDS env var ("Kai,Beryl,Dr. Cao"); the
// password someone uses is also their name ("last edited by Dr. Cao"). Names
// may have spaces and dots.
//
// After unlocking, the browser keeps a signed cookie: name.expiry.signature.
// The signature is an HMAC keyed with the password list, so changing the
// passwords in Vercel logs everyone out. Web Crypto only, so it runs in the
// middleware (edge) and in API routes alike.

export const AUTH_COOKIE = 'editor_auth';
export const NAME_COOKIE = 'editor_name';   // readable by the page, for "Unlocked as Kai"
export const AUTH_DAYS = 30;

/** Pages and APIs that need the password. */
export const PROTECTED_PAGES = ['/slideEditor', '/imageIngest', '/textIngest', '/instructor-view', '/lessonReview'];
export const PROTECTED_APIS = [
  '/api/editor',        // deck save / publish / upload (step 3)
  '/api/image-Ingest',  // /imageIngest uploads
  '/api/embed',         // /textIngest adds to the knowledge base
  '/api/write-mp3',     // writes audio into storage
  '/api/reanimate',     // starts a (paid) Manim render
  '/api/instructor',    // learner data for /instructor-view (was readable by anyone)
  '/api/chat',          // relay to the OpenClaw agent; no page uses it now, and it was open to anyone
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

function passwords(): string[] {
  return (process.env.EDITOR_PASSWORDS ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function gateConfigured(): boolean {
  return passwords().length > 0;
}

/** The name for a password, or null. Not case-sensitive: "kai" works for "Kai". */
export function checkPassword(input: string): string | null {
  const typed = input.trim().toLowerCase();
  if (!typed) return null;
  return passwords().find((p) => p.toLowerCase() === typed) ?? null;
}

async function sign(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`editor-gate:${passwords().join(',')}`),
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
  // A password removed from the list stops working even with a valid cookie
  return passwords().includes(decoded) ? decoded : null;
}

/** The unlocked editor's name for an API request (the middleware already checked the cookie). */
export async function editorName(req: Request): Promise<string> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
  return (await verifyToken(m ? decodeURIComponent(m[1]) : undefined)) ?? 'unknown';
}
