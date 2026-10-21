'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSENT, DEMOGRAPHICS, POST_QUIZ, PRE_QUIZ, SCALE, STUDY_LESSON, STUDY_MINUTES, STUDY_TITLE, surveyFor,
  type DemographicId, type QuizQuestion, type StudyGroup,
} from '@/lib/study/content';
import { isComputer, readStudy, seenBefore, studyPost, writeStudy, type StudyRecord } from '@/lib/study/client';

/*
 * The online study: consent → about you → pre-quiz → Start (the group is picked) → sound, mic and
 * camera checks → the lesson (/presentation?study=…, with or without the classmates) → post-quiz →
 * questionnaire → how you did. Each step is saved as it's done (/api/study), and this browser
 * remembers where they are, so a refresh picks up there. ?test=1: a test run (not in the results,
 * and the group can be chosen).
 */

type Step = 'consent' | 'about' | 'pre' | 'start' | 'checks' | 'lesson' | 'post' | 'survey' | 'done';
const ORDER: Step[] = ['consent', 'about', 'pre', 'start', 'checks', 'lesson', 'post', 'survey', 'done'];
type Results = {
  pre: { right: number; of: number };
  post: { right: number; of: number };
  review: { pre: Review[]; post: Review[] };
};
type Review = { id: string; q: string; yours: string | null; right: string; correct: boolean };

const card = 'w-full max-w-2xl rounded-2xl bg-white text-slate-900 shadow-2xl p-6 sm:p-8';
const primary = 'px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold';
const quiet = 'px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm';
const STEP_LABELS: [Step[], string][] = [[['consent', 'about'], 'About you'], [['pre'], 'Quiz 1'], [['start', 'checks', 'lesson'], 'Lesson'], [['post'], 'Quiz 2'], [['survey', 'done'], 'Questions']];

