'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';
import { STUDY_OPEN } from '@/lib/settings';

// The two versions of the lesson (STUDY_OPEN off: Start offers them; nothing is saved to the study)
const VERSIONS: { mode: '' | 'static'; name: string; line: string; has: { icon: IconName; text: string }[] }[] = [
  {
    mode: '', name: 'Adaptive', line: 'The lesson notices you and answers back.',
    has: [{ icon: 'microphone', text: 'Ask the professor anything' }, { icon: 'classmates', text: 'Classmates Maya, Finn and Leo' }, { icon: 'simpler', text: 'Simpler words, another way to see it' }],
  },
  {
    mode: 'static', name: 'Static', line: 'The same slides, narrated start to finish.',
    has: [{ icon: 'speaker', text: 'The professor reads each slide' }, { icon: 'hands-on-activity', text: 'The same hands-on activities' }, { icon: 'pause', text: 'Pause, back and next, like a video' }],
  },
];

// The landing page, in the lesson's own dark ocean look (was: a light silver page, so
// the lesson felt like a different site), with the editors' way in kept small at the bottom.
export default function Home() {
  const router = useRouter();
  // (STUDY_OPEN off) Start pressed: adaptive or static; adaptive: the camera, then the microphone, then the lesson
  const [step, setStep] = useState<'start' | 'choose' | 'camera' | 'mic'>('start');
  const [camera, setCamera] = useState(false);
  const [asking, setAsking] = useState(false);   // the browser's permission prompt is up
  // The browser's prompt for the camera or the microphone (what's allowed is remembered for the lesson); no or an error: fine,
  // the lesson goes on without it. Nothing is kept: the stream stops at once
  const allow = async (kind: 'video' | 'audio'): Promise<boolean> => {
    setAsking(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: true } : { audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    } finally {
      setAsking(false);
    }
  };
  // Another lesson than the blue catfish one: /?lesson=<its id> (its name, its line and its teacher come from its
  // profile, /api/deck/info; the blue catfish lesson's page is as it always was)
  const [lesson, setLesson] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; pitch: string; about: string; teacher: string; picture: string } | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('lesson');
    if (!id || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(id) || /^blue-catfish$/.test(id)) return;
    setLesson(id);
    fetch(`/api/deck/info?lesson=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.title) setInfo(d); }).catch(() => {});
  }, []);
  /** The lesson's page, for this lesson and these choices */
  const lessonUrl = (o: { mode?: string; camera?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (lesson) q.set('lesson', lesson);
    if (o.mode) q.set('mode', o.mode);
    if (o.camera) q.set('camera', '1');
    const s = q.toString();
    return s ? `/presentation?${s}` : '/presentation';
  };
  const go = (cam: boolean) => router.push(lessonUrl({ camera: cam }));
  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-3xl text-center flex flex-col items-center">
          {/* eslint-disable @next/next/no-img-element */}
          {lesson ? (
            // (another lesson: its teacher's picture, if it has one; no catfish)
            info?.picture
              ? <img src={info.picture} alt="" className="w-28 h-28 rounded-full object-cover mb-6 ring-4 ring-cyan-300/30 drop-shadow-[0_12px_30px_rgba(34,211,238,0.25)]" />
              : <div className="h-6" />
          ) : (
            // the blue catfish lesson's own catfish (was: an emoji fish)
            <img src="/canvas-sample/catfish.svg" alt="" className="w-56 max-w-[60vw] mb-6 drop-shadow-[0_12px_30px_rgba(34,211,238,0.25)]" />
          )}
          {/* eslint-enable @next/next/no-img-element */}
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80 mb-3" data-home-teacher>{lesson ? (info ? `A lesson with ${info.teacher}` : '\u00a0') : 'A lesson with Professor Marine'}</p>
          <h1 className="text-5xl md:text-7xl font-bold mb-5" data-home-title>{lesson ? info?.title ?? '\u00a0' : 'Meet the Blue Catfish'}</h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-xl">
            {lesson ? info?.pitch || (info ? `A short, hands-on lesson about ${info.about}.` : '\u00a0') : <>A short, hands-on lesson about the giant fish that&apos;s changing the Chesapeake Bay.</>}
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
              <Link href={lessonUrl()} className="mt-6 text-sm text-slate-400 hover:text-white underline">
                Just the lesson (not the study)
              </Link>
            </>
          ) : step === 'start' ? (
            <button
              onClick={() => setStep('choose')}
              className="inline-block px-10 py-5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-2xl font-bold shadow-[0_10px_40px_rgba(34,211,238,0.35)] transition-colors"
            >
              ▶ Start the lesson
            </button>
          ) : step === 'camera' ? (
            // Adaptive: the camera, yes or no (was the study's camera check)
            <div className="w-full max-w-md animate-[pop-in_300ms_ease-out_both]" data-setup="camera">
              <div className="text-4xl text-cyan-300 mb-3"><Icon name="camera" /></div>
              <h2 className="text-2xl font-bold">Do you want the camera on?</h2>
              <p className="mt-2 text-slate-300">Raise your hand to ask a question, and the professor notices if you look puzzled. Nothing is recorded, and it stays on this device.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button disabled={asking} onClick={async () => { setCamera(await allow('video')); setStep('mic'); }}
                  className="py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-bold disabled:opacity-60">{asking ? 'Allow it above…' : 'Yes'}</button>
                <button disabled={asking} onClick={() => { setCamera(false); setStep('mic'); }}
                  className="py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xl font-bold disabled:opacity-60">No</button>
              </div>
              <p className="mt-4 text-sm text-slate-400">You can always turn it off later, in Options.</p>
            </div>
          ) : step === 'mic' ? (
            // Adaptive: the microphone (its prompt comes now, not the first time they hold Ask)
            <div className="w-full max-w-md animate-[pop-in_300ms_ease-out_both]" data-setup="mic">
              <div className="text-4xl text-cyan-300 mb-3"><Icon name="microphone" /></div>
              <h2 className="text-2xl font-bold">Turn on the microphone</h2>
              <p className="mt-2 text-slate-300">Then you can hold Ask and say your question out loud.</p>
              <button disabled={asking} onClick={async () => { await allow('audio'); go(camera); }}
                className="mt-6 w-full py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-bold disabled:opacity-60">
                <Icon name="microphone" /> {asking ? 'Allow it above…' : 'Activate mic'}
              </button>
              <button disabled={asking} onClick={() => go(camera)}
                className="mt-3 w-full py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xl font-bold disabled:opacity-60">Skip</button>
              <p className="mt-4 text-sm text-slate-400">That&apos;s fine too: you can type your questions, or turn the mic on later.</p>
            </div>
          ) : (
            // The study's two versions, to try either (was: Start went to the study, consent first)
            <div className="w-full max-w-2xl animate-[pop-in_300ms_ease-out_both]" data-version-choice>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80 mb-4">Pick a version</p>
              <div className="grid sm:grid-cols-2 gap-4 text-left">
                {VERSIONS.map((v) => (
                  // (adaptive: the camera and microphone first)
                  <Link key={v.name} href={lessonUrl({ mode: v.mode })} onClick={(e) => { if (v.name === 'Adaptive') { e.preventDefault(); setStep('camera'); } }}
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
              <button onClick={() => setStep('start')} className="mt-5 text-sm text-slate-400 hover:text-white underline">Back</button>
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
        <Link href="/slideEditor" className="text-slate-400 hover:text-white underline">Admin</Link>
      </footer>
    </main>
  );
}
