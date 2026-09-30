'use client';

// An id for this browser tab's lesson, sent with requests to the paid
// endpoints so they can be rate-limited per learner (lib/rateLimit.ts), not
// only per internet address (a whole class shares one at school).
let id: string | null = null;

export function learnerSessionId(): string {
  if (id) return id;
  try { id = sessionStorage.getItem('learner_session'); } catch { /* private mode */ }
  if (!id) {
    id = `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem('learner_session', id); } catch { /* fine */ }
  }
  return id;
}

/** Headers for fetch calls to the rate-limited endpoints. */
export function learnerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, 'X-Learner-Session': learnerSessionId() };
}