export default function Study() {
  const [ready, setReady] = useState(false);
  const [computer, setComputer] = useState(true);
  const [rec, setRec] = useState<StudyRecord | null>(null);
  const [step, setStep] = useState<Step>('consent');
  const [test, setTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setComputer(isComputer());
    const saved = readStudy();
    setTest(saved ? saved.test : params.get('test') === '1');
    if (saved) {
      setRec(saved);
      setStep(saved.step as Step);
      // the server's step wins (another tab may have gone further)
      // (the further of the two: another tab may have gone on, or the lesson's "finished" save may not have reached the server)
      studyPost('get', { id: saved.id }).then((d) => {
        const later = ORDER.indexOf(d.step) >= ORDER.indexOf(saved.step as Step) ? d.step : saved.step;
        if (later !== d.step) studyPost('save', { id: saved.id, step: later, ...(later === 'post' ? { lessonFinished: true } : {}) }).catch(() => {});
        const r = { ...saved, step: later, group: d.group ?? saved.group };
        writeStudy(r); setRec(r); setStep(later as Step);
      }).catch(() => { /* offline for a moment: the browser's step */ });
    }
    setReady(true);
  }, []);

  /** Run a save; on success go to the next step */
  const go = useCallback(async (next: Step, work: () => Promise<Partial<StudyRecord> | void>) => {
    setBusy(true); setError(null);
    try {
      const more = (await work()) || {};
      setRec((r) => {
        const n = { ...(r as StudyRecord), ...more, step: next };
        writeStudy(n);
        return n;
      });
      setStep(next);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const resetTest = () => {
    if (!window.confirm('Forget this test run on this browser and start again?')) return;
    writeStudy(null);
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('lessonProgress:')) localStorage.removeItem(k); } catch { /* fine */ }
    window.location.href = '/study?test=1';
  };

  if (!ready) return <Shell><div className="w-10 h-10 rounded-full border-4 border-cyan-300/30 border-t-cyan-300 animate-spin" /></Shell>;

  if (!computer && !test) {
    return (
      <Shell>
        <div className={card}>
          <h1 className="text-2xl font-bold">Please use a laptop or desktop</h1>
          <p className="mt-3 text-slate-700">This study needs a computer with sound (not a phone or tablet). Open this same link on a laptop or desktop computer to take part.</p>
          <button className={`${primary} mt-5`} onClick={() => navigator.clipboard?.writeText(window.location.href.replace(/\?.*$/, ''))}>Copy the link</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell test={test} onReset={resetTest} step={step}>
      {error && <div className="w-full max-w-2xl mb-3 rounded-xl bg-red-100 text-red-900 px-4 py-3 text-sm">{error}</div>}

      {step === 'consent' && (
        <div className={card}>
          <p className="text-sm font-semibold text-cyan-700">{STUDY_TITLE}</p>
          <h1 className="text-2xl font-bold mt-1">{CONSENT.heading}</h1>
          <div className="mt-4 flex flex-col gap-3 text-slate-700 leading-relaxed">
            {CONSENT.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            <p className="text-sm text-slate-500">{CONSENT.contact}</p>
          </div>
          <Consent busy={busy} onAgree={() => go('about', async () => {
            const d = await studyPost('join', { test, seenBefore: seenBefore(), device: navigator.userAgent, screen: `${window.screen.width}x${window.screen.height}` });
            return { id: d.id, test };
          })} />
        </div>
      )}

      {step === 'about' && rec && (
        <About busy={busy} onDone={(about) => go('pre', () => studyPost('save', { id: rec.id, about, step: 'pre' }))} />
      )}

      {step === 'pre' && rec && (
        <Quiz key="pre" title="Quiz 1 of 2" intro="5 quick questions before the lesson. It’s fine not to know: just pick your best guess. You’ll see how you did at the very end."
          questions={PRE_QUIZ} busy={busy}
          onDone={(answers, times, ms) => go('start', () => studyPost('pre', { id: rec.id, answers, times, ms }))} />
      )}

      {step === 'start' && rec && (
        <div className={card}>
          <h1 className="text-2xl font-bold">Ready for the lesson</h1>
          <p className="mt-3 text-slate-700">Next you’ll check your sound, microphone and camera, then the lesson starts. It takes about 15–20 minutes. Find a quiet spot and turn your sound on.</p>
          <p className="mt-2 text-slate-700">In the lesson you can ask Professor Marine questions out loud, or type them in the chat.</p>
          {test ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="w-full text-sm text-amber-700">Test run: pick the group to try.</span>
              {([['classmates', 'With classmates'], ['no_classmates', 'Without classmates'], [null, 'Random']] as const).map(([g, label]) => (
                <button key={label} className={primary} disabled={busy}
                  onClick={() => go('checks', async () => ({ group: (await studyPost('assign', { id: rec.id, group: g })).group }))}>{label}</button>
              ))}
            </div>
          ) : (
            <button className={`${primary} mt-5`} disabled={busy}
              onClick={() => go('checks', async () => ({ group: (await studyPost('assign', { id: rec.id })).group }))}>Start</button>
          )}
        </div>
      )}

      {step === 'checks' && rec && (
        <Checks busy={busy} onDone={(checks) => go('lesson', async () => {
          await studyPost('save', { id: rec.id, checks, step: 'lesson' });
          return { camera: checks.camera_ok };
        })} />
      )}

      {step === 'lesson' && rec && <LessonStep rec={rec} />}

      {step === 'post' && rec && (
        <Quiz key="post" title="Quiz 2 of 2" intro="Questions about the lesson. Some you’ve seen before. Answer each as best you can; you’ll see how you did at the end."
          questions={POST_QUIZ} busy={busy}
          onDone={(answers, times, ms) => go('survey', () => studyPost('post', { id: rec.id, answers, times, ms }))} />
      )}

      {step === 'survey' && rec && (
        <Survey group={rec.group ?? null} busy={busy} onDone={(answers) => go('done', async () => {
          setResults(await studyPost<Results>('survey', { id: rec.id, answers, ms: Date.now() - startedAt.current }));
        })} />
      )}

      {step === 'done' && rec && <Done rec={rec} results={results} setResults={setResults} />}
    </Shell>
  );
}

function Shell({ children, test, onReset, step }: { children: React.ReactNode; test?: boolean; onReset?: () => void; step?: Step }) {
  const at = step ? STEP_LABELS.findIndex(([s]) => s.includes(step)) : -1;
  return (
    <main className="min-h-screen flex flex-col items-center gap-4 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white px-4 py-8">
      {test && (
        <div className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-sm font-semibold flex items-center gap-3">
          Test run: not counted in the results
          {onReset && <button className="underline" onClick={onReset}>Start over</button>}
        </div>
      )}
      {at >= 0 && (
        <ol className="flex gap-2 text-xs sm:text-sm" aria-label="Progress">
          {STEP_LABELS.map(([, label], i) => (
            <li key={label} className={`px-3 py-1 rounded-full ${i < at ? 'bg-cyan-400/25 text-cyan-100' : i === at ? 'bg-cyan-400 text-slate-950 font-semibold' : 'bg-white/10 text-white/50'}`}>{label}</li>
          ))}
        </ol>
      )}
      <div className="flex-1 w-full flex flex-col items-center justify-center">{children}</div>
    </main>
  );
}

function Consent({ busy, onAgree }: { busy: boolean; onAgree: () => void }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5 accent-cyan-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span className="font-medium">{CONSENT.agree}</span>
      </label>
      <button className={`${primary} self-start`} disabled={!agree || busy} onClick={onAgree}>I agree, continue</button>
    </div>
  );
}

