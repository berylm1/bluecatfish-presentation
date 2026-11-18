'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/reportError';

/** Sends errors in the page (and promises nobody caught) to the error log (lib/reportError.ts). In the root layout. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (!e.message) return;
      // (a browser extension's, or a script from elsewhere: not ours)
      if (e.filename && !e.filename.startsWith(location.origin)) return;
      reportError('crash', e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const message = r instanceof Error ? r.message : typeof r === 'string' ? r : '';
      // (a request cut short on purpose, or the page closing: not a problem)
      if (!message || (r instanceof DOMException && (r.name === 'AbortError' || r.name === 'TimeoutError'))) return;
      reportError('promise', message, r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
