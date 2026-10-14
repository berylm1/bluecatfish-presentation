'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuizQuestion } from '@/lib/canvas/types';

/**
 * The end-of-lesson quiz: a few questions (already picked at random and their choices
 * shuffled), one at a time. Professor Marine reads each question and says whether the
 * pick was right; a tap (or 1–4) answers. "Skip quiz" is there, quietly, the whole time.
 */
export default function Quiz({ questions, width, say, onAnswer, onDone, onSkip }: {
  questions: QuizQuestion[];
  /** CSS width (the slide's); the height follows at 16:9 on big screens */
  width: string;
  /** Professor Marine says it (resolves when done, or when cut off) */
  say: (text: string) => Promise<unknown>;
  onAnswer?: (index: number, right: boolean) => void;
  onDone: (right: number) => void;
  onSkip: () => void;
}) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const q = questions[at];
  const last = at === questions.length - 1;
  const sayRef = useRef(say);
  sayRef.current = say;

  // each question read out (the first after a word about the quiz)
  useEffect(() => {
    if (!q) return;
    sayRef.current(at === 0 ? `Quick quiz! ${questions.length} questions, then we're done. ${q.q}` : q.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  const pick = (k: number) => {
    if (picked !== null || !q) return;
    setPicked(k);
    const ok = k === q.answer;
    if (ok) setRight((n) => n + 1);
    onAnswer?.(at, ok);
    // ("The answer is: …", not "It's …": a choice can start with a capital, like "For fishing")
    sayRef.current(ok ? pickOne(RIGHT) : `Not quite. The answer is: ${q.choices[q.answer]}.${q.why ? ` ${q.why}` : ''}`);
  };
  const next = () => {
    if (picked === null) return;
    if (last) { onDone(right); return; }
    setAt((n) => n + 1);
    setPicked(null);
  };

  // 1–4 (or A–D) answers; Enter goes on
  const keys = useRef({ pick, next });
  keys.current = { pick, next };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      const k = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < (q?.choices.length ?? 0)) { e.preventDefault(); keys.current.pick(k); }
      else if (e.key === 'Enter') { e.preventDefault(); keys.current.next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q]);

  if (!q) return null;
  return (
    <div className="relative flex flex-col justify-center gap-3 sm:gap-4 bg-gradient-to-b from-cyan-50 to-white text-slate-900 rounded-2xl p-5 sm:p-8 max-sm:!aspect-auto [@media(max-height:500px)]:!aspect-auto [@media(max-height:500px)]:p-4"
      style={{ width, aspectRatio: '16 / 9' }} data-quiz role="region" aria-label="Quiz">
      <div className="flex items-center gap-3 text-sm whitespace-nowrap">
        <span className="font-semibold text-cyan-800">🧠 Quick quiz</span>
        <span className="text-slate-500"><span className="max-sm:hidden">Question </span>{at + 1} of {questions.length}</span>
        <span className="flex gap-1 max-sm:hidden" aria-hidden>
          {questions.map((_, i) => <span key={i} className={`w-5 h-1.5 rounded-full ${i < at || (i === at && picked !== null) ? 'bg-cyan-500' : i === at ? 'bg-cyan-300' : 'bg-slate-200'}`} />)}
        </span>
        {/* quietly there: it's a quiz, not a test */}
        <button onClick={onSkip} className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline">Skip quiz</button>
      </div>
      <h3 key={at} className="text-xl sm:text-2xl font-bold leading-snug animate-[pop-in_350ms_ease-out_both]">{q.q}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {q.choices.map((c, k) => {
          const isRight = k === q.answer;
          const tone = picked === null ? 'bg-white border-slate-200 hover:border-cyan-500 hover:bg-cyan-50'
            : isRight ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : k === picked ? 'bg-red-50 border-red-400 text-red-900' : 'bg-white border-slate-200 opacity-60';
          return (
            <button key={`${at}-${k}`} onClick={() => pick(k)} disabled={picked !== null}
              className={`flex items-center gap-3 text-left rounded-xl border-2 px-3 py-2.5 sm:py-3 text-base font-medium transition-colors ${tone}`}
              data-choice={k} data-right={picked !== null && isRight ? '' : undefined}>
              <span className={`shrink-0 w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center ${picked !== null && isRight ? 'bg-emerald-500 text-white' : picked === k ? 'bg-red-400 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {picked !== null && isRight ? '✓' : picked === k ? '✗' : String.fromCharCode(65 + k)}
              </span>
              <span>{c}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="flex flex-wrap items-center gap-3 animate-[pop-in_300ms_ease-out_both]" role="status">
          <p className={`flex-1 min-w-[12rem] text-sm sm:text-base ${picked === q.answer ? 'text-emerald-700 font-semibold' : 'text-slate-700'}`}>
            {picked === q.answer ? '✓ That\'s right!' : <>Not quite. The answer is: <b>{q.choices[q.answer]}</b>.{q.why ? ` ${q.why}` : ''}</>}
          </p>
          <button onClick={next} className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-semibold" autoFocus>
            {last ? 'See how you did →' : 'Next question →'}
          </button>
        </div>
      )}
    </div>
  );
}

const RIGHT = ["That's right!", 'Yes, exactly!', 'You got it!', 'Correct!'];
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** QUIZ_ASKED questions from the pool, in random order, each with its choices shuffled (the answer index follows). */
export function pickQuiz(pool: QuizQuestion[], count: number): QuizQuestion[] {
  return shuffle(pool).slice(0, count).map((q) => {
    const order = shuffle(q.choices.map((_, k) => k));
    return { ...q, choices: order.map((k) => q.choices[k]), answer: order.indexOf(q.answer) };
  });
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
