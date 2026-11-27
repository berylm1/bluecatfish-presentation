// Runs once when a server instance starts (Next.js: instrumentation.ts).
// Sets the hook that counts each OpenAI call for its lesson (lib/usage.ts): lib/canvas/ai.ts calls it, and can't
// import it directly because that file is also bundled for the browser (the editor uses some of its neighbours).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordUsage } = await import('./lib/usage');
  (globalThis as { __aiUsage?: typeof recordUsage }).__aiUsage = recordUsage;
}
