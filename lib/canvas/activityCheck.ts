import type { ActivityElement } from './types';
import { chat, knowledgeExcerpts } from './ai';
import { answerBasis } from './aiFields';

// The answer check for hands-on boxes, before any audio is made: the AI reads
// the box's answer key ("Blue catfish → Invader", "Where are they from? → The
// Mississippi") against the knowledge base. A key the sources clearly
// contradict is corrected; one it can't confirm is flagged for a person
// (⚠ in the editor, and on the Publish checklist). Was: nothing checked AI-made
// answer keys, and one put blue catfish under "Native".

type Fix = { group?: string; back?: string; text?: string };
type Verdict = { n: number; verdict: 'right' | 'wrong' | 'unsure'; why?: string; fix?: Fix };

/** The box's answers as numbered statements for the AI (and what a fix may change). */
function statements(el: ActivityElement): string[] {
  const items = el.items ?? [];
  switch (el.kind) {
    case 'sort': return items.map((it, i) => `${i + 1}. "${it.text}" belongs in the group "${el.groups?.[it.group ?? 0] ?? '?'}"`);
    case 'cards': return items.map((it, i) => `${i + 1}. Card "${it.text}" → answer on the back: "${it.back ?? ''}"`);
    case 'hotspots': return items.map((it, i) => `${i + 1}. Spot "${it.text}" → "${it.back ?? ''}"`);
    case 'order': return [`1. The right order is: ${items.map((it) => it.text).join(' → ')}`];
    case 'slider': return (el.slider?.stops ?? []).map((st, i) => `${i + 1}. ${el.slider?.label ?? 'Value'} ${st.at}${el.slider?.unit ? ` ${el.slider.unit}` : ''}: "${st.text}"`);
  }
}

export interface AnswerCheckResult {
  /** The box's items / slider after any corrections (unchanged when nothing was wrong) */
  items?: ActivityElement['items'];
  slider?: ActivityElement['slider'];
  check: NonNullable<ActivityElement['answerCheck']>;
}

export async function checkActivityAnswers(el: ActivityElement, about: { lesson?: string; topic?: string } = {}): Promise<AnswerCheckResult> {
  const lines = statements(el);
  const excerpts = await knowledgeExcerpts(`${about.topic ?? ''} ${el.prompt ?? ''} ${lines.join(' ')}`.slice(0, 2000), 8);
  const groups = el.groups ?? [];
  const out = JSON.parse(await chat(
    'You check the ANSWER KEY of a hands-on activity in a lesson for 10-14 year olds against excerpts from the lesson\'s knowledge base. ' +
      'For each numbered statement: "right" if the excerpts support it (or it is plainly true and nothing contradicts it); ' +
      '"wrong" if the excerpts say otherwise; "unsure" if the excerpts don\'t cover it and it is doubtful. ' +
      'For "wrong", give the fix from the excerpts: for a sort, "group" = the right group name copied exactly from the list; ' +
      'for a card or spot, "back" = the right answer (short); for a slider stop, "text" = the right text (short); for an order, "order" = the right order as statement item names. ' +
      'Judge the answers only, not the wording. Reply as JSON: {"items":[{"n":1,"verdict":"right|wrong|unsure","why":"short reason","fix":{"group":"..."}}],"order":["item", "..."]}',
    `Lesson: ${about.lesson ?? ''}\nTopic: ${about.topic ?? ''}\nActivity (${el.kind}): ${el.prompt ?? ''}${el.kind === 'sort' ? `\nGroups: ${groups.join(' | ')}` : ''}\n\n` +
      `ANSWER KEY:\n${lines.join('\n')}\n\nKNOWLEDGE BASE EXCERPTS:\n${excerpts.map((e, i) => `[${i + 1}] ${e.content}`).join('\n') || '(none found)'}`,
    true,
    2500,
  ));
  const seen = new Set<number>();
  const verdicts: Verdict[] = (Array.isArray(out.items) ? out.items : []).flatMap((v: any) => {
    const n = Number(v?.n);
    const verdict = v?.verdict === 'wrong' || v?.verdict === 'unsure' ? v.verdict : 'right';
    if (!Number.isInteger(n) || n < 1 || n > lines.length || seen.has(n)) return [];
    seen.add(n);
    return [{ n, verdict, why: typeof v.why === 'string' ? v.why.slice(0, 200) : undefined, fix: v.fix && typeof v.fix === 'object' ? v.fix : undefined }];
  });

  const items = el.items ? el.items.map((it) => ({ ...it })) : undefined;
  const slider = el.slider ? { ...el.slider, stops: el.slider.stops.map((s) => ({ ...s })) } : undefined;
  const notes: string[] = [];
  const fixed: string[] = [];
  const short = (t: unknown, max: number) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, max) : undefined);
  // A key a person typed is never changed: the fix becomes a suggestion (⚠) instead
  const mayFix = !el.keyByPerson;
  for (const v of verdicts) {
    if (v.verdict === 'right') continue;
    const i = v.n - 1;
    const what = el.kind === 'slider' ? `"${slider?.stops[i]?.text}"` : el.kind === 'order' ? 'the order' : `"${items?.[i]?.text}"`;
    // the fix, as words and as a change to make
    let change: { says: string; suggest: string; apply: () => void } | undefined;
    const fix = v.fix;
    if (v.verdict === 'wrong' && fix) {
      if (el.kind === 'sort' && items?.[i]) {
        const g = groups.findIndex((name) => name.trim().toLowerCase() === String(fix.group ?? '').trim().toLowerCase());
        const it = items[i];
        if (g >= 0 && g !== it.group) change = { says: `${what}: moved to "${groups[g]}" (was "${groups[it.group ?? 0]}")`, suggest: `move it to "${groups[g]}"`, apply: () => { it.group = g; } };
      } else if ((el.kind === 'cards' || el.kind === 'hotspots') && items?.[i] && short(fix.back, 160)) {
        const it = items[i], back = short(fix.back, 160);
        change = { says: `${what}: answer changed to "${back}" (was "${it.back ?? ''}")`, suggest: `make the answer "${back}"`, apply: () => { it.back = back; } };
      } else if (el.kind === 'slider' && slider?.stops[i] && short(fix.text, 120)) {
        const st = slider.stops[i], text = short(fix.text, 120)!;
        change = { says: `stop ${st.at}: changed to "${text}" (was "${st.text}")`, suggest: `make it "${text}"`, apply: () => { st.text = text; } };
      }
    }
    if (el.kind === 'order' && v.verdict === 'wrong' && Array.isArray(out.order) && items) {
      // the right order, as long as it's the same items
      const want = (out.order as unknown[]).map((t) => items.findIndex((it) => it.text.trim().toLowerCase() === String(t).trim().toLowerCase()));
      if (want.length === items.length && new Set(want).size === items.length && !want.includes(-1)) {
        const reordered = want.map((k) => items[k]);
        const right = reordered.map((it) => it.text).join(' → ');
        change = { says: `the order: changed to ${right}`, suggest: `make it ${right}`, apply: () => { items.splice(0, items.length, ...reordered); } };
      }
    }
    const why = v.why ? ` (${v.why})` : '';
    if (change && mayFix) { change.apply(); fixed.push(change.says + why); }
    else if (change) notes.push(`${what}: looks wrong, so ${change.suggest}?${why}`);
    else notes.push(`${what}: ${v.verdict === 'wrong' ? 'looks wrong' : 'not confirmed by the sources'}${why}`);
  }
  const after: ActivityElement = { ...el, items, slider };
  return { items, slider, check: { from: answerBasis(after), ok: notes.length === 0, notes, fixed } };
}
