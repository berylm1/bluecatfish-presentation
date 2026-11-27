'use client';

import { useEffect, useState } from 'react';

/*
 * Which knowledge base an upload goes in (supabase/migrations/024_knowledge_bases.sql): the list, and a new one.
 * Before the migration is run there's only the blue catfish lesson's.
 */
export default function KbPicker({ value, onChange, pictures = false }: { value: string; onChange: (id: string) => void; pictures?: boolean }) {
  const [bases, setBases] = useState<{ id: string; title: string; chunks?: number; pictures?: number }[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = () => fetch('/api/editor/knowledge-bases').then((r) => r.json()).then((d) => { setBases(d.bases ?? []); setMigrated(d.migrated !== false); }).catch(() => setError('Couldn’t load the knowledge bases'));
  useEffect(() => { void load(); }, []);
  const add = async () => {
    setError('');
    const res = await fetch('/api/editor/knowledge-bases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? 'Couldn’t add it'); return; }
    await load(); onChange(d.base.id); setAdding(false); setName('');
  };
  const list = bases.filter((b) => pictures || b.id !== 'shared');
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-700">Knowledge base</label>
      <div className="flex gap-2">
        <select className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" value={value} onChange={(e) => onChange(e.target.value)} disabled={!migrated}>
          {list.map((b) => (
            <option key={b.id} value={b.id}>{b.title}{typeof b.chunks === 'number' ? ` (${pictures ? `${b.pictures} pictures` : `${b.chunks} pieces`})` : ''}</option>
          ))}
        </select>
        {migrated && !adding && <button type="button" className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50" onClick={() => setAdding(true)}>＋ New</button>}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name, e.g. Fractions" maxLength={100} />
          <button type="button" className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50" disabled={!name.trim()} onClick={add}>Add</button>
          <button type="button" className="px-2 text-slate-500 text-sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        {!migrated ? 'Everything goes in the blue catfish lesson’s until migration 024 is run in Supabase.'
          : pictures ? 'Lessons search their own knowledge bases. “Shared” pictures are offered to every lesson.' : 'Each lesson searches its own knowledge bases (set in the editor’s Lesson panel).'}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
