// Checks a running copy of the site the way a learner meets it: node scripts/preview-check.mjs <base URL> [lesson id]
// (run by .github/workflows/preview-check.yml on every Vercel preview; or by hand against any address).
// No passwords are used: it only looks at what anyone with the link can see.
//   1. the home page opens
//   2. the lesson's details are served (/api/deck/info)
//   3. the lesson starts, shows its first slide, and Next moves on, with no error on the page
//   4. the editor is still behind its lock
// Exits 1 on the first thing that's wrong, saying what.
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? '').replace(/\/$/, '');
const LESSON = process.argv[3] ?? process.env.LESSON ?? '';
if (!/^https?:\/\//.test(BASE)) { console.error('Give the address to check: node scripts/preview-check.mjs https://…'); process.exit(2); }
const q = LESSON ? `?lesson=${encodeURIComponent(LESSON)}` : '';
const fail = (what) => { console.error(`FAILED: ${what}`); process.exit(1); };
const ok = (what) => console.log(`ok: ${what}`);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const errors = [], badCalls = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('response', (r) => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin && u.pathname.startsWith('/api/') && r.status() >= 500) badCalls.push(`${r.status()} ${u.pathname}`); });
  // (a test run isn't a learner: nothing is written to the learner data)
  await page.route('**/api/signals/**', (rt) => rt.fulfill({ json: {} }));

  const home = await page.goto(`${BASE}/${q}`, { timeout: 90_000 });
  if (!home || home.status() >= 400) fail(`the home page answered ${home?.status()}`);
  ok('the home page opens');

  const info = await page.request.get(`${BASE}/api/deck/info?lesson=${encodeURIComponent(LESSON || 'blue-catfish')}`);
  // A preview that Vercel keeps behind its own login answers every address with its sign-in page: nothing of the
  // site can be seen from outside, so there's nothing to check (not a failure of the site)
  if (info.ok() && !/json/i.test(info.headers()['content-type'] ?? '')) {
    console.log('SKIPPED: this preview is behind a Vercel login (deployment protection), so it can’t be checked from outside.');
    process.exit(0);
  }
  const title = info.ok() ? (await info.json().catch(() => ({}))).title : null;
  if (!title) fail(`/api/deck/info answered ${info.status()} with no lesson title`);
  ok(`the lesson is served: “${title}”`);

  await page.goto(`${BASE}/presentation${q}`, { timeout: 90_000 });
  await page.waitForSelector('button:has-text("Got it")', { timeout: 90_000 }).catch(() => fail('the lesson page never showed its first screen'));
  await page.click('button:has-text("Got it")');
  await page.waitForTimeout(1000);
  for (const name of ['Start', 'Continue']) { const b = await page.$(`button:has-text("${name}")`); if (b) { await b.click().catch(() => {}); await page.waitForTimeout(1200); } }
  const slide = () => page.evaluate(() => document.body.innerText.match(/SLIDE (\d+) OF (\d+)/i)?.[1] ?? null);
  await page.waitForFunction(() => /SLIDE \d+ OF \d+/i.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => fail('the lesson started but no slide showed'));
  if (!(await page.$('[data-slide-id]'))) fail('no slide is drawn');
  const first = await slide();
  ok(`the lesson starts (slide ${first})`);
  // Next, a few times, a little apart (as a person would): the lesson has to get past its first slide
  let moved = false;
  for (let i = 0; i < 12 && !moved; i++) {
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(3500);
    moved = (await slide()) !== first;
  }
  if (!moved) fail('pressing Next never left the first slide');
  ok('Next moves to another slide');
  if (errors.length) fail(`an error on the lesson page: ${errors[0]}`);
  if (badCalls.length) fail(`the server failed a request: ${badCalls[0]}`);
  ok('no errors on the page, no failed requests');

  const editor = await page.goto(`${BASE}/slideEditor`, { timeout: 60_000 });
  if (!/\/unlock/.test(page.url())) fail(`the editor opened without its lock (it went to ${page.url()}, status ${editor?.status()})`);
  ok('the editor is behind its lock');
  console.log('ALL CHECKS PASSED');
} finally {
  await browser.close();
}
