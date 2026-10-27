// Shared by the server (app/api/study/results/report) and the report page: no server-only imports.
/*
 * The pilot report (/studyResults/report): from the participants' rows and the lesson's confusion snapshots,
 *   - where people stop (how many reached each step)
 *   - how long each part takes (median and range)
 *   - the confusion meter's thresholds, suggested from what people answered at "How did that section go?"
 *     (lib/confusion.ts THRESHOLDS: topic unsure at 3, confused at 6, first guesses)
 *   - what people said in the questionnaire's open questions (what was confusing or annoying, anything else)
 *   - how the sound, mic and camera checks went
 * A saved snapshot is this same object, kept as it was (study_reports, migration 016).
 */

export const REPORT_STEPS: { id: string; label: string }[] = [
  { id: 'consent', label: 'Agreed to take part' },
  { id: 'checks', label: 'Sound and mic' },
  { id: 'about', label: 'About them' },
  { id: 'pre', label: 'Quiz 1' },
  { id: 'start', label: 'Ready to start' },
  { id: 'lesson', label: 'The lesson' },
  { id: 'post', label: 'Quiz 2' },
  { id: 'survey', label: 'Questionnaire' },
  { id: 'done', label: 'Finished' },
];

export type Spread = { id: string; label: string; n: number; median: number | null; low: number | null; high: number | null };
export type Report = {
  at: string;
  tests: boolean;
  people: number;
  groups: { classmates: number; no_classmates: number; none: number };
  funnel: { id: string; label: string; reached: number }[];
  minutes: Spread[];
  meter: {
    rated: number;                                    // topics with a section-check answer and a meter snapshot
    byAnswer: { answer: 'got' | 'kind' | 'lost'; n: number; average: number | null }[];
    current: { unsure: number; confused: number };
    suggested: { unsure: number | null; confused: number | null };
    note: string;
  };
  checks: { sound: [number, number]; mic: [number, number]; camera: [number, number] };   // [ok, answered]
  comments: { id: string; group: string | null; question: string; text: string }[];
};

/** A participant's row, as the report reads it (study_participants) */
export type ReportPerson = {
  id: string; step: string | null; study_group: string | null; is_test: boolean;
  consent_at: string | null; lesson_started_at: string | null; lesson_finished_at: string | null; finished_at: string | null;
  sound_ok: boolean | null; mic_ok: boolean | null; camera_ok: boolean | null;
  pre_quiz: { ms?: number | null } | null; post_quiz: { ms?: number | null } | null;
  survey: { ms?: number | null; answers?: Record<string, unknown> } | null;
};
/** A topic's confusion snapshot (the confusion_topic event's value): its score, and the signals behind it */
export type ReportTopic = { score: number; beforeCheck?: number; signals: Record<string, number> };

const MAX_MINUTES = 180;   // longer: a tab left open, not time spent
const MIN_RATED = 4;       // answers of each kind before a threshold is suggested
const CHECK_POINTS: Record<string, number> = { check_got: -2, check_kind: 2, check_lost: 4 };   // lib/confusion.ts SIGNALS
const COMMENT_QUESTIONS: Record<string, string> = { annoyed: 'Confusing or annoying', other: 'Anything else', liked: 'Liked most' };

const minutesBetween = (a: string | null, b: string | null) => (a && b ? (Date.parse(b) - Date.parse(a)) / 60000 : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

function spread(id: string, label: string, values: (number | null | undefined)[]): Spread {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= MAX_MINUTES).sort((a, b) => a - b);
  if (!v.length) return { id, label, n: 0, median: null, low: null, high: null };
  const mid = v.length / 2;
  const median = v.length % 2 ? v[Math.floor(mid)] : (v[mid - 1] + v[mid]) / 2;
  return { id, label, n: v.length, median: round1(median), low: round1(v[0]), high: round1(v[v.length - 1]) };
}

/**
 * The line that best splits two sets of scores (yes: at or above it), weighing both sets alike (balanced accuracy).
 * null when either set is too small to say.
 */
export function bestLine(no: number[], yes: number[]): number | null {
  if (no.length < MIN_RATED || yes.length < MIN_RATED) return null;
  const candidates = [...new Set([...no, ...yes].map((s) => Math.round(s * 2) / 2))].filter((t) => t > 0).sort((a, b) => a - b);
  let best: { t: number; acc: number } | null = null;
  for (const t of candidates) {
    const acc = (no.filter((s) => s < t).length / no.length + yes.filter((s) => s >= t).length / yes.length) / 2;
    if (!best || acc > best.acc + 1e-9) best = { t, acc };
  }
  return best && best.acc > 0.5 ? best.t : null;
}

