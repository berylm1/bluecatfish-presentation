'use client';

import Link from 'next/link';

// The landing page, in the lesson's own dark ocean look (was: a light silver page, so
// the lesson felt like a different site), with the editors' way in kept small at the bottom.
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-3xl text-center flex flex-col items-center">
          {/* the lesson's own catfish (was: an emoji fish) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/canvas-sample/catfish.svg" alt="" className="w-56 max-w-[60vw] mb-6 drop-shadow-[0_12px_30px_rgba(34,211,238,0.25)]" />
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80 mb-3">A lesson with Professor Marine</p>
          <h1 className="text-5xl md:text-7xl font-bold mb-5">Meet the Blue Catfish</h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-xl">
            A short, hands-on lesson about the giant fish that&apos;s changing the Chesapeake Bay.
          </p>
          {/* was /presentationv2: the canvas page is the main presentation now */}
          <Link
            href="/presentation"
            className="inline-block px-10 py-5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-2xl font-bold shadow-[0_10px_40px_rgba(34,211,238,0.35)] transition-colors"
          >
            ▶ Start the lesson
          </Link>
          <Link href="/presentationv2" className="mt-6 text-sm text-slate-400 hover:text-white underline">
            Classic version (full AI lesson)
          </Link>
        </div>
      </div>
      {/* For the editors (Kai, Beryl, Dr. Cao): the editor asks for the password (lib/editorAuth.ts), and
          has Lesson review in its top bar. Was: big "Lesson Review" and "Slide Editor" buttons learners saw first */}
      <footer className="pb-5 text-center">
        <Link href="/slideEditor" className="text-xs text-slate-400 hover:text-white underline">Admin</Link>
      </footer>
    </main>
  );
}
