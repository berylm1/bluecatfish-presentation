'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CheckedClaim, Deck, DeckChecks, Slide } from '@/lib/canvas/types';
import { claimKey, factBasis, slidesToFactCheck } from '@/lib/canvas/checks';

/*
 * The editor's Check tab:
 *   - Check this slide / the changed slides: each fact against the knowledge
 *     base (✅ in the sources, ⚠️ not found, ❌ they say something different),
 *     with the file it came from. Results are kept with the lesson
 *     (deck.checks), so a slide is only checked again once it changes.
 *   - "It's fine" on a ⚠️ or ❌: not flagged again (until the slide changes
 *     and is checked again). "Use this" on a ❌: the box's words with the fix.
 *   - Gaps in the knowledge base: every ⚠️ fact, to find sources for.
 *   - Pictures without a description: ✨ Describe all.
 */

type Fact = NonNullable<DeckChecks['facts']>[string];

const VERDICT: Record<CheckedClaim['verdict'], { icon: string; label: string; box: string }> = {
  contradicted: { icon: '❌', label: 'The sources say something different', box: 'border-red-200 bg-red-50' },
  unsupported: { icon: '⚠️', label: 'Not found in the sources', box: 'border-amber-200 bg-amber-50' },
  supported: { icon: '✅', label: 'In the sources', box: 'border-emerald-200 bg-emerald-50' },
};

const EVERY_AT_ONCE = 2;    // slides checked side by side
const DESCRIBE_AT_ONCE = 2;

