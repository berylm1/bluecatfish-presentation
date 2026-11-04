'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSENT, CONSENT2, DEMOGRAPHICS, STUDIES, demographicAnswer, PAIR_POINTS, POST_QUIZ, PRE_QUIZ, SCALE, STUDY_LESSON, STUDY_TITLE, surveyFor,
  type DemographicId, type QuizQuestion, type StudyGroup, type StudyId, type SurveyItem,
} from '@/lib/study/content';
import { freshStart, isComputer, preloadCamera, preloadLesson, readStudy, seenBefore, studyPost, writeStudy, type StudyRecord } from '@/lib/study/client';
import { learnerHeaders } from '@/lib/learnerSession';

/*
 * The study (in person, v2): consent → their name (kept in this browser only) → sound, mic and camera checks → about you
 * (the pre-study questionnaire) → pre-quiz → Start (the group
 * is picked) → the lesson (/presentation?study=…, with or without the classmates) → post-quiz →
 * questionnaires (after the lesson; then the post-study questions) → how you did, and their participant code. The checks come first, so someone whose sound doesn't work stops before
 * they're in a group (the groups stay even), and the lesson loads in the background meanwhile. Each step is saved as it's done (/api/study), and this browser
 * remembers where they are, so a refresh picks up there. ?test=1: a test run (not in the results,
 * and the group can be chosen).
 */

type Step = 'consent' | 'checks' | 'about' | 'pre' | 'start' | 'lesson' | 'post' | 'survey' | 'done';
const ORDER: Step[] = ['consent', 'checks', 'about', 'pre', 'start', 'lesson', 'post', 'survey', 'done'];
type Results = {
  pre: { right: number; of: number };
  post: { right: number; of: number };
  review: { pre: Review[]; post: Review[] };
};
type Review = { id: string; q: string; yours: string | null; right: string; correct: boolean };

const card = 'w-full max-w-2xl rounded-2xl bg-white text-slate-900 shadow-2xl p-6 sm:p-8';
const primary = 'px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold';
const quiet = 'px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm';
const STEP_LABELS: [Step[], string][] = [[['consent', 'checks'], 'Setup'], [['about'], 'About you'], [['pre'], 'Quiz 1'], [['start', 'lesson'], 'Lesson'], [['post'], 'Quiz 2'], [['survey', 'done'], 'Questions']];

