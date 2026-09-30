'use client';

import { useEffect, useState } from 'react';

// Only go back to a page on this site ("/slideEditor"), never an outside link
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/slideEditor';
}

export default function Unlock() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/slideEditor');

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get('next')));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/editor/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Could not unlock');
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-4">
        <div className="text-4xl text-center">🔒</div>
        <h1 className="text-2xl font-bold text-center text-slate-900">Editors only</h1>
        <p className="text-sm text-slate-600 text-center">Type the password to open this page.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="px-4 py-3 rounded-lg border border-slate-300 text-slate-900 outline-none focus:border-cyan-500"
        />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={busy || !password} className="px-4 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50">
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
