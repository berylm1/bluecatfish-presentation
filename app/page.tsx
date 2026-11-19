'use client';

import Link from 'next/link';
import { useState } from 'react';
import { freshStart, readStudy } from '@/lib/study/client';
import Icon, { type IconName } from '@/components/Icon';
import { STUDY_OPEN } from '@/lib/settings';

// The two versions of the lesson (STUDY_OPEN off: Start offers them; nothing is saved to the study)
const VERSIONS: { href: string; name: string; line: string; has: { icon: IconName; text: string }[] }[] = [
  {
    href: '/presentation', name: 'Adaptive', line: 'The lesson notices you and answers back.',
    has: [{ icon: 'microphone', text: 'Ask the professor anything' }, { icon: 'classmates', text: 'Classmates Maya, Finn and Leo' }, { icon: 'simpler', text: 'Simpler words, another way to see it' }],
  },
  {
    href: '/presentation?mode=static', name: 'Static', line: 'The same slides, narrated start to finish.',
    has: [{ icon: 'speaker', text: 'The professor reads each slide' }, { icon: 'hands-on-activity', text: 'The same hands-on activities' }, { icon: 'pause', text: 'Pause, back and next, like a video' }],
  },
];

// The landing page, in the lesson's own dark ocean look (was: a light silver page, so
// the lesson felt like a different site), with the editors' way in kept small at the bottom.
export default function Home() {
  const [cleared, setCleared] = useState(false);
  const [choosing, setChoosing] = useState(false);   // (STUDY_OPEN off) Start pressed: adaptive or static
  // In person, one computer for everyone: the next person starts fresh (asked for their name again, from the first slide)
  const newPerson = () => {
    const mid = [readStudy(1), readStudy(2)].some((r) => r && r.step !== 'done');   // (either study)
    if (!window.confirm(mid
      ? 'Someone is partway through the study on this computer. Start fresh for a new person? (What they did so far stays saved.)'
      : 'Start fresh for a new person? This computer forgets the last person’s name and where they were.')) return;
    freshStart();
    setCleared(true);
  };
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
          {STUDY_OPEN ? (
            <>
              {/* The main study, static vs adaptive (in person: app/study, consent first) */}
              <Link
                href="/study"
                className="inline-block px-10 py-5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-2xl font-bold shadow-[0_10px_40px_rgba(34,211,238,0.35)] transition-colors"
              >
                ▶ Start the lesson
              </Link>
              {/* The lesson on its own, outside the study (nothing saved to the study) */}
              <Link href="/presentation" className="mt-6 text-sm text-slate-400 hover:text-white underline">
                Just the lesson (not the study)
              </Link>
            </>
          ) : !choosing ? (
            <button
              onClick={() => setChoosing(true)}
              className="inline-block px-10 py-5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-2xl font-bold shadow-[0_10px_40px_rgba(34,211,238,0.35)] transition-colors"
            >
              ▶ Start the lesson
            </button>
          ) : (
            // The study's two versions, to try either (was: Start went to the study, consent first)
            <div className="w-full max-w-2xl animate-[pop-in_300ms_ease-out_both]" data-version-choice>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80 mb-4">Pick a version</p>
              <div className="grid sm:grid-cols-2 gap-4 text-left">
                {VERSIONS.map((v) => (
                  <Link key={v.name} href={v.href}
                    className="group rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-cyan-300/50 p-5 transition-colors flex flex-col">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-2xl font-bold">{v.name}</span>
                      <span className="text-cyan-300/70 group-hover:text-cyan-200 text-sm transition-colors">Start →</span>
                    </span>
                    <span className="mt-1 text-sm text-slate-300">{v.line}</span>
                    <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-400">
                      {v.has.map((h) => (
                        <li key={h.text} className="flex items-center gap-2.5"><span className="text-cyan-300/80"><Icon name={h.icon} /></span>{h.text}</li>
                      ))}
                    </ul>
                  </Link>
                ))}
              </div>
              <button onClick={() => setChoosing(false)} className="mt-5 text-sm text-slate-400 hover:text-white underline">Back</button>
            </div>
          )}
          {/* The classic version, hidden for now (the study's lesson is the canvas one):
          <Link href="/presentationv2" className="mt-6 text-sm text-slate-400 hover:text-white underline">
            Classic version (full AI lesson)
          </Link> */}
        </div>
      </div>
      {/* For the editors (Kai, Beryl, Dr. Cao): the editor asks for the password (lib/editorAuth.ts), and
          has Lesson review in its top bar. Was: big "Lesson Review" and "Slide Editor" buttons learners saw first */}
      <footer className="pb-5 flex items-center justify-center gap-4 text-xs">
        <button onClick={newPerson} className="text-slate-400 hover:text-white underline">{cleared ? '✓ Fresh start: ready for the next person' : '↺ New person (fresh start)'}</button>
        <Link href="/slideEditor" className="text-slate-400 hover:text-white underline">Admin</Link>
      </footer>
    </main>
  );
}
