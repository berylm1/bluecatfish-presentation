/*
 * How each slide of a lesson went for learners, from the events table (every
 * event on /presentation carries value.lesson and value.slide). Shown in the
 * slide editor as a heatmap, so you can see which slides to rework.
 *
 * "Struggled" = the learner showed at least one sign of confusion on the
 * slide: a puzzled face on camera, "I'm lost", "simpler please", or "lost me"
 * at the self-check. Counted once per learner (session), not per event.
 */

export type EventRow = {
  session_id: string;
  event_type: string;
  value: Record<string, unknown> | null;
  dwell_ms: number | null;
};

export type SlideStats = {
  learners: number;          // sessions that saw the slide
  struggled: number;         // of those, how many showed a confusion sign
  share: number;             // struggled / learners (0–1)
  puzzledFace: number;       // camera: puzzled look
  boredFace: number;         // camera: gone quiet
  lostClicks: number;        // "I'm lost" / "you lost me"
  simpler: number;           // "simpler please"
  repeats: number;
  questions: number;
  selfCheck: { got: number; kind: number; lost: number };
  helpOffered: number;       // "You look puzzled…?"
  helpAccepted: number;      //   … and they said yes
  avgSeconds: number | null; // average time on the slide
  away: number;              // looked away / left the camera
  /** The slide's hands-on box (null when it has none, or nobody got to it) */
  handsOn: HandsOnStats | null;
};

export type HandsOnStats = {
  started: number;           // the lesson waited for a learner to do it
  done: number;
  skipped: number;
  hints: number;             // "I'm lost" / a puzzled face while doing it: the hand showed again
  wrong: number;             // wrong moves (a drop in the wrong group, a step out of order)
  steppedIn: number;         // the same item wrong twice: the professor explained it
  finn: number;              // Finn had a go (a wrong item, a wrong guess)
  finnCaught: number;        //   … and the learner put his item right
  avgSeconds: number | null; // from the learner's turn to done
  /** What went wrong most: [item, times], most first (at most 5) */
  hardest: [string, number][];
};

const empty = (): SlideStats => ({
  learners: 0, struggled: 0, share: 0, puzzledFace: 0, boredFace: 0, lostClicks: 0, simpler: 0,
  repeats: 0, questions: 0, selfCheck: { got: 0, kind: 0, lost: 0 }, helpOffered: 0, helpAccepted: 0,
  avgSeconds: null, away: 0, handsOn: null,
});
const emptyHandsOn = (): HandsOnStats => ({ started: 0, done: 0, skipped: 0, hints: 0, wrong: 0, steppedIn: 0, finn: 0, finnCaught: 0, avgSeconds: null, hardest: [] });

/** Stats per slide id. */
export function slideStats(rows: EventRow[]): Record<string, SlideStats> {
  const out: Record<string, SlideStats> = {};
  const seen: Record<string, Set<string>> = {};
  const struggled: Record<string, Set<string>> = {};
  const dwell: Record<string, number[]> = {};
  const handsOnTimes: Record<string, number[]> = {};
  const wrongItems: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    const slide = typeof r.value?.slide === 'string' ? r.value.slide : null;
    if (!slide) continue;
    const s = (out[slide] ??= empty());
    (seen[slide] ??= new Set()).add(r.session_id);
    const struggle = () => (struggled[slide] ??= new Set()).add(r.session_id);
    const v = r.value ?? {};

    switch (r.event_type) {
      case 'emotion_state':
        if (v.state === 'confused') { s.puzzledFace++; struggle(); }
        else if (v.state === 'bored') s.boredFace++;
        break;
      case 'confusion_click': s.lostClicks++; struggle(); break;
      case 'simplify_request': s.simpler++; struggle(); break;
      case 'repeat_request': s.repeats++; break;
      case 'tutor_question': s.questions++; break;
      case 'presence_away': s.away++; break;
      case 'self_check':
        if (v.rating === 'got' || v.rating === 'kind' || v.rating === 'lost') s.selfCheck[v.rating]++;
        if (v.rating === 'lost') struggle();
        break;
      case 'tutor_decision':
        if (v.action === 'checkin') {
          s.helpOffered++;
          if (v.answer === 'yes') s.helpAccepted++;
        } else if (typeof v.action === 'string' && v.action.startsWith('activity_')) {
          const h = (s.handsOn ??= emptyHandsOn());
          if (v.action === 'activity_start') h.started++;
          else if (v.action === 'activity_done') {
            h.done++;
            if (typeof v.seconds === 'number' && v.seconds > 0 && v.seconds < 900) (handsOnTimes[slide] ??= []).push(v.seconds);
          } else if (v.action === 'activity_skip') h.skipped++;
          else if (v.action === 'activity_hint') h.hints++;
          else if (v.action === 'activity_help') h.steppedIn++;
          else if (v.action === 'activity_finn') h.finn++;
          else if (v.action === 'activity_finn_caught') h.finnCaught++;
          else if (v.action === 'activity_wrong') {
            h.wrong++;
            if (typeof v.item === 'string' && v.item) {
              const w = (wrongItems[slide] ??= {});
              w[v.item] = (w[v.item] ?? 0) + 1;
            }
          }
        }
        break;
      case 'dwell':
        // over 10 minutes is a learner who walked off, not reading time
        if (typeof r.dwell_ms === 'number' && r.dwell_ms > 0 && r.dwell_ms < 600_000) (dwell[slide] ??= []).push(r.dwell_ms);
        break;
    }
  }

  for (const [slide, s] of Object.entries(out)) {
    s.learners = seen[slide]?.size ?? 0;
    s.struggled = struggled[slide]?.size ?? 0;
    s.share = s.learners ? s.struggled / s.learners : 0;
    const d = dwell[slide];
    s.avgSeconds = d?.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length / 1000) : null;
    if (s.handsOn) {
      const t = handsOnTimes[slide];
      s.handsOn.avgSeconds = t?.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null;
      s.handsOn.hardest = Object.entries(wrongItems[slide] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }
  }
  return out;
}
