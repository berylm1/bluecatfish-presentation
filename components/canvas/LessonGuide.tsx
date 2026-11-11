'use client';

import Icon, { type IconName } from '@/components/Icon';

/**
 * "Here's what you can do": what a learner can do in the lesson, before its start screen (a page of its own, in the
 * lesson's look) and again from ❓ during it (over the slide). The study's two groups see the same words, apart from
 * the classmates (only for the group with them). The static lesson has its own, shorter list (nothing to ask).
 */

const ITEMS: { icon: IconName; title: string; text: string; mates?: boolean }[] = [
  { icon: 'microphone', title: 'Ask the professor anything', text: 'Press Ask and say it out loud, or type your question in the chat.' },
  { icon: 'simpler', title: 'Simpler words', text: 'Hear the part again in simpler words. You can also just say “simpler please”.' },
  { icon: 'confused', title: 'Show another way', text: 'Lost? This shows the part on a different slide. Or say “I’m lost”. There are no wrong questions.' },
  { icon: 'raised-hand', title: 'The camera, if it’s on', text: 'Raise your hand to ask a question. The professor also notices if you look puzzled. Nothing is recorded.' },
  { icon: 'hands-on-activity', title: 'Hands-on activities', text: 'Sort, drag, flip and try things yourself. Stuck? The professor helps.' },
  { icon: 'classmates', title: 'Your classmates Maya, Finn and Leo', text: 'They ask questions too, and you can ask them: “Maya, why is that?” Finn sometimes gets things wrong: see if you can catch him!', mates: true },
  { icon: 'back', title: 'Back, Pause and Next', text: 'Back starts the part again (twice: the part before). Next works once a part has played.' },
  // ("After each part: you may be asked how it went": the section check is hidden, SELF_CHECK in app/presentation/page.tsx)
];
/** The static lesson (static vs adaptive): it plays like a video */
const STATIC_ITEMS: typeof ITEMS = [
  { icon: 'play', title: 'Watch and listen', text: 'The professor goes through the slides. Keep your sound on.' },
  { icon: 'pause', title: 'Pause any time', text: 'Pause, and carry on when you’re ready.' },
  { icon: 'back', title: 'Hear a part again', text: 'Back starts the part again. Press it twice for the part before. Next works once a part has played.' },
  { icon: 'hands-on-activity', title: 'Hands-on activities', text: 'Sort, drag, flip and try things yourself. Each one shows you what’s right.' },
];

export default function LessonGuide({ mates, onDone, overlay = false, isStatic = false }: { mates: boolean; onDone: () => void; overlay?: boolean; isStatic?: boolean }) {
  const items = isStatic ? STATIC_ITEMS : ITEMS.filter((it) => !it.mates || mates);
  const body = (
    <div className="w-full max-w-2xl flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">{overlay ? 'In this lesson' : 'Before you start'}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold">Here’s what you can do</h1>
      </div>
      <ul className="w-full grid sm:grid-cols-2 gap-3">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <span className="text-2xl leading-none mt-0.5 text-cyan-300"><Icon name={it.icon} /></span>
            <span>
              <span className="block font-semibold text-cyan-100">{it.title}</span>
              <span className="block text-sm text-slate-300 leading-snug mt-0.5">{it.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <button onClick={onDone} autoFocus className="px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-xl font-semibold">
        {overlay ? 'Back to the lesson' : 'Got it, continue'}
      </button>
    </div>
  );
  return overlay ? (
    <div role="dialog" aria-modal="true" aria-label="What you can do in the lesson" onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/90 backdrop-blur text-white flex items-start sm:items-center justify-center p-6">
      {body}
    </div>
  ) : (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6">{body}</main>
  );
}
