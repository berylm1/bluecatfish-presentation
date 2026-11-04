/**
 * /studyResults/adaptive: study 2, static vs adaptive (editors only, under /studyResults in lib/editorAuth.ts): its
 * results (components/study/StudyResultsView), then how the two groups differ. People take it at /study2.
 */

import StudyResultsView from '@/components/study/StudyResultsView';

/** What each group gets ('Same': as in the other group) */
const FEATURES: { what: string; static: string; adaptive: string }[] = [
  { what: 'Slides, the professor’s narration, pictures, laser marks', static: 'Same', adaptive: 'Same' },
  { what: 'Pause, Repeat, previous and next slide', static: '✓', adaptive: '✓' },
  { what: 'Hands-on activities', static: 'Their own right and wrong; no hints, help or praise', adaptive: 'As in the lesson: hints, the professor steps in, Finn has a go' },
  { what: '“How did that section go?”', static: 'Asked, nothing follows (for the results)', adaptive: 'Asked, the lesson responds' },
  { what: 'Confusion meter', static: 'Records only (for the results)', adaptive: 'Records and responds' },
  { what: 'Asking the professor (Talk, typing, said commands)', static: '–', adaptive: '✓ answered from the lesson’s own words' },
  { what: '“I’m lost”, “simpler please”, helper slides, plain words', static: '–', adaptive: '✓' },
  { what: 'The classmates (Maya, Finn, Leo)', static: '–', adaptive: '✓' },
  { what: 'Camera (raise a hand, a puzzled look)', static: '–', adaptive: '✓ (if they allowed it)' },
  { what: 'The ending', static: 'What was covered', adaptive: 'Personal: their name, what they did, the hardest part' },
  { what: '“Here’s what you can do” page', static: 'Its own, shorter list', adaptive: 'The full list' },
];

/** Keeping it fair: the extras re-explain the same lesson, and are counted */
const FAIR: { title: string; text: string }[] = [
  { title: 'The extras only re-explain', text: 'In this study the professor answers from the lesson’s own words (not the whole knowledge base), so the adaptive group isn’t taught anything the static group wasn’t.' },
  { title: 'Quiz 2 tests the base lesson', text: 'Check it with “✨ Check them against the lesson” on the classmates study’s page: the same lesson, its base slides only.' },
  { title: 'Each person’s extras are counted', text: 'Questions asked, classmate turns, helper slides and minutes in the lesson are in the table and the spreadsheet.' },
];

const card = 'rounded-2xl bg-white border p-5';

export default function AdaptiveStudy() {
  return (
    <StudyResultsView which={2}>
      <section className={card}>
        <h2 className="font-semibold">How the two groups differ</h2>
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
        <ol className="mt-3 grid md:grid-cols-3 gap-3">
          {FAIR.map((f, i) => (
            <li key={f.title} className="rounded-xl bg-slate-50 p-4 text-sm">
              <span className="font-semibold">{i + 1}. {f.title}</span>
              <p className="mt-1 text-slate-600">{f.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </StudyResultsView>
  );
}