export function buildReport(people: ReportPerson[], topics: ReportTopic[], opts: { tests: boolean; at?: string; current?: { unsure: number; confused: number } }): Report {
  const current = opts.current ?? { unsure: 3, confused: 6 };
  const stepAt = (s: string | null) => Math.max(0, REPORT_STEPS.findIndex((x) => x.id === s));
  const funnel = REPORT_STEPS.map((s, k) => ({ id: s.id, label: s.label, reached: people.filter((p) => stepAt(p.step) >= k).length }));

  const ms = (v: number | null | undefined) => (typeof v === 'number' ? v / 60000 : null);
  const minutes = [
    spread('before', 'Consent to the lesson (checks, questions, quiz 1)', people.map((p) => minutesBetween(p.consent_at, p.lesson_started_at))),
    spread('pre', 'Quiz 1', people.map((p) => ms(p.pre_quiz?.ms))),
    spread('lesson', 'The lesson', people.map((p) => minutesBetween(p.lesson_started_at, p.lesson_finished_at))),
    spread('post', 'Quiz 2', people.map((p) => ms(p.post_quiz?.ms))),
    spread('survey', 'Questionnaire', people.map((p) => ms(p.survey?.ms))),
    spread('total', 'Start to finish', people.map((p) => minutesBetween(p.consent_at, p.finished_at))),
  ];

  // The meter: each rated topic's score BEFORE its section check (the answer itself moves the score), by answer:
  // as the lesson logged it; from older logs, worked back from the score (approximate: a score held at 0 hides
  // how far below it went)
  const by: Record<'got' | 'kind' | 'lost', number[]> = { got: [], kind: [], lost: [] };
  for (const t of topics) {
    const answers = (['check_got', 'check_kind', 'check_lost'] as const).filter((k) => t.signals?.[k]);
    if (answers.length !== 1 || typeof t.score !== 'number') continue;   // (none, or asked twice with different answers)
    const k = answers[0];
    by[k.slice(6) as 'got' | 'kind' | 'lost'].push(typeof t.beforeCheck === 'number' ? t.beforeCheck : Math.min(20, Math.max(0, t.score - CHECK_POINTS[k])));
  }
  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const rated = by.got.length + by.kind.length + by.lost.length;
  const suggested = { unsure: bestLine(by.got, [...by.kind, ...by.lost]), confused: bestLine([...by.got, ...by.kind], by.lost) };
  const note = rated === 0
    ? 'No rated topics yet: the meter logs a topic when it ends (migration 012).'
    : suggested.unsure === null && suggested.confused === null
      ? `Too few answers to suggest thresholds yet (${rated} rated topics; needs at least ${MIN_RATED} of each answer).`
      : 'Suggested from where the scores of each answer split best. Change THRESHOLDS in lib/confusion.ts only once there are enough people.';

  const pair = (key: 'sound_ok' | 'mic_ok' | 'camera_ok'): [number, number] => [people.filter((p) => p[key] === true).length, people.filter((p) => p[key] !== null && p[key] !== undefined).length];
  const comments: Report['comments'] = [];
  for (const p of people) {
    for (const [q, label] of Object.entries(COMMENT_QUESTIONS)) {
      const text = p.survey?.answers?.[q];
      if (typeof text === 'string' && text.trim()) comments.push({ id: `${p.id}:${q}`, group: p.study_group, question: label, text: text.trim().slice(0, 600) });
    }
  }

  return {
    at: opts.at ?? new Date().toISOString(),
    tests: opts.tests,
    people: people.length,
    groups: {
      classmates: people.filter((p) => p.study_group === 'classmates').length,
      no_classmates: people.filter((p) => p.study_group === 'no_classmates').length,
      none: people.filter((p) => !p.study_group).length,
    },
    funnel,
    minutes,
    meter: {
      rated,
      byAnswer: (['got', 'kind', 'lost'] as const).map((a) => ({ answer: a, n: by[a].length, average: avg(by[a]) })),
      current,
      suggested,
      note,
    },
    checks: { sound: pair('sound_ok'), mic: pair('mic_ok'), camera: pair('camera_ok') },
    comments,
  };
}
