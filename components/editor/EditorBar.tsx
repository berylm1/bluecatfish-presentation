'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/** "Unlocked as Kai · Lock", shown on the password-protected pages. */
export default function EditorBar() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)editor_name=([^;]*)/);
    setName(m ? decodeURIComponent(m[1]) : null);
  }, []);

  const lock = async () => {
    await fetch('/api/editor/lock', { method: 'POST' });
    window.location.href = '/';
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 bg-slate-900 text-slate-200 text-sm">
      <nav className="flex gap-4">
        <Link href="/slideEditor" className="hover:text-white">Slide editor</Link>
        <Link href="/lessonReview" className="hover:text-white">Lesson review</Link>
        <Link href="/imageIngest" className="hover:text-white">Image upload</Link>
        <Link href="/textIngest" className="hover:text-white">Text upload</Link>
      </nav>
      <div className="flex items-center gap-3">
        {name && <span>Unlocked as <b className="text-white">{name}</b></span>}
        <button onClick={lock} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20">Lock</button>
      </div>
    </div>
  );
}