/** One slide checked by the server (throws with the server's message). */
async function checkOne(slide: Slide, lessonTitle: string): Promise<Fact> {
  const res = await fetch('/api/editor/check-slide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slide, lessonTitle }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `The check failed (${res.status})`);
  return { from: factBasis(slide), at: new Date().toISOString(), excerpts: d.excerpts ?? 0, claims: d.claims ?? [] };
}

export type Described = { slideId: string; elId: string; helper?: boolean; src: string; alt: string };

/** Pictures that should have a description and don't (the ones the editor warns about), on slides and their helpers. */
export function picturesWithoutDescription(deck: Deck): (Omit<Described, 'alt'> & { slideIndex: number })[] {
  return deck.slides.flatMap((s, slideIndex) => [
    ...s.elements.map((e) => ({ e, helper: false })),
    ...(s.helper?.elements ?? []).map((e) => ({ e, helper: true })),
  ].flatMap(({ e, helper }) =>
    e.type === 'image' && !e.alt?.trim() && (!e.silent || ((e.z ?? 1) > 0 && e.w * e.h >= 100))
      ? [{ slideIndex, slideId: s.id, elId: e.id, helper, src: e.src }] : []));
}

export default function CheckPanel({ deck, slideIndex, lessonTitle, active, runSignal = 0, onRecord, onFine, onUseThis, onDescribed, onGoTo, onGoToSlide }: {
  deck: Deck;
  slideIndex: number;
  lessonTitle: string;
  /** The tab is showing */
  active: boolean;
  /** Changes when Publish asks for the changed slides to be checked */
  runSignal?: number;
  /** Keep a slide's check with the lesson */
  onRecord: (slideId: string, fact: Fact) => void;
  /** Mark a fact fine (or not) */
  onFine: (key: string, fine: boolean) => void;
  /** Put a ❌ fact's fix into its box; false when the box has changed since the check */
  onUseThis: (slideId: string, claim: CheckedClaim) => boolean;
  /** Fill in descriptions the AI wrote; returns how many were used */
  onDescribed: (list: Described[]) => number;
  onGoTo: (elId: string) => void;
  onGoToSlide: (index: number) => void;
}) {
  const slide = deck.slides[Math.min(slideIndex, deck.slides.length - 1)];
  const facts = deck.checks?.facts ?? {};
  const fine = useMemo(() => new Set(deck.checks?.factsOk ?? []), [deck.checks?.factsOk]);
  const result = slide ? facts[slide.id] : undefined;
  const stale = !!result && !!slide && result.from !== factBasis(slide);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ slideId: string; message: string } | null>(null);
  const [every, setEvery] = useState<{ done: number; total: number; failed: number } | null>(null);
  const stopEvery = useRef(false);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [used, setUsed] = useState<Record<string, 'used' | 'changed'>>({});
  const [describing, setDescribing] = useState<{ done: number; total: number } | null>(null);
  const [described, setDescribed] = useState<{ used: number; failed: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const isFine = (slideId: string, c: CheckedClaim) => c.verdict !== 'supported' && fine.has(claimKey(slideId, c.claim));

  const check = async () => {
    if (!slide) return;
    const s = slide;
    setBusy(true);
    setError(null);
    try {
      onRecord(s.id, await checkOne(s, lessonTitle));
      setFailed((f) => { const { [s.id]: _gone, ...rest } = f; return rest; });
    } catch (e) {
      setError({ slideId: s.id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  /** The slides that changed since their check (or never were), or every slide; two at a time, stoppable. */
  const checkMany = async (all: boolean) => {
    const todo = all ? deck.slides.filter((s) => s.elements.some((e) => !e.silent || e.type === 'text')) : slidesToFactCheck(deck).map((x) => x.s);
    if (!todo.length) return;
    stopEvery.current = false;
    setShowSummary(true);
    setEvery({ done: 0, total: todo.length, failed: 0 });
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !stopEvery.current) {
        const s = todo[next++];
        try {
          onRecord(s.id, await checkOne(s, lessonTitle));
          setFailed((f) => { const { [s.id]: _gone, ...rest } = f; return rest; });
          setEvery((p) => p && { ...p, done: p.done + 1 });
        } catch (e) {
          setFailed((f) => ({ ...f, [s.id]: e instanceof Error ? e.message : String(e) }));
          setEvery((p) => p && { ...p, done: p.done + 1, failed: p.failed + 1 });
        }
      }
    };
    await Promise.all(Array.from({ length: EVERY_AT_ONCE }, worker));
    setEvery(null);
  };

  // Publish's "check the changed slides first" (not twice at once)
  const runRef = useRef(checkMany);
  runRef.current = checkMany;
  const everyRef = useRef(every);
  everyRef.current = every;
  useEffect(() => { if (runSignal > 0 && !everyRef.current) runRef.current(false); }, [runSignal]);

  // The whole lesson: problems first, then slides that couldn't be checked, then the rest
  const rows = useMemo(() => {
    if (!active) return [];
    const out = deck.slides.map((s, i) => {
      const r = facts[s.id];
      const open = (v: CheckedClaim['verdict']) => r?.claims.filter((c) => c.verdict === v && !isFine(s.id, c)).length ?? 0;
      return { i, s, r, error: failed[s.id], bad: open('contradicted'), missing: open('unsupported'), ok: r?.claims.filter((c) => c.verdict === 'supported').length ?? 0, stale: !!r && r.from !== factBasis(s) };
    }).filter((x) => x.r || x.error);
    return out.sort((a, b) => b.bad - a.bad || b.missing - a.missing || Number(!!b.error) - Number(!!a.error) || a.i - b.i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, deck.slides, facts, fine, failed]);

  // Gaps in the knowledge base: the facts not found anywhere in it (not marked fine)
  const gaps = useMemo(() => (active ? deck.slides.flatMap((s, i) =>
    (facts[s.id]?.claims ?? []).filter((c) => c.verdict === 'unsupported' && !isFine(s.id, c)).map((c) => ({ i, claim: c.claim }))) : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [active, deck.slides, facts, fine]);

  const toCheck = active ? slidesToFactCheck(deck).length : 0;
  const missingPictures = useMemo(() => (active ? picturesWithoutDescription(deck) : []), [active, deck]);

  /** ✨ Describe all: every picture without a description, two at a time; filled in together (one undo step). */
  const describeAll = async () => {
    const todo = missingPictures;
    setDescribed(null);
    setDescribing({ done: 0, total: todo.length });
    const out: Described[] = [];
    const failedWhy: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const p = todo[next++];
        try {
          const res = await fetch('/api/editor/describe-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src: p.src, lessonTitle, topic: deck.slides[p.slideIndex]?.topic }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok || !d.description) throw new Error(d.error || `failed (${res.status})`);
          out.push({ slideId: p.slideId, elId: p.elId, helper: p.helper, src: p.src, alt: d.description });
        } catch (e) {
          failedWhy.push(`Slide ${p.slideIndex + 1}${p.helper ? ' (helper)' : ''}: ${e instanceof Error ? e.message : String(e)}`);
        }
        setDescribing((x) => x && { ...x, done: x.done + 1 });
      }
    };
    await Promise.all(Array.from({ length: DESCRIBE_AT_ONCE }, worker));
    setDescribing(null);
    setDescribed({ used: out.length ? onDescribed(out) : 0, failed: failedWhy });
  };

  const copyGaps = async () => {
    const text = `Facts the knowledge base doesn't cover (${lessonTitle}):\n` + gaps.map((g) => `- Slide ${g.i + 1}: ${g.claim}`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard: the list is on screen */ }
  };

  if (!slide) return null;
  const openCounts = result ? (['contradicted', 'unsupported', 'supported'] as const).map((v) => [v, result.claims.filter((c) => c.verdict === v && !isFine(slide.id, c)).length] as const) : [];
  const fineCount = result ? result.claims.filter((c) => isFine(slide.id, c)).length : 0;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <h3 className="font-bold text-slate-900">Check slide {slideIndex + 1}</h3>
        <p className="text-xs text-slate-500 mt-1">Checks this slide&apos;s facts (what it shows and what the professor says) against the knowledge base, and shows where each one came from.</p>
      </div>
      <button className="w-full px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50" onClick={check} disabled={busy}>
        {busy ? '🔎 Checking…' : result ? (stale ? '🔎 Check again (it changed)' : '🔎 Check again') : '🔎 Check this slide'}
      </button>
      {error?.slideId === slide.id && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error.message}</p>}
      {stale && <p className="text-xs text-amber-800">This slide has changed since it was checked.</p>}

      {/* the whole lesson */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
        {every ? (
          <>
            <span className="text-xs text-slate-600 flex-1" role="status">Checking slides… {every.done} of {every.total}{every.failed ? ` (${every.failed} failed)` : ''}</span>
            <button className="text-xs underline" onClick={() => { stopEvery.current = true; }}>Stop</button>
          </>
        ) : toCheck > 0 ? (
          <button className="text-xs text-cyan-700 underline" onClick={() => checkMany(false)} title="Slides never checked, or changed since their check">
            🔎 Check {toCheck === deck.slides.length ? `every slide (${toCheck})` : `the ${toCheck} changed slide${toCheck === 1 ? '' : 's'}`}
          </button>
        ) : (
          <span className="text-xs text-emerald-700">✓ Every slide checked, none changed since <button className="underline text-slate-500" onClick={() => checkMany(true)}>check all again</button></span>
        )}
        {rows.length > 0 && !every && <button className="text-xs underline ml-auto" onClick={() => setShowSummary((v) => !v)}>{showSummary ? 'Hide summary' : 'Summary'}</button>}
      </div>
      {showSummary && rows.length > 0 && (
        <div className="rounded-md border border-slate-200 p-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Whole lesson</h4>
          <ul className="flex flex-col gap-0.5">
            {rows.map((x) => (
              <li key={x.s.id}>
                <button className={`w-full text-left text-xs px-1.5 py-1 rounded hover:bg-slate-100 ${x.i === slideIndex ? 'bg-cyan-50' : ''}`} onClick={() => onGoToSlide(x.i)}>
                  <b>Slide {x.i + 1}</b>{x.s.topic ? <span className="text-slate-500"> · {x.s.topic}</span> : null}{' '}
                  <span className="float-right">
                    {x.error && !x.r ? <span className="text-red-700" title={x.error}>couldn&apos;t check</span>
                      : <>{x.bad ? `❌ ${x.bad} ` : ''}{x.missing ? `⚠️ ${x.missing} ` : ''}{!x.bad && !x.missing ? (x.ok ? '✅' : '—') : ''}{x.stale ? ' · changed' : ''}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* gaps in the knowledge base */}
      {gaps.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold text-amber-900 flex-1 text-left" onClick={() => setShowGaps((v) => !v)} aria-expanded={showGaps}>
              {showGaps ? '▾' : '▸'} Gaps in the knowledge base ({gaps.length})
            </button>
            {showGaps && <button className="text-xs underline" onClick={copyGaps}>{copied ? 'Copied ✓' : 'Copy list'}</button>}
          </div>
          {showGaps && (
            <>
              <p className="text-[11px] text-slate-600 mt-1">Facts the lesson states that nothing in the knowledge base covers. Upload a source for them (Text upload), reword them, or mark them fine.</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {gaps.map((g, k) => (
                  <li key={k} className="text-xs"><button className="underline" onClick={() => onGoToSlide(g.i)}>Slide {g.i + 1}</button>: {g.claim}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* pictures without a description */}
      {(missingPictures.length > 0 || describing || described) && (
        <div className="rounded-md border border-slate-200 p-2 text-xs flex flex-col gap-1">
          {missingPictures.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="flex-1">🖼 {missingPictures.length} picture{missingPictures.length === 1 ? '' : 's'} without a description</span>
              {describing
                ? <span role="status">✨ {describing.done} of {describing.total}…</span>
                : <button className="text-violet-700 underline" onClick={describeAll}>✨ Describe all</button>}
            </div>
          )}
          {described && (
            <p role="status" className="text-slate-600">
              {described.used ? `✓ ${described.used} described (Ctrl+Z undoes them all).` : ''}
              {described.failed.length > 0 && <span className="block text-amber-800" title={described.failed.join('\n')}>{described.failed.length} couldn&apos;t be: {described.failed[0]}{described.failed.length > 1 ? ' …' : ''}</span>}
            </p>
          )}
        </div>
      )}

      {result && (
        <p className="text-xs text-slate-600" role="status">
          {result.claims.length === 0
            ? 'No facts to check on this slide.'
            : openCounts.filter(([, n]) => n).map(([v, n]) => `${VERDICT[v].icon} ${n}`).join('   ') || '✓ All marked fine'}
          {fineCount > 0 && <span className="text-slate-400"> · {fineCount} marked fine</span>}
          {result.claims.length > 0 && <span className="text-slate-400"> · from {result.excerpts} excerpt{result.excerpts === 1 ? '' : 's'}</span>}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {result?.claims.map((c, i) => {
          const ok = isFine(slide.id, c);
          const key = claimKey(slide.id, c.claim);
          return (
            <li key={i} className={`rounded-md border px-2.5 py-2 ${ok ? 'border-slate-200 bg-slate-50 opacity-60' : VERDICT[c.verdict].box}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs"><span aria-hidden>{ok ? '☑️' : VERDICT[c.verdict].icon}</span> <b>{c.claim}</b></p>
                {c.elId && slide.elements.some((e) => e.id === c.elId) && (
                  <button className="text-xs underline shrink-0" onClick={() => onGoTo(c.elId!)}>Show</button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{ok ? 'Marked fine' : VERDICT[c.verdict].label}</p>
              {c.sources.map((s, k) => (
                <p key={k} className="text-xs mt-1">
                  <span className="text-slate-500">📄 {s.source}</span>
                  {s.quote && <span className="block italic text-slate-700">“{s.quote}”</span>}
                </p>
              ))}
              {c.fix && <p className="text-xs mt-1"><span className="text-slate-500">The sources say:</span> {c.fix}</p>}
              {c.verdict !== 'supported' && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {c.rewrite && !ok && (used[key]
                    ? <span className="text-xs text-slate-500">{used[key] === 'used' ? '✓ Used (Ctrl+Z undoes it)' : 'The box changed since the check: not used'}</span>
                    : <button className="px-2 py-0.5 rounded border border-cyan-600 text-cyan-800 bg-white text-xs hover:bg-cyan-50"
                        title={[c.rewrite.text && `Shown: ${c.rewrite.text}`, c.rewrite.say && `Said: ${c.rewrite.say}`].filter(Boolean).join('\n')}
                        onClick={() => { const r = onUseThis(slide.id, c); setUsed((u) => ({ ...u, [key]: r ? 'used' : 'changed' })); }}>Use this</button>)}
                  <button className="text-xs underline text-slate-600" onClick={() => onFine(key, !ok)}>{ok ? 'Undo “fine”' : 'It’s fine'}</button>
                </div>
              )}
              {c.rewrite && !ok && !used[key] && (
                <p className="text-[11px] text-slate-600 mt-1">
                  {c.rewrite.text && <span className="block"><span className="text-slate-500">Shown would be:</span> {c.rewrite.text}</span>}
                  {c.rewrite.say && <span className="block"><span className="text-slate-500">Said would be:</span> {c.rewrite.say}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {result && result.claims.some((c) => c.verdict !== 'supported' && !isFine(slide.id, c)) && (
        <p className="text-xs text-slate-500">“Not found” doesn&apos;t mean wrong: the knowledge base may just not cover it. Add a source in Text upload, reword it, or mark it fine.</p>
      )}
    </div>
  );
}
