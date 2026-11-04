'use client';

/**
 * One pilot report (lib/study/report.ts), as /studyResults/report shows it: live, a saved snapshot, or two side by
 * side (compact). Printable: the page's own controls hide in print.
 */

import type { Report } from '@/lib/study/report';

const BAR = '#2a78d6';   // one series: the people who got this far
const ANSWER: Record<string, string> = { got: '😀 Got it', kind: '😐 Kind of', lost: '😕 Lost me' };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const mins = (n: number | null) => (n === null ? '–' : n < 1 ? `${Math.round(n * 60)} s` : `${n} min`);
/** "12.7–19.7 min" (seconds spelled out under a minute) */
const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? '–' : lo >= 1 ? `${lo}–${hi} min` : `${mins(lo)} – ${mins(hi)}`);

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-2xl bg-white border p-5 break-inside-avoid print:rounded-none print:border-slate-300">
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ReportView({ report, compact = false }: { report: Report; compact?: boolean }) {
  const first = report.funnel[0]?.reached || 0;
  const g = report.groups;
  const comments = Object.entries(report.comments.reduce<Record<string, Report['comments']>>((m, c) => ((m[c.question] ??= []).push(c), m), {}));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        <b className="text-slate-900">{report.people} {report.people === 1 ? 'person' : 'people'}</b>
        {' '}({g.classmates} with classmates, {g.no_classmates} without{g.none ? `, ${g.none} not started yet` : ''})
        {report.tests ? ', test runs included' : ''} · as of {when(report.at)}
      </p>

      <Card title="Where people stop" note="How many reached each step. A drop shows where people left.">
        {first === 0 ? <p className="text-sm text-slate-500">Nobody yet.</p> : (
          <ol className="flex flex-col gap-1.5" aria-label="People who reached each step">
            {report.funnel.map((s, i) => {
              const drop = i ? report.funnel[i - 1].reached - s.reached : 0;
              return (
                <li key={s.id} className={`grid items-center gap-3 text-sm ${compact ? 'grid-cols-[8.5rem_1fr_4.5rem]' : 'grid-cols-[11rem_1fr_7rem]'}`}>
                  <span className="truncate" title={s.label}>{s.label}</span>
                  <span className="h-3 rounded-r bg-slate-100 overflow-hidden" aria-hidden>
                    <span className="block h-full rounded-r" style={{ width: `${(s.reached / first) * 100}%`, background: BAR, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                  </span>
                  <span className="tabular-nums whitespace-nowrap">
                    <b>{s.reached}</b>
                    {drop > 0 && <span className="text-amber-800"> −{drop}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card title="How long it takes" note="Median, and the shortest to longest (over 3 hours left out: a tab left open).">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="font-medium pb-1.5">Part</th><th className="font-medium pb-1.5">Median</th><th className="font-medium pb-1.5">Range</th>{!compact && <th className="font-medium pb-1.5">People</th>}</tr></thead>
          <tbody>
            {report.minutes.map((m) => (
              <tr key={m.id} className={`border-t ${m.id === 'total' ? 'font-semibold' : ''}`}>
                <td className="py-1.5 pr-3">{m.label}</td>
                <td className="pr-3 tabular-nums whitespace-nowrap">{mins(m.median)}</td>
                <td className="pr-3 tabular-nums text-slate-600 whitespace-nowrap">{range(m.low, m.high)}</td>
                {!compact && <td className="tabular-nums text-slate-600">{m.n}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="The confusion meter's thresholds" note="A topic's score before its &quot;How did that section go?&quot; answer, by the answer people gave.">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="font-medium pb-1.5">Answer</th><th className="font-medium pb-1.5">Topics</th><th className="font-medium pb-1.5">Average score</th></tr></thead>
          <tbody>
            {report.meter.byAnswer.map((a) => (
              <tr key={a.answer} className="border-t"><td className="py-1.5 pr-3">{ANSWER[a.answer]}</td><td className="pr-3 tabular-nums">{a.n}</td><td className="tabular-nums">{a.average ?? '–'}</td></tr>
            ))}
          </tbody>
        </table>
        <div className={`mt-3 grid gap-2 text-sm ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {(['unsure', 'confused'] as const).map((k) => (
            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-500">{k === 'unsure' ? '“Unsure” from' : '“Confused” from'}</span>{' '}
              <b>{report.meter.current[k]}</b> now
              {report.meter.suggested[k] !== null && report.meter.suggested[k] !== report.meter.current[k] && <> · suggested <b className="text-cyan-800">{report.meter.suggested[k]}</b></>}
              {report.meter.suggested[k] !== null && report.meter.suggested[k] === report.meter.current[k] && <> · the data agrees</>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{report.meter.note}</p>
      </Card>

      <Card title="The checks before the lesson">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {([['Sound', report.checks.sound], ['Microphone', report.checks.mic], ['Camera allowed', report.checks.camera]] as const).map(([label, [ok, of]]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-500">{label}</dt>
              <dd><b>{ok}</b> of {of} <span className="text-slate-500">({pct(ok, of)})</span></dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="What people said" note="From the questionnaire's open questions.">
        {comments.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <div className="flex flex-col gap-4">
            {comments.map(([question, list]) => (
              <div key={question}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{question} ({list.length})</h4>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {list.map((c) => (
                    <li key={c.id} className="text-sm rounded-lg border-l-4 border-slate-200 bg-slate-50 px-3 py-1.5 break-inside-avoid">
                      “{c.text}”
                      <span className="ml-2 text-xs text-slate-500">{c.group === 'classmates' ? 'with classmates' : c.group === 'no_classmates' ? 'without' : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