function About({ busy, onDone }: { busy: boolean; onDone: (about: Partial<Record<DemographicId, string>>) => void }) {
  const [a, setA] = useState<Partial<Record<DemographicId, string>>>({});
  const missing = DEMOGRAPHICS.filter((d) => !d.optional && !a[d.id]?.trim());
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">A few questions about you</h1>
      <p className="mt-1 text-slate-600 text-sm">No names: none of this identifies you.</p>
      <div className="mt-5 flex flex-col gap-5">
        {DEMOGRAPHICS.map((d) => (
          <fieldset key={d.id}>
            <legend className="font-semibold mb-2">{d.q}</legend>
            {d.text ? (
              <input className="w-full px-3 py-2 rounded-lg border border-slate-300" maxLength={200} value={a[d.id] ?? ''} onChange={(e) => setA({ ...a, [d.id]: e.target.value })} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {d.choices!.map((c) => (
                  <button key={c} type="button" onClick={() => setA({ ...a, [d.id]: c })} aria-pressed={a[d.id] === c}
                    className={`px-3 py-2 rounded-lg border text-sm ${a[d.id] === c ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-300 hover:border-cyan-500'}`}>{c}</button>
                ))}
              </div>
            )}
          </fieldset>
        ))}
      </div>
      <button className={`${primary} mt-6`} disabled={busy || missing.length > 0} onClick={() => onDone(a)}>Continue</button>
      {missing.length > 0 && <p className="mt-2 text-xs text-slate-500">Answer every question to continue ({missing.length} left).</p>}
    </div>
  );
}

