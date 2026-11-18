'use client';

import { learnerHeaders } from '@/lib/learnerSession';

// Errors on people's computers, sent to /api/log-error (migration 023: client_errors). Nothing is sent on a normal
// run; at most MAX_PER_PAGE a page visit, and the same message once, so a broken loop can't flood the table.
const MAX_PER_PAGE = 5;
const sent = new Set<string>();

export type ErrorKind = 'crash' | 'promise' | 'tutor';

/** The study run this browser is in (its id and whether it's a test), if any */
function studyRun(): { participant?: string; test?: boolean } {
  try {
    for (const key of ['studyRecord', 'study2Record']) {
      const r = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (r && typeof r.id === 'string' && r.step !== 'done') return { participant: r.id, test: !!r.test };
    }
  } catch { /* private mode */ }
  return {};
}

export function reportError(kind: ErrorKind, message: string, detail?: string) {
  try {
    const key = `${kind}:${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    void fetch('/api/log-error', {
      method: 'POST', keepalive: true,
      headers: learnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ kind, message: message.slice(0, 500), detail: detail?.slice(0, 2000), page: location.pathname, ...studyRun() }),
    }).catch(() => {});
  } catch { /* never an error of its own */ }
}
