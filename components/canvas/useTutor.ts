'use client';

import { useCallback, useRef, useState } from 'react';
import { useSpeechQueue } from '@/components/hooks/useSpeechQueue';
import { learnerHeaders } from '@/lib/learnerSession';

// Questions for the professor on the canvas page: the learner's question goes
// to /api/conversational/respond (knowledge base + what's on the slide), the
// answer streams back and is spoken sentence by sentence as it arrives.

export type TutorDecision = 'repeat' | 'simplify' | 'advance' | null;
/** asker: who asked (a classmate's name); not set = the learner */
export type Exchange = { question: string; answer: string; done: boolean; asker?: string };

const HISTORY_TURNS = 6;   // earlier questions the tutor still remembers

const VOICE =
  'You are "Professor Marine", a marine biologist teaching 10 to 14 year olds about the blue catfish invasion of the Chesapeake Bay. ' +
  'Answer the question in 2 to 4 short spoken sentences, like a teacher answering a hand that went up mid-lesson. ' +
  'Talk in the same voice as the slides: funny, a bit goofy, lightly sarcastic about the fish and the problem (never about the student), ' +
  'with the facts kept exactly right. No lists or headings: this is read out loud. If you don\'t know, say so.';

export function useTutor() {
  const speech = useSpeechQueue();
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);   // the conversation so far, for the transcript
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const askSeq = useRef(0);

  /**
   * Asks and speaks the answer. Resolves when the answer has been spoken (or
   * was cut off), with the tutor's deck decision if it made one.
   */
  const ask = useCallback(async (question: string, slideContext: string, opts: {
    /** Don't start speaking before this settles (the lesson finishing its sentence); the answer is written meanwhile */
    holdUntil?: Promise<void>;
    /** Asked by a classmate (their name), not the learner */
    asker?: string;
  } = {}): Promise<{ decision: TutorDecision; superseded: boolean }> => {
    const seq = ++askSeq.current;
    speech.stopSpeaking();
    setExchange({ question, asker: opts.asker, answer: '', done: false });
    setThinking(true);
    let decision: TutorDecision = null;
    try {
      const res = await fetch('/api/conversational/respond', {
        method: 'POST',
        headers: learnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userText: question,
          topic: 'Blue Catfish invasion in the Chesapeake Bay',
          stream: true,
          useKnowledgeBase: true,
          systemPrompt: `${VOICE}\n\nWhat the learner is looking at right now:\n${slideContext}\n\nRelate the answer to this slide when it helps.`,
          conversation: historyRef.current.slice(-HISTORY_TURNS * 2),
        }),
      });
      // The answer is on its way; the professor speaks once the lesson's sentence is over
      if (opts.holdUntil) await opts.holdUntil.catch(() => {});
      if (seq !== askSeq.current) { res.body?.cancel().catch(() => {}); return { decision: null, superseded: true }; }   // talked over: drop the answer
      if (res.status === 429 || res.status === 413) {
        // Rate-limited or too long (lib/rateLimit.ts): say so kindly, then carry on
        const line = res.status === 413
          ? "That's a long one! Could you ask it in a shorter way?"
          : "Let's slow down a bit. Ask me again in a moment.";
        speech.beginStream();
        speech.enqueue(line);
        speech.endStream();
        setExchange({ question, asker: opts.asker, answer: line, done: true });
        setThinking(false);
        await new Promise((r) => setTimeout(r, 2500));
        return { decision: null, superseded: seq !== askSeq.current };
      }
      if (!res.ok || !res.body) throw new Error(`The professor couldn't answer (${res.status})`);
      const d = res.headers.get('X-Tutor-Decision');
      if (d === 'repeat' || d === 'simplify' || d === 'advance') decision = d;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      speech.beginStream();
      let full = '';
      let pending = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done || seq !== askSeq.current) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        pending += chunk;
        setThinking(false);
        setExchange({ question, asker: opts.asker, answer: full, done: false });
        // Speak each finished sentence right away
        let m;
        while ((m = pending.match(/^([\s\S]*?[.!?])(\s+)([\s\S]*)$/))) {
          speech.enqueue(m[1]);
          pending = m[3];
        }
      }
      if (seq === askSeq.current && pending.trim()) speech.enqueue(pending);
      speech.endStream();
      // A classmate's line is remembered as theirs, not as something the learner said
      historyRef.current.push({ role: 'user', content: opts.asker ? `(${opts.asker}, a classmate, said: ${question})` : question }, { role: 'assistant', content: full });
      setExchange({ question, asker: opts.asker, answer: full, done: true });
      setHistory((h) => [...h.slice(-19), { question, asker: opts.asker, answer: full, done: true }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExchange({ question, asker: opts.asker, answer: msg, done: true });
      decision = null;
    } finally {
      if (seq === askSeq.current) setThinking(false);
    }
    // Wait until the spoken answer is over (endStream drains the rest)
    await new Promise<void>((resolve) => {
      const started = Date.now();
      let heard = false;
      const t = setInterval(() => {
        const speaking = speechRef.current.isSpeaking;
        if (speaking) heard = true;
        if (seq !== askSeq.current || (heard && !speaking) || (!heard && Date.now() - started > 3000)) {
          clearInterval(t);
          resolve();
        }
      }, 150);
    });
    const superseded = seq !== askSeq.current;
    return { decision: superseded ? null : decision, superseded };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The latest speaking state, for the wait above
  const speechRef = useRef(speech);
  speechRef.current = speech;

  /** Stop now (a new question, or the learner moved on). */
  const cancel = useCallback(() => {
    askSeq.current++;
    speechRef.current.stopSpeaking();
    setThinking(false);
  }, []);

  return {
    ask,
    cancel,
    /** Talking over the answer: finish the sentence being said, then stop (the learner gets the next turn). */
    finishSentence: () => { askSeq.current++; speechRef.current.finishSentence(); },
    speaking: speech.isSpeaking,
    thinking,
    exchange,
    history,
    clearExchange: () => setExchange(null),
  };
}