/** One question at a time, no going back and no right/wrong shown (the answers come at the very end) */
function Quiz({ title, intro, questions, busy, onDone }: {
  title: string; intro: string; questions: QuizQuestion[]; busy: boolean;
  onDone: (answers: Record<string, string>, times: Record<string, number>, ms: number) => void;
}) {
  const [i, setI] = useState(-1);   // -1: the intro
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const times = useRef<Record<string, number>>({});
  const shownAt = useRef(Date.now());
  const began = useRef(Date.now());
  const q = questions[i];
  const answer = q ? answers[q.id] ?? '' : '';
  const next = () => {
    times.current[q.id] = Date.now() - shownAt.current;
    shownAt.current = Date.now();
    if (i + 1 < questions.length) setI(i + 1);
    else onDone(answers, times.current, Date.now() - began.current);
  };
  if (i < 0) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-slate-700">{intro}</p>
        <p className="mt-2 text-slate-500 text-sm">{questions.length} questions. Once you go to the next one you can’t go back. Please don’t look anything up.</p>
        <button className={`${primary} mt-5`} onClick={() => { setI(0); shownAt.current = began.current = Date.now(); }}>Begin</button>
      </div>
    );
  }
  return (
    <div className={card}>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{title}</span>
        <span>Question {i + 1} of {questions.length}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${(i / questions.length) * 100}%` }} /></div>
      <h2 className="mt-5 text-xl font-semibold">{q.q}</h2>
      {q.kind === 'choice' ? (
        <div className="mt-4 flex flex-col gap-2">
          {q.choices.map((c) => (
            <button key={c.id} onClick={() => setAnswers({ ...answers, [q.id]: c.id })} aria-pressed={answer === c.id}
              className={`text-left px-4 py-3 rounded-xl border-2 ${answer === c.id ? 'border-cyan-600 bg-cyan-50' : 'border-slate-200 hover:border-cyan-400'}`}>
              <span className="font-semibold mr-2 uppercase text-slate-400">{c.id}</span>{c.text}
            </button>
          ))}
        </div>
      ) : (
        <>
          {q.hint && <p className="mt-1 text-sm text-slate-500">{q.hint}</p>}
          <textarea className="mt-4 w-full h-36 px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-cyan-500 outline-none" maxLength={2000}
            value={answer} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} autoFocus />
          <button className={quiet} onClick={() => setAnswers({ ...answers, [q.id]: "I don't know" })}>I don’t know</button>
        </>
      )}
      <div className="mt-5 flex justify-end">
        <button className={primary} disabled={busy || (q.kind === 'choice' ? !answer : answer.trim().length < 2)} onClick={next}>
          {i + 1 < questions.length ? 'Next' : busy ? 'Saving…' : 'Finish'}
        </button>
      </div>
    </div>
  );
}

const WORDS = ['river', 'crab', 'boat', 'island', 'shell', 'storm'];

/** Sound (pick the word the professor says), microphone (a level that moves), camera (optional, a preview) */
function Checks({ busy, onDone }: { busy: boolean; onDone: (c: { sound_ok: boolean; mic_ok: boolean; camera_ok: boolean }) => void }) {
  const [part, setPart] = useState<'sound' | 'mic' | 'camera'>('sound');
  const [result, setResult] = useState({ sound_ok: false, mic_ok: false, camera_ok: false });
  const done = (k: keyof typeof result, ok: boolean, next?: 'mic' | 'camera') => {
    const r = { ...result, [k]: ok };
    setResult(r);
    if (next) setPart(next);
    else onDone(r);
  };
  return (
    <div className={card}>
      <div className="flex gap-2 text-sm">
        {(['sound', 'mic', 'camera'] as const).map((p) => (
          <span key={p} className={`px-3 py-1 rounded-full ${p === part ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{p === 'sound' ? '🔊 Sound' : p === 'mic' ? '🎙 Microphone' : '📷 Camera'}</span>
        ))}
      </div>
      {part === 'sound' && <SoundCheck onDone={(ok) => done('sound_ok', ok, 'mic')} />}
      {part === 'mic' && <MicCheck onDone={(ok) => done('mic_ok', ok, 'camera')} />}
      {part === 'camera' && <CameraCheck busy={busy} onDone={(ok) => done('camera_ok', ok)} />}
    </div>
  );
}

function SoundCheck({ onDone }: { onDone: (ok: boolean) => void }) {
  const [word] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [choices] = useState(() => [word, ...WORDS.filter((w) => w !== word).sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5));
  const [state, setState] = useState<'idle' | 'playing' | 'played' | 'wrong'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async () => {
    setState('playing');
    try {
      if (!audio.current) {
        const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Hi! I'm Professor Marine. The word is: ${word}.` }) });
        if (!res.ok) throw new Error('no voice');
        audio.current = new Audio(URL.createObjectURL(await res.blob()));
      }
      audio.current.currentTime = 0;
      audio.current.onended = () => setState('played');
      await audio.current.play();
    } catch {
      // (no voice from the server: the browser's own)
      const u = new SpeechSynthesisUtterance(`The word is: ${word}.`);
      u.onend = () => setState('played');
      speechSynthesis.speak(u);
    }
  };
  return (
    <div className="mt-5">
      <h2 className="text-xl font-semibold">Can you hear the lesson?</h2>
      <p className="mt-1 text-slate-600">Turn your sound on, press play, and pick the word Professor Marine says.</p>
      <button className={`${primary} mt-4`} onClick={play} disabled={state === 'playing'}>{state === 'idle' ? '▶ Play' : state === 'playing' ? 'Playing…' : '↺ Play again'}</button>
      {state !== 'idle' && (
        <div className="mt-4 flex gap-2">
          {choices.map((c) => (
            <button key={c} className="px-4 py-2 rounded-lg border-2 border-slate-200 hover:border-cyan-500 font-medium"
              onClick={() => (c === word ? onDone(true) : setState('wrong'))}>{c}</button>
          ))}
        </div>
      )}
      {state === 'wrong' && <p className="mt-2 text-sm text-red-700">Not quite. Check your volume and play it again.</p>}
      <button className={`${quiet} mt-4 block`} onClick={() => onDone(false)}>I can’t get sound to work, continue anyway</button>
    </div>
  );
}

