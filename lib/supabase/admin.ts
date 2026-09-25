import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client (service role, bypasses RLS), created on first
// use instead of when the module loads. `next build` loads every API route to
// collect page data, so a module-level createClient() failed the whole build
// ("supabaseUrl is required") whenever the env vars weren't set — e.g. a new
// Vercel project or a Preview environment without them.
let client: SupabaseClient | null = null;

function getClient(urlEnv: 'SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_URL'): SupabaseClient {
  if (!client) {
    const url = process.env[urlEnv] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (Vercel → Settings → Environment Variables).');
    }
    client = createClient(url, key);
  }
  return client;
}

/** Drop-in for a module-level `createClient(url, serviceKey)`: same API, created lazily. */
export function lazySupabaseAdmin(urlEnv: 'SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_URL' = 'SUPABASE_URL'): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const c = getClient(urlEnv) as any;
      const value = c[prop];
      return typeof value === 'function' ? value.bind(c) : value;
    },
  });
}