/** One study's pages (app/study: 1, the classmates study; app/study2: 2, static vs adaptive), the same steps */
export default function StudyFlow({ which }: { which: StudyId }) {
  const S = STUDIES[which];
  const consent = which === 2 ? CONSENT2 : CONSENT;
  // every save goes to this study's table
  const post = useCallback(<T = any,>(action: string, body: Record<string, unknown> = {}) => studyPost<T>(action, { ...body, study: which }), [which]);
  const [ready, setReady] = useState(false);
  const [computer, setComputer] = useState(true);
  const [rec, setRec] = useState<StudyRecord | null>(null);
  const [step, setStep] = useState<Step>('consent');
  const [test, setTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const startedAt = useRef(Date.now());
  const inFlight = useRef(false);   // (a double click sends one save, not two: two "I agree" would be two people)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setComputer(isComputer());
    const saved = readStudy(which);
    setTest(saved ? saved.test : params.get('test') === '1');
    if (saved) {
      setRec(saved);
      setStep(saved.step as Step);
      // the server's step wins (another tab may have gone further)
      // (the further of the two: another tab may have gone on, or the lesson's "finished" save may not have reached the server)
      post('get', { id: saved.id }).then((d) => {
        const later = ORDER.indexOf(d.step) >= ORDER.indexOf(saved.step as Step) ? d.step : saved.step;
        if (later !== d.step) post('save', { id: saved.id, step: later, ...(later === 'post' ? { lessonFinished: true } : {}) }).catch(() => {});
        const r = { ...saved, step: later, group: d.group ?? saved.group, code: d.code ?? saved.code };
        writeStudy(r, which); setRec(r); setStep(later as Step);
      }).catch(() => { /* offline for a moment: the browser's step */ });
    }
    setReady(true);
  }, []);

  // The lesson loads while they do the checks, the questions about them and quiz 1 (and the camera's files, once it's allowed)
  useEffect(() => { if (['checks', 'about', 'pre', 'start'].includes(step)) preloadLesson(STUDY_LESSON); }, [step]);
  useEffect(() => { if (rec?.camera && step !== 'done') preloadCamera(); }, [rec?.camera, step]);

  /** Run a save; on success go to the next step */
  const go = useCallback(async (next: Step, work: () => Promise<Partial<StudyRecord> | void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const more = (await work()) || {};
      setRec((r) => {
        const n = { ...(r as StudyRecord), ...more, step: next };
        writeStudy(n, which);
        return n;
      });
      setStep(next);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  // (everything this browser kept: the record, the lesson's place, the name: lib/study/client.ts freshStart)
  const forget = () => freshStart();   // (both studies' records: one person, one computer)
  const resetTest = () => {
    if (!window.confirm('Forget this test run on this browser and start again?')) return;
    forget();
    window.location.href = `${S.path}?test=1`;
  };
  // Family sharing one computer: the next person starts fresh (this browser has seen the lesson: noted with their answers)
  const nextPerson = () => {
    if (!window.confirm('Start the study for someone else on this computer? (Your answers are already saved.)')) return;
    forget();
    window.location.href = S.path;
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
          <h1 className="text-2xl font-bold mt-1">{consent.heading}</h1>
          <div className="mt-4 flex flex-col gap-3 text-slate-700 leading-relaxed">
            {consent.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            <p className="text-sm text-slate-500">{consent.contact}</p>
          </div>
          <Consent agree={consent.agree} busy={busy} onAgree={() => go('checks', async () => {
            const d = await post('join', { test, seenBefore: seenBefore(), device: navigator.userAgent, screen: `${window.screen.width}x${window.screen.height}` });
            return { id: d.id, test, code: d.code ?? null, study: which === 2 ? 2 : undefined };
          })} />
        </div>
      )}

      {step === 'checks' && rec && !rec.named && (
        <NameStep onDone={(name) => {
          try { localStorage.setItem('learnerName', name); } catch { /* private mode: the professor won't use it */ }
          const n = { ...rec, named: true };
          writeStudy(n, which); setRec(n);
        }} />
      )}

      {step === 'checks' && rec && rec.named && (
        <Checks busy={busy} onDone={(checks) => go('about', async () => {
          await post('save', { id: rec.id, checks, step: 'about' });
          return { camera: checks.camera_ok };
        })} />
      )}

      {step === 'about' && rec && (
        <About busy={busy} onDone={(about) => go('pre', () => post('save', { id: rec.id, about, step: 'pre' }))} />
      )}

      {step === 'pre' && rec && (
        <Quiz key="pre" title="Quiz 1 of 2" intro="5 quick questions before the lesson. It’s fine not to know: just pick your best guess. You’ll see how you did at the very end."
          questions={PRE_QUIZ} busy={busy}
          onDone={(answers, times, ms) => go('start', () => post('pre', { id: rec.id, answers, times, ms }))} />
      )}

      {step === 'start' && rec && (
        <div className={card}>
          <h1 className="text-2xl font-bold">Ready for the lesson</h1>
          <p className="mt-3 text-slate-700">The lesson starts next. It takes about 15–20 minutes. Find a quiet spot and keep your sound on.</p>
          {which === 1 && <p className="mt-2 text-slate-700">In the lesson you can ask Professor Marine questions out loud, or type them in the chat.</p>}
          {test ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="w-full text-sm text-amber-700">Test run: pick the group to try.</span>
              {[...S.groups.map((g) => [g, S.names[g]] as const), [null, 'Random'] as const].map(([g, label]) => (
                <button key={label} className={primary} disabled={busy}
                  onClick={() => go('lesson', async () => ({ group: (await post('assign', { id: rec.id, group: g })).group }))}>{label}</button>
              ))}
            </div>
          ) : (
            <button className={`${primary} mt-5`} disabled={busy}
              onClick={() => go('lesson', async () => ({ group: (await post('assign', { id: rec.id })).group }))}>Start the lesson</button>
          )}
        </div>
      )}

      {step === 'lesson' && rec && <LessonStep rec={rec} />}

      {step === 'post' && rec && (
        <Quiz key="post" title="Quiz 2 of 2" intro="Questions about the lesson. Some you’ve seen before. Answer each as best you can; you’ll see how you did at the end."
          questions={POST_QUIZ} busy={busy}
          onDone={(answers, times, ms) => go('survey', () => post('post', { id: rec.id, answers, times, ms }))} />
      )}

      {step === 'survey' && rec && (
        <Survey group={rec.group ?? null} busy={busy} onDone={(answers) => go('done', async () => {
          setResults(await post<Results>('survey', { id: rec.id, answers, ms: Date.now() - startedAt.current }));
        })} />
      )}

      {step === 'done' && rec && <Done rec={rec} results={results} setResults={setResults} onNextPerson={rec.test ? undefined : nextPerson} />}
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

function Consent({ agree: agreeText, busy, onAgree }: { agree: string; busy: boolean; onAgree: () => void }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5 accent-cyan-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span className="font-medium">{agreeText}</span>
      </label>
      <button className={`${primary} self-start`} disabled={!agree || busy} onClick={onAgree}>I agree, continue</button>
    </div>
  );
}