function MicCheck({ onDone }: { onDone: (ok: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'listening' | 'heard' | 'denied'>('idle');
  const [level, setLevel] = useState(0);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let loud = 0, raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 6));
        // (a moment of real sound, not one click: about a sixth of a second of it in all)
        if (rms > 0.05) loud++;
        if (loud >= 10) setState('heard');
        raf = requestAnimationFrame(tick);
      };
      stop.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); };
      setState('listening');
      tick();
    } catch {
      setState('denied');
    }
  };
  return (
    <div className="mt-5">
      <h2 className="text-xl font-semibold">Can the professor hear you?</h2>
      <p className="mt-1 text-slate-600">You can ask questions out loud in the lesson. Allow the microphone, then say something like “Hello, Professor Marine!”</p>
      {state === 'idle' && <button className={`${primary} mt-4`} onClick={start}>🎙 Test my microphone</button>}
      {(state === 'listening' || state === 'heard') && (
        <div className="mt-4">
          <div className="h-4 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} /></div>
          <p className="mt-2 text-sm text-slate-600">{state === 'heard' ? '✓ We can hear you.' : 'Listening… say something.'}</p>
        </div>
      )}
      {state === 'denied' && <p className="mt-3 text-sm text-red-700">The microphone was blocked. You can allow it in the browser’s address bar and try again, or continue: you can type your questions instead.</p>}
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        {state === 'heard' && <button className={primary} onClick={() => { stop.current(); onDone(true); }}>Continue</button>}
        {state === 'denied' && <button className={primary} onClick={start}>Try again</button>}
        <button className={quiet} onClick={() => { stop.current(); onDone(false); }}>Continue without the microphone</button>
      </div>
    </div>
  );
}

function CameraCheck({ busy, onDone }: { busy: boolean; onDone: (ok: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => stop, []);
  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true });
      setState('on');
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = stream.current; video.current.play().catch(() => {}); } });
    } catch {
      setState('denied');
    }
  };
  return (
    <div className="mt-5">
      <h2 className="text-xl font-semibold">Camera (optional)</h2>
      <p className="mt-1 text-slate-600">With the camera on, you can raise your hand to ask a question, and the professor notices if you look puzzled. It all happens inside your browser: <b>no video or picture is recorded or sent anywhere.</b></p>
      {state === 'on' && <video ref={video} muted playsInline className="mt-4 w-64 rounded-xl bg-slate-200 -scale-x-100" />}
      {state === 'denied' && <p className="mt-3 text-sm text-red-700">The camera was blocked or isn’t there. That’s fine: you can do the lesson without it.</p>}
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        {state === 'idle' && <button className={primary} onClick={start}>📷 Turn on the camera</button>}
        {state === 'on' && <button className={primary} disabled={busy} onClick={() => { stop(); onDone(true); }}>I can see myself, start the lesson</button>}
        <button className={quiet} disabled={busy} onClick={() => { stop(); onDone(false); }}>{state === 'on' ? 'Turn it off and start the lesson' : 'Skip the camera and start the lesson'}</button>
      </div>
    </div>
  );
}

function LessonStep({ rec }: { rec: StudyRecord }) {
  const href = `/presentation?lesson=${STUDY_LESSON}&study=${rec.id}`;
  useEffect(() => { window.location.href = href; }, [href]);
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">Opening the lesson…</h1>
      <p className="mt-3 text-slate-700">If it doesn’t open, use the button. When the lesson ends you’ll come back here for the second quiz.</p>
      <a className={`${primary} inline-block mt-5`} href={href}>Go to the lesson</a>
    </div>
  );
}

