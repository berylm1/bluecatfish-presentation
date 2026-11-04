/**
 * /studyResults/adaptive: the static vs adaptive study (v2; editors only, under /studyResults in lib/editorAuth.ts).
 * Being planned: nothing runs yet. This page holds the plan as it was agreed (the two groups, what keeps it fair,
 * what's left to build); once it runs, its results go here, as the classmates study's do on /studyResults.
 */

import StudyTabs from '@/components/study/StudyTabs';

/** What each group gets ('same': as in the other group) */
const FEATURES: { what: string; static: string; adaptive: string }[] = [
  { what: 'Slides, the professor’s narration, pictures, laser marks', static: 'Same', adaptive: 'Same' },
  { what: 'Pause, replay, next', static: '✓', adaptive: '✓' },
  { what: 'Hands-on boxes and questions', static: 'One try, then right or wrong and the answer', adaptive: 'As now' },
  { what: '“How did that section go?”', static: 'Asked, nothing happens (for the results)', adaptive: 'Asked, the lesson responds' },
  { what: 'Confusion meter', static: 'Records only (for the results)', adaptive: 'Records and responds' },
  { what: 'Asking the professor (out loud or in the chat)', static: '–', adaptive: '✓' },
  { what: 'The classmates (Maya, Finn, Leo)', static: '–', adaptive: '✓' },
  { what: 'Camera (raise a hand, a puzzled look)', static: '–', adaptive: '✓' },
  { what: 'Helper slides when someone is confused', static: '–', adaptive: '✓' },
  { what: 'The plain version of the words', static: '–', adaptive: '✓' },
  { what: 'Microphone check before the lesson', static: 'Skipped', adaptive: '✓' },
];

/** Keeping it fair: the extras re-explain the same lesson, and are counted */
const FAIR: { title: string; text: string }[] = [
  { title: 'The extras only re-explain', text: 'The professor’s answers, the classmates and the helper slides use only facts already in the lesson. (Today the professor answers from the whole knowledge base; for this study, from the lesson’s own facts.)' },
  { title: 'Quiz 2 tests the base lesson', text: 'Every question can be answered by someone who only saw the static version.' },
  { title: 'Each person’s extras are recorded', text: 'Questions asked, times a classmate spoke, helper slides seen, and minutes in the lesson: so the results can say how much more the adaptive group got.' },
];

const STEPS: string[] = [
  'Static mode in the lesson player: the adaptive features switched off (kept, not deleted)',
  'Static questions: one try, right or wrong, the answer shown',
  'The professor answers from the lesson’s own facts (adaptive)',
  'Check Quiz 2 against the base lesson',
  'Record each person’s extras',
  'The study itself: its two groups, consent wording and questionnaire',
  'This page: the results, like the classmates study’s',
];

const card = 'rounded-2xl bg-white border p-5';

export default function AdaptiveStudy() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <StudyTabs current="adaptive" />
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Static vs adaptive</h1>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-sm font-semibold">Being planned: nothing runs yet</span>
          <p className="w-full text-slate-600">
            Does a lesson that responds to the learner teach better than one that doesn’t? Both groups get the same lesson; the adaptive one
            adds help on top when the learner needs it. Everyone does the same Quiz 1 and Quiz 2.
          </p>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          <div className={card}>
            <h2 className="font-semibold text-lg">Static</h2>
            <p className="mt-1 text-sm text-slate-600">The professor reads the slides and doesn’t respond. Like a video: pause, replay and next work. Questions say right or wrong and show the answer.</p>
          </div>
          <div className={card}>
            <h2 className="font-semibold text-lg">Adaptive</h2>
            <p className="mt-1 text-sm text-slate-600">The lesson as it is now: the professor answers questions, the classmates join in, and the confusion meter brings in help.</p>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">What each group gets</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="font-medium pb-2 pr-4">Part of the lesson</th>
                  <th className="font-medium pb-2 pr-4">Static</th>
                  <th className="font-medium pb-2">Adaptive</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => (
                  <tr key={f.what} className="border-t align-top">
                    <td className="py-2 pr-4">{f.what}</td>
                    <td className={`py-2 pr-4 ${f.static === '–' ? 'text-slate-400' : ''}`}>{f.static}</td>
                    <td className="py-2">{f.adaptive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Keeping it fair</h2>
          <p className="text-sm text-slate-500">So a better Quiz 2 means the lesson responding helped, not that one group heard more facts.</p>
          <ol className="mt-3 grid md:grid-cols-3 gap-3">
            {FAIR.map((f, i) => (
              <li key={f.title} className="rounded-xl bg-slate-50 p-4 text-sm">
                <span className="font-semibold">{i + 1}. {f.title}</span>
                <p className="mt-1 text-slate-600">{f.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Still to build</h2>
          <ol className="mt-3 flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-sm">
                <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="flex-1 pt-0.5">{s}</span>
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">To do</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="text-sm text-slate-500">
          With about 10 people, running both studies at once leaves 2 or 3 per group, too few to compare. The classmates study runs first;
          this one after, or when there are more people.
        </p>
      </div>
    </main>
  );
}
