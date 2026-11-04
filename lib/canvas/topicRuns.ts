import type { Slide } from './types';

// A topic is one run of slides in a row with the same name (topicIndexes in queue.ts). The same name in two runs
// that aren't next to each other is two topics to learners: the topic list shows it twice ("Eating Blue Catfish",
// "Safe to Eat", "Eating Blue Catfish"). Usually one slide in the middle of a topic was named again on save (its
// words changed) and the AI gave it a name of its own, splitting the topic in two.
//   - joinSplitTopics: on save, the names the AI just gave are put right before they're kept (prepare.ts)
//   - topicRepeats: the editor's warning, with a one-click fix, for what's left (names a person typed)

type Run = { start: number; end: number; key: string };
const keyOf = (t: string | undefined) => t?.trim().toLowerCase() ?? '';

function runsOf(topics: (string | undefined)[]): Run[] {
  const runs: Run[] = [];
  topics.forEach((t, i) => {
    const last = runs[runs.length - 1];
    if (last && last.key === keyOf(t)) last.end = i;
    else runs.push({ start: i, end: i, key: keyOf(t) });
  });
  return runs;
}

/**
 * The topics with no name used by two runs apart, where only the slides in `fresh` (just named by the AI) change:
 *   - a run between two runs of the same topic joins that topic (or, when it's the longer, the later run joins it)
 *   - a run reusing a name from further away takes the name of the topic before it (the first: the one after)
 * What can't be fixed without changing a person's names stays, for the editor's warning.
 */
export function joinSplitTopics(topics: (string | undefined)[], fresh: Set<number>): (string | undefined)[] {
  const t = [...topics];
  const allFresh = (r: Run) => { for (let i = r.start; i <= r.end; i++) if (!fresh.has(i)) return false; return true; };
  const rename = (r: Run, to: string | undefined) => { for (let i = r.start; i <= r.end; i++) t[i] = to; };
  for (let guard = 0; guard < t.length; guard++) {
    const runs = runsOf(t);
    let changed = false;
    for (let r = 1; r + 1 < runs.length && !changed; r++) {
      const [before, mid, after] = [runs[r - 1], runs[r], runs[r + 1]];
      if (!before.key || before.key !== after.key) continue;
      const midLen = mid.end - mid.start, afterLen = after.end - after.start;
      if (allFresh(mid) && (midLen <= afterLen || !allFresh(after))) { rename(mid, t[before.start]); changed = true; }
      else if (allFresh(after)) { rename(after, t[mid.start]); changed = true; }
    }
    for (let r = 0; r < runs.length && !changed; r++) {
      const run = runs[r];
      if (!run.key || !allFresh(run) || !runs.some((o, k) => k !== r && o.key === run.key)) continue;
      const near = runs[r - 1] ?? runs[r + 1];
      if (near) { rename(run, t[near.start]); changed = true; }
    }
    if (!changed) break;
  }
  return t;
}

const slidesLabel = (r: Run) => (r.start === r.end ? `slide ${r.start + 1}` : `slides ${r.start + 1}–${r.end + 1}`);

/**
 * Each slide in a topic that's also somewhere else (not next to it): what to tell the editor, and the name that
 * would join it up (`topic`, for the "Use …" button). Slide id → warning.
 */
export function topicRepeats(slides: Slide[]): Map<string, { message: string; topic?: string }> {
  const topics = slides.map((s) => s.topic);
  const runs = runsOf(topics);
  const out = new Map<string, { message: string; topic?: string }>();
  const mark = (r: Run, message: string, topic?: string) => { for (let i = r.start; i <= r.end; i++) if (!out.has(slides[i].id)) out.set(slides[i].id, { message, topic }); };
  // a run splitting a topic in two: it's the odd one out (the topic's second half isn't marked too)
  const halves = new Set<number>();
  for (let r = 1; r + 1 < runs.length; r++) {
    const [before, mid, after] = [runs[r - 1], runs[r], runs[r + 1]];
    if (!before.key || before.key !== after.key) continue;
    halves.add(r + 1);
    const name = topics[before.start]!.trim();
    mark(mid, `This splits “${name}” in two (${slidesLabel(before)} and ${slidesLabel(after)}), so learners see that topic twice. Give this slide the same topic, or move it out from between them.`, name);
  }
  // otherwise: the later runs of a name used further back
  runs.forEach((run, r) => {
    if (!run.key || halves.has(r)) return;
    const first = runs.findIndex((o) => o.key === run.key);
    if (first === r) return;
    const name = topics[run.start]!.trim();
    const near = runs[r - 1]?.key && runs[r - 1].key !== run.key ? topics[runs[r - 1].start]!.trim() : undefined;
    mark(run, `“${name}” is also the topic of ${slidesLabel(runs[first])}, further back, so learners see it twice. Rename this one, or move these slides next to those.`, near);
  });
  return out;
}