/** Their first name or a nickname, for the professor to greet them: kept in this browser only (never sent to the study) */
function NameStep({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const clean = name.trim();
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">What should Professor Marine call you?</h1>
      <p className="mt-2 text-slate-600">Your first name or a nickname. It stays on this computer: it isn’t saved with your answers.</p>
      <form className="mt-5 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (clean) onDone(clean); }}>
        <input value={name} autoFocus maxLength={24} placeholder="Your first name" aria-label="Your first name"
          onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{N} '.-]/gu, '').slice(0, 24))}
          className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-slate-300 focus:border-cyan-500 outline-none" />
        <button className={primary} disabled={!clean}>Continue</button>
      </form>
    </div>
  );
}

/** The pre-study questionnaire (lib/study/content.ts DEMOGRAPHICS): choices, an age, and "Other: ___" written in */
function About({ busy, onDone }: { busy: boolean; onDone: (about: Partial<Record<DemographicId, string>>) => void }) {
  const [a, setA] = useState<Partial<Record<DemographicId, string>>>({});
  const [own, setOwn] = useState<Partial<Record<DemographicId, string>>>({});   // what they wrote for "Other"
  // the answer as it's sent: "Other: what they wrote" for the write-in choice
  const value = (d: (typeof DEMOGRAPHICS)[number]) => (d.other && a[d.id] === d.other ? `${d.other}: ${own[d.id]?.trim() ?? ''}` : a[d.id] ?? '');
  const missing = DEMOGRAPHICS.filter((d) => !d.optional && demographicAnswer(d, value(d)) === null);
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">A few questions about you</h1>
      <p className="mt-1 text-slate-600 text-sm">None of this identifies you.</p>
      <div className="mt-5 flex flex-col gap-5">
        {DEMOGRAPHICS.map((d, i) => (
          <fieldset key={d.id}>
            <legend className="font-semibold mb-2">{i + 1}. {d.q}</legend>
            {d.number ? (
              <input type="number" inputMode="numeric" min={d.number.min} max={d.number.max} aria-label={d.q}
                className="w-28 px-3 py-2 rounded-lg border border-slate-300" value={a[d.id] ?? ''} onChange={(e) => setA({ ...a, [d.id]: e.target.value.slice(0, 3) })} />
            ) : d.text ? (
              <input className="w-full px-3 py-2 rounded-lg border border-slate-300" maxLength={200} value={a[d.id] ?? ''} onChange={(e) => setA({ ...a, [d.id]: e.target.value })} />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {d.choices!.map((c) => (
                    <button key={c} type="button" onClick={() => setA({ ...a, [d.id]: c })} aria-pressed={a[d.id] === c}
                      className={`px-3 py-2 rounded-lg border text-sm ${a[d.id] === c ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-300 hover:border-cyan-500'}`}>{c}</button>
                  ))}
                </div>
                {d.other && a[d.id] === d.other && (
                  <input autoFocus maxLength={150} placeholder="Please write it here" aria-label={`${d.q}: ${d.other}`}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300" value={own[d.id] ?? ''} onChange={(e) => setOwn({ ...own, [d.id]: e.target.value })} />
                )}
              </>
            )}
            {d.number && a[d.id] && demographicAnswer(d, a[d.id]) === null && <p className="mt-1 text-xs text-amber-700">A whole number of years, {d.number.min} or older.</p>}
          </fieldset>
        ))}
      </div>
      <button className={`${primary} mt-6`} disabled={busy || missing.length > 0}
        onClick={() => onDone(Object.fromEntries(DEMOGRAPHICS.map((d) => [d.id, value(d)])))}>Continue</button>
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

/** Sound and microphone together (hear the word, say it back), then the camera (optional, a preview) */
function Checks({ busy, onDone }: { busy: boolean; onDone: (c: { sound_ok: boolean; mic_ok: boolean; camera_ok: boolean }) => void }) {
  const [part, setPart] = useState<'soundmic' | 'camera'>('soundmic');
  const [result, setResult] = useState({ sound_ok: false, mic_ok: false });
  return (
    <div className={card}>
      <div className="flex gap-2 text-sm">
        {(['soundmic', 'camera'] as const).map((p) => (
          <span key={p} className={`px-3 py-1 rounded-full ${p === part ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{p === 'soundmic' ? '🔊 Sound and 🎙 microphone' : '📷 Camera'}</span>
        ))}
      </div>
      {part === 'soundmic' && <SoundMicCheck onDone={(r) => { setResult(r); setPart('camera'); }} />}
      {part === 'camera' && <CameraCheck busy={busy} onDone={(ok) => onDone({ ...result, camera_ok: ok })} />}
    </div>
  );
}

/**
 * The professor says a word; they say it back. What they said goes through the same speech-to-text
 * the lesson uses, so one go checks the speakers, the microphone and hearing them. No microphone (or
 * it can't make out the word twice): they tap the word they heard instead.
 */
function SoundMicCheck({ onDone }: { onDone: (r: { sound_ok: boolean; mic_ok: boolean }) => void }) {
  const [word] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [choices] = useState(() => [word, ...WORDS.filter((w) => w !== word).sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5));
  const [state, setState] = useState<'idle' | 'playing' | 'listening' | 'checking' | 'heard' | 'again' | 'silent'>('idle');
  const [level, setLevel] = useState(0);
  const [said, setSaid] = useState('');
  const [tries, setTries] = useState(0);
  const [noMic, setNoMic] = useState(false);
  const [wrongTap, setWrongTap] = useState(false);
  const spoke = useRef(false);    // the mic picked up speech at some point (it works, even if the word was missed)
  const audio = useRef<Promise<HTMLAudioElement | null> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => { cleanup.current(); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  // The word's clip is made as soon as this shows, so Play is instant
  const clip = () => (audio.current ??= fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Hi! I'm Professor Marine. The word is: ${word}.` }) })
    .then(async (res) => (res.ok ? new Audio(URL.createObjectURL(await res.blob())) : null))
    .catch(() => null));
  useEffect(() => { clip(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const say = () => new Promise<void>((resolve) => {
    clip().then((a) => {
      if (a) {
        a.currentTime = 0;
        a.onended = () => resolve();
        a.play().catch(() => resolve());
      } else {
        // (no voice from the server: the browser's own)
        const u = new SpeechSynthesisUtterance(`The word is: ${word}.`);
        u.onend = () => resolve();
        speechSynthesis.speak(u);
      }
    });
  });

  /** Record until they've said something and gone quiet (or 7 s of nothing) */
  const listen = (s: MediaStream): Promise<Blob | null> => new Promise((resolve) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(s).connect(analyser);
    const rec = new MediaRecorder(s);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => { ctx.close().catch(() => {}); resolve(loud >= 10 ? new Blob(parts, { type: rec.mimeType || 'audio/webm' }) : null); };
    rec.start();
    const buf = new Uint8Array(analyser.fftSize);
    const began = Date.now();
    let loud = 0, quietSince = 0, raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 6));
      if (rms > 0.05) { loud++; quietSince = 0; } else if (!quietSince) quietSince = Date.now();
      const done = (loud >= 10 && quietSince && Date.now() - quietSince > 900) || (loud >= 10 && Date.now() - began > 6000) || Date.now() - began > 7000;
      if (done) { cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); return; }
      raf = requestAnimationFrame(tick);
    };
    cleanup.current = () => { cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); };
    tick();
  });

  const go = async () => {
    setState('playing'); setSaid('');
    // the microphone first (its permission popup), then the word, then their turn
    if (!stream.current && !noMic) {
      try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { setNoMic(true); }
    }
    await say();
    if (!stream.current) { setState('again'); return; }
    setState('listening');
    const blob = await listen(stream.current);
    if (!blob) { setState('silent'); return; }
    spoke.current = true;
    setState('checking');
    let text = '';
    try {
      const form = new FormData();
      form.append('file', blob, 'check.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', headers: learnerHeaders(), body: form });
      text = res.ok ? String((await res.json()).text ?? '') : '';
    } catch { /* couldn't check: they tap the word */ }
    setSaid(text.trim());
    if (text.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).some((w) => w === word || w === `${word}s`)) {
      setState('heard');
      stream.current.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setTimeout(() => onDone({ sound_ok: true, mic_ok: true }), 900);
    } else {
      setTries((n) => n + 1);
      setState('again');
    }
  };
  const finish = (sound: boolean) => {
    cleanup.current();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    onDone({ sound_ok: sound, mic_ok: spoke.current });
  };
  // Tap the word instead: no microphone, or it couldn't make out the word twice
  const tapping = state === 'again' && (noMic || tries >= 2);

  return (
    <div className="mt-5">
      <h2 className="text-xl font-semibold">Can you hear the professor, and can the professor hear you?</h2>
      <p className="mt-1 text-slate-600">Turn your sound on and press play. Professor Marine says a word: <b>say it back out loud.</b> Allow the microphone when your browser asks.</p>
      {state === 'idle' && <button className={`${primary} mt-4`} onClick={go}>▶ Play</button>}
      {state === 'playing' && <p className="mt-4 text-slate-600">🔊 Listen…</p>}
      {state === 'listening' && (
        <div className="mt-4">
          <p className="font-medium">🎙 Now say the word!</p>
          <div className="mt-2 h-4 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} /></div>
        </div>
      )}
      {state === 'checking' && <p className="mt-4 text-slate-600">Checking what you said…</p>}
      {state === 'heard' && <p className="mt-4 font-medium text-emerald-700">✓ We heard you say “{word}”. Sound and microphone work.</p>}
      {state === 'silent' && <p className="mt-4 text-sm text-red-700">We didn’t hear anything. Check that the right microphone is on and not muted, then try again.</p>}
      {state === 'again' && !tapping && <p className="mt-4 text-sm text-amber-800">{said ? <>We heard “{said}”. </> : <>We couldn’t make that out. </>}Listen again and say the word clearly.</p>}
      {tapping && (
        <div className="mt-4">
          <p className="font-medium">{noMic ? 'No microphone: that’s OK, you can type your questions in the lesson.' : 'Let’s skip the microphone part.'} Which word did you hear?</p>
          <div className="mt-2 flex gap-2">
            {choices.map((c) => (
              <button key={c} className="px-4 py-2 rounded-lg border-2 border-slate-200 hover:border-cyan-500 font-medium" onClick={() => (c === word ? finish(true) : setWrongTap(true))}>{c}</button>
            ))}
          </div>
          {wrongTap && <p className="mt-2 text-sm text-red-700">Not quite. Check your volume and play it again.</p>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        {(state === 'again' || state === 'silent') && <button className={primary} onClick={go}>↺ Play again</button>}
        {(state === 'again' || state === 'silent') && !tapping && <button className={quiet} onClick={() => { setNoMic(true); setTries(2); setState('again'); }}>My microphone isn’t working</button>}
        {state !== 'heard' && state !== 'idle' && <button className={quiet} onClick={() => finish(false)}>I can’t get sound to work, continue anyway</button>}
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
        {state === 'on' && <button className={primary} disabled={busy} onClick={() => { stop(); onDone(true); }}>I can see myself, continue</button>}
        <button className={quiet} disabled={busy} onClick={() => { stop(); onDone(false); }}>{state === 'on' ? 'Turn it off and continue' : 'Skip the camera'}</button>
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

/**
 * After the lesson: the post-condition questionnaire (the UEQ-S's word pairs, then the general questions), then on a
 * second page the post-study questions. Sent together at the end.
 */
function Survey({ group, busy, onDone }: { group: StudyGroup | null; busy: boolean; onDone: (a: Record<string, string | number>) => void }) {
  const all = surveyFor(group);
  const [page, setPage] = useState<'condition' | 'study'>('condition');
  const items = all.filter((it) => (it.part ?? 'study') === page);
  const [a, setA] = useState<Record<string, string | number>>({});
  const missingIn = (list: SurveyItem[]) => list.filter((it) => !(it.kind === 'text' && it.optional) && (a[it.id] === undefined || (typeof a[it.id] === 'string' && !(a[it.id] as string).trim())));
  const missing = missingIn(items);
  const pairs = items.filter((it) => it.kind === 'pair');
  const rest = items.filter((it) => it.kind !== 'pair');
  return (
    <div className={card}>
      <h1 className="text-2xl font-bold">{page === 'condition' ? 'How was the lesson?' : 'Last few questions'}</h1>
      <p className="mt-1 text-slate-600 text-sm">
        {page === 'condition' ? 'About the lesson you just did. There are no right answers: tell us what you really think.' : 'A few sentences each is plenty.'}
      </p>
      {pairs.length > 0 && (
        <fieldset className="mt-5">
          <legend className="font-semibold">For each pair, pick the circle closest to how you’d describe the lesson.</legend>
          <div className="mt-3 flex flex-col gap-2">
            {pairs.map((it) => it.kind === 'pair' && (
              <div key={it.id} role="radiogroup" aria-label={`${it.low} to ${it.high}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                <span className="text-right text-sm">{it.low}</span>
                <span className="flex gap-1 sm:gap-1.5">
                  {Array.from({ length: PAIR_POINTS }, (_, n) => (
                    <button key={n} type="button" role="radio" aria-checked={a[it.id] === n + 1} aria-label={`${n + 1} of ${PAIR_POINTS}`}
                      onClick={() => setA({ ...a, [it.id]: n + 1 })}
                      className={`w-7 h-7 rounded-full border-2 ${a[it.id] === n + 1 ? 'bg-cyan-600 border-cyan-600' : 'border-slate-300 hover:border-cyan-500'}`} />
                  ))}
                </span>
                <span className="text-sm">{it.high}</span>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-6 flex flex-col gap-6">
        {rest.map((it) => (
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
              <textarea className="w-full h-24 px-3 py-2 rounded-xl border border-slate-300 focus:border-cyan-500 outline-none" maxLength={2000} aria-label={it.q}
                value={(a[it.id] as string) ?? ''} onChange={(e) => setA({ ...a, [it.id]: e.target.value })} />
            )}
          </fieldset>
        ))}
      </div>
      {page === 'condition' && all.some((it) => it.part === 'study') ? (
        <button className={`${primary} mt-6`} disabled={missing.length > 0} onClick={() => { setPage('study'); window.scrollTo(0, 0); }}>Continue</button>
      ) : (
        <button className={`${primary} mt-6`} disabled={busy || missingIn(all).length > 0} onClick={() => onDone(a)}>{busy ? 'Saving…' : 'Finish'}</button>
      )}
      {missing.length > 0 && <p className="mt-2 text-xs text-slate-500">Answer every question to continue ({missing.length} left).</p>}
    </div>
  );
}

function Done({ rec, results, setResults, onNextPerson }: { rec: StudyRecord; results: Results | null; setResults: (r: Results) => void; onNextPerson?: () => void }) {
  const [failed, setFailed] = useState(false);
  // (came back later: the survey's saved already, asking again just gives the results)
  useEffect(() => {
    if (!results) studyPost<Results>('survey', { id: rec.id, answers: {}, study: rec.study ?? 1 }).then(setResults).catch(() => setFailed(true));
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
      {rec.code && (
        <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Participant number: <b className="text-lg text-slate-900 tracking-wide">{rec.code}</b>
          <span className="block text-xs text-slate-500">For the researcher, to note with the interview.</span>
        </p>
      )}
      <p className="mt-4 text-sm text-slate-500">You can close this page now.</p>
      {onNextPerson && <button className={`${quiet} mt-2 underline`} onClick={onNextPerson}>Someone else wants to take part on this computer</button>}
    </div>
  );
}
