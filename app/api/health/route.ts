import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRedisHealth } from '@/src/redisClient';

/*
 * Setup check: open /api/health on a deployment to see which services it can
 * actually reach. Never prints key values — only whether they're set and work.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Check = { ok: boolean; detail: string };

const ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'REDIS_URL',
  'MANIM_RENDER_URL',
  'MANIM_RENDER_TOKEN',
  'OPENCLAW_GATEWAY_URL',
  'OPENCLAW_GATEWAY_TOKEN',
];

// "https://abcd.supabase.co" → "abcd" (the project id; not a secret)
function projectRef(url?: string): string | null {
  return url?.match(/^https?:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
}

// Legacy anon/service_role keys are JWTs that name their project; new sb_ keys don't
function keyInfo(key?: string): string {
  if (!key) return 'missing';
  if (key.startsWith('sb_publishable_')) return 'publishable key (sb_publishable_…)';
  if (key.startsWith('sb_secret_')) return 'secret key (sb_secret_…)';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return `legacy ${payload.role} key for project ${payload.ref}`;
  } catch {
    return 'unrecognised format';
  }
}

async function run(fn: () => Promise<Check>): Promise<Check> {
  try {
    return await Promise.race([
      fn(),
      new Promise<Check>((resolve) => setTimeout(() => resolve({ ok: false, detail: 'timed out after 10s' }), 10000)),
    ]);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const env = Object.fromEntries(ENV_VARS.map((v) => [v, process.env[v] ? 'set' : 'MISSING']));

  const serverUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serverUrl && serviceKey ? createClient(serverUrl, serviceKey) : null;
  const needAdmin: Check = { ok: false, detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' };

  const refs = {
    SUPABASE_URL: projectRef(process.env.SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };

  const tableCheck = (table: string) => async (): Promise<Check> => {
    if (!admin) return needAdmin;
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) return { ok: false, detail: error.message || `could not read ${table}` };
    return { ok: true, detail: `${count ?? 0} rows` };
  };

  const [
    serviceKeyCheck,
    audioBucket,
    documents,
    slideTemplates,
    learnerState,
    events,
    anonKey,
    openai,
    redis,
    manim,
  ] = await Promise.all([
    run(async () => {
      if (!admin) return needAdmin;
      const { data, error } = await admin.storage.listBuckets();
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `buckets: ${(data ?? []).map((b) => b.name).join(', ') || '(none)'}` };
    }),
    run(async () => {
      if (!admin) return needAdmin;
      const { data, error } = await admin.storage.getBucket('slide-audio');
      if (error) return { ok: false, detail: `slide-audio bucket: ${error.message}` };
      return { ok: data.public, detail: data.public ? 'exists and is public' : 'exists but is NOT public, so the browser cannot play the clips' };
    }),
    run(tableCheck('documents3')),
    run(tableCheck('slide_templates')),
    run(tableCheck('learner_state')),
    run(tableCheck('events')),
    run(async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return { ok: false, detail: 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set' };
      const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      return { ok: r.ok, detail: r.ok ? 'accepted' : `rejected (HTTP ${r.status})` };
    }),
    run(async () => {
      if (!process.env.OPENAI_API_KEY) return { ok: false, detail: 'OPENAI_API_KEY not set' };
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      return { ok: r.ok, detail: r.ok ? 'key accepted' : `rejected (HTTP ${r.status})` };
    }),
    run(async () => {
      if (!process.env.REDIS_URL) return { ok: false, detail: 'REDIS_URL not set: lessons are rebuilt on every visit' };
      const ok = await checkRedisHealth();
      return { ok, detail: ok ? 'connected' : 'could not connect' };
    }),
    run(async () => {
      const raw = process.env.MANIM_RENDER_URL;
      if (!raw) return { ok: false, detail: 'MANIM_RENDER_URL not set: no animations' };
      const base = raw.startsWith('http') ? raw : `https://${raw}`;
      const r = await fetch(`${base.replace(/\/$/, '')}/health`);
      return { ok: r.ok, detail: r.ok ? 'render service is up' : `health check failed (HTTP ${r.status})` };
    }),
  ]);

  const supabaseProject: Check =
    !refs.SUPABASE_URL || !refs.NEXT_PUBLIC_SUPABASE_URL
      ? { ok: false, detail: `a Supabase URL is missing or not https://<id>.supabase.co: ${JSON.stringify(refs)}` }
      : refs.SUPABASE_URL === refs.NEXT_PUBLIC_SUPABASE_URL
        ? { ok: true, detail: `both URLs point at project ${refs.SUPABASE_URL}` }
        : { ok: false, detail: `the two URLs point at different projects: ${JSON.stringify(refs)}` };

  const checks = {
    supabaseProject,
    supabaseServiceKey: serviceKeyCheck,
    supabaseAnonKey: anonKey,
    audioBucket,
    factsheetDocuments: documents,
    variantSlides: slideTemplates,
    learnerState,
    events,
    openai,
    redis,
    manim,
  };

  return NextResponse.json(
    {
      ok: Object.values(checks).every((c) => c.ok),
      checks,
      keys: {
        SUPABASE_SERVICE_ROLE_KEY: keyInfo(serviceKey),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: keyInfo(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      },
      env,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