function Survey({ group, busy, onDone }: { group: StudyGroup | null; busy: boolean; onDone: (a: Record<string, string | number>) => void }) {
  const items = surveyFor(group);
  const [a, setA] = useState<Record<string, string | number>>({});
  const missing = items.filter((it) => !(it.kind === 'text' && it.optional) && (a[it.id] === undefined || (typeof a[it.id] === 'string' && !(a[it.id] as string).trim())));
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">How did it go?</h1>
      <p className="mt-1 text-slate-600 text-sm">Last part. There are no right answers: tell us what you really think.</p>
      <div className="mt-5 flex flex-col gap-6">
        {items.map((it) => (
          <fieldset key={it.id}>
            <legend className="font-semibold mb-2">{it.q}</legend>
            {it.kind === 'scale' && (
              <div className="grid grid-cols-5 gap-1.5">
                {SCALE.map((label, n) => {
                  const text = it.low && n === 0 ? it.low : it.high && n === 4 ? it.high : it.low ? '' : label;
                  return (
                    <button key={n} type="button" onClick={() => setA({ ...a, [it.id]: n + 1 })} aria-pressed={a[it.id] === n + 1} aria-label={`${n + 1}: ${text || label}`}
                      className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs ${a[it.id] === n + 1 ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-300 hover:border-cyan-500 text-slate-600'}`}>
                      <span className="text-base font-semibold">{n + 1}</span>
                      <span className="leading-tight text-center min-h-[2em]">{text}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {it.kind === 'pick' && (
              <div className="flex flex-wrap gap-2">
                {it.choices.map((c) => (
                  <button key={c} type="button" onClick={() => setA({ ...a, [it.id]: c })} aria-pressed={a[it.id] === c}
                    className={`px-3 py-2 rounded-lg border text-sm ${a[it.id] === c ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-300 hover:border-cyan-500'}`}>{c}</button>
                ))}
              </div>
            )}
            {it.kind === 'text' && (
              <textarea className="w-full h-24 px-3 py-2 rounded-xl border border-slate-300 focus:border-cyan-500 outline-none" maxLength={2000}
                value={(a[it.id] as string) ?? ''} onChange={(e) => setA({ ...a, [it.id]: e.target.value })} />
            )}
          </fieldset>
        ))}
      </div>
      <button className={`${primary} mt-6`} disabled={busy || missing.length > 0} onClick={() => onDone(a)}>{busy ? 'Saving…' : 'Finish'}</button>
      {missing.length > 0 && <p className="mt-2 text-xs text-slate-500">Answer every question to finish ({missing.length} left).</p>}
    </div>
  );
}

function Done({ rec, results, setResults }: { rec: StudyRecord; results: Results | null; setResults: (r: Results) => void }) {
  const [failed, setFailed] = useState(false);
  // (came back later: the survey's saved already, asking again just gives the results)
  useEffect(() => {
    if (!results) studyPost<Results>('survey', { id: rec.id, answers: {} }).then(setResults).catch(() => setFailed(true));
  }, [results, rec.id, setResults]);
  return (
    <div className={card}>
      <div className="text-5xl" aria-hidden>🎉</div>
      <h1 className="text-2xl font-bold mt-2">Thank you for taking part!</h1>
      <p className="mt-2 text-slate-700">Your answers are saved. Please don’t tell anyone what the lesson was like until they’ve done it too.</p>
      {results ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4 text-center"><div className="text-sm text-slate-500">Before the lesson</div><div className="text-3xl font-bold">{results.pre.right}/{results.pre.of}</div></div>
            <div className="rounded-xl bg-cyan-50 p-4 text-center"><div className="text-sm text-slate-500">After the lesson</div><div className="text-3xl font-bold text-cyan-700">{results.post.right}/{results.post.of}</div></div>
          </div>
          <h2 className="mt-6 font-semibold">The answers</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {results.review.post.map((r) => (
              <li key={r.id} className={`rounded-xl px-4 py-3 text-sm ${r.correct ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <div className="font-medium">{r.correct ? '✓' : '✗'} {r.q}</div>
                {!r.correct && <div className="text-slate-600 mt-1">You said: {r.yours ?? '(nothing)'} · Answer: <b>{r.right}</b></div>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Your written answers are read by the research team.</p>
        </>
      ) : failed ? (
        <p className="mt-4 text-sm text-slate-500">Your answers are saved. (We couldn’t load your scores just now.)</p>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Loading how you did…</p>
      )}
      <p className="mt-4 text-sm text-slate-500">You can close this page now.</p>
    </div>
  );
}
