'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Concept, Deck, DeckConcepts } from '@/lib/canvas/types';
import { builtOn, conceptIssues, conceptSlides } from '@/lib/canvas/concepts';

/*
 * "Ideas" in the editor's side panel: the lesson's concept map (lib/canvas/concepts.ts).
 *   - the list: every idea with its slide and what it builds on, as plain text
 *   - the map: the same as circles joined by lines (an idea → the ideas that build on it), over the editor
 *   - Draft with AI: reads the slides and writes the ideas and their links; yours (changed or added) are kept
 * Every change is an edit like any other (undo, save). The lesson goes by the saved map.
 */

const btn = 'px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs disabled:opacity-40';
const COLORS = ['#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#ca8a04', '#dc2626', '#0d9488', '#9333ea'];
const W = 1000, H = 620;

type Props = {
  deck: Deck;
  /** Change the map (an undoable edit); `group`: quick repeats (typing) are one undo step */
  onChange: (fn: (c: DeckConcepts) => void, group?: string) => void;
  /** Put a whole map in (the AI's draft) */
  onDraft: (c: DeckConcepts) => void;
  onGoTo: (slideIndex: number) => void;
};

/** Where each idea sits: left to right by its slide, pushed apart, linked ones pulled together (the same every time) */
function layout(ideas: Concept[], slideOf: Map<string, number>, slides: number): Map<string, { x: number; y: number }> {
  const pts = ideas.map((c, n) => {
    const at = slideOf.get(c.id) ?? 0;
    // (a spread that doesn't change between draws: by the idea's place in the list)
    const jitter = ((n * 7919) % 97) / 97;
    return { id: c.id, tx: 70 + ((at + 0.5) / Math.max(1, slides)) * (W - 140), x: 70 + ((at + 0.5) / Math.max(1, slides)) * (W - 140), y: 80 + jitter * (H - 160) };
  });
  const index = new Map(pts.map((p, i) => [p.id, i]));
  const links = ideas.flatMap((c) => c.needs.map((n) => [index.get(n), index.get(c.id)] as const)).filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);
  for (let step = 0; step < 260; step++) {
    const k = 1 - step / 260;
    const fx = pts.map(() => 0), fy = pts.map(() => 0);
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        let dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
        if (!dx && !dy) { dx = 0.5; dy = (a - b) * 0.5; }
        const d2 = Math.max(60, dx * dx + dy * dy);
        const f = 14000 / d2;
        const d = Math.sqrt(d2);
        fx[a] += (dx / d) * f; fy[a] += (dy / d) * f;
        fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
      }
    }
    for (const [a, b] of links) {
      const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - 140) * 0.02;
      fx[a] += (dx / d) * f; fy[a] += (dy / d) * f;
      fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    pts.forEach((p, i) => {
      fx[i] += (p.tx - p.x) * 0.03;          // its slide's place, left to right
      fy[i] += (H / 2 - p.y) * 0.004;        // loosely to the middle
      p.x = Math.min(W - 50, Math.max(50, p.x + Math.max(-30, Math.min(30, fx[i])) * k));
      p.y = Math.min(H - 50, Math.max(40, p.y + Math.max(-30, Math.min(30, fy[i])) * k));
    });
  }
  return new Map(pts.map((p) => [p.id, { x: p.x, y: p.y }]));
}

export default function ConceptsPanel({ deck, onChange, onDraft, onGoTo }: Props) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [mapOpen, setMapOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const concepts = deck.concepts;
  const ideas = useMemo(() => concepts?.ideas ?? [], [concepts]);
  const slideOf = useMemo(() => (concepts ? conceptSlides(deck, concepts) : new Map<string, number>()), [deck, concepts]);
  const issues = useMemo(() => (concepts ? conceptIssues(deck, concepts) : []), [deck, concepts]);
  const byId = useMemo(() => new Map(ideas.map((c) => [c.id, c])), [ideas]);

  const draft = async () => {
    if (ideas.some((c) => c.byAI) && !window.confirm('Draft the ideas again? The AI’s ideas are written again; the ones you changed or added are kept.')) return;
    setState({ busy: true });
    try {
      const res = await fetch('/api/editor/concepts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.concepts) throw new Error(d.error || 'The ideas couldn’t be drafted');
      onDraft(d.concepts);
      setState({ busy: false });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const addIdea = () => {
    const id = `c-${Date.now().toString(36)}`;
    onChange((c) => { c.ideas.push({ id, name: 'New idea', means: '', slide: deck.slides[0]?.id ?? '', needs: [] }); });
    setSelected(id);
  };

  const editor = (c: Concept) => {
    const at = slideOf.get(c.id);
    const mine = (x: DeckConcepts) => x.ideas.find((i) => i.id === c.id);
    const can = ideas.filter((o) => o.id !== c.id && !c.needs.includes(o.id) && (slideOf.get(o.id) ?? Infinity) <= (at ?? Infinity));
    const leads = ideas.filter((o) => o.needs.includes(c.id));
    const asked = (deck.bank?.questions ?? []).filter((q) => concepts?.questions[q.id] === c.id);
    return (
      <div className="flex flex-col gap-2 text-xs">
        <label className="block">
          <span className="block text-slate-500 mb-0.5">The idea</span>
          <input className="w-full border border-slate-300 rounded px-2 py-1 text-sm font-semibold" value={c.name} maxLength={80}
            onChange={(e) => onChange((x) => { const i = mine(x); if (i) { i.name = e.target.value; delete i.byAI; } }, `idea-name-${c.id}`)} />
        </label>
        <label className="block">
          <span className="block text-slate-500 mb-0.5">What it means</span>
          <textarea className="w-full border border-slate-300 rounded px-2 py-1" rows={3} value={c.means} maxLength={240}
            onChange={(e) => onChange((x) => { const i = mine(x); if (i) { i.means = e.target.value; delete i.byAI; } }, `idea-means-${c.id}`)} />
        </label>
        <label className="block">
          <span className="block text-slate-500 mb-0.5">Taught on</span>
          <span className="flex gap-1">
            <select className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1" value={c.slide}
              onChange={(e) => onChange((x) => { const i = mine(x); if (i) { i.slide = e.target.value; delete i.byAI; } })}>
              {at === undefined && <option value={c.slide}>(a slide that’s gone)</option>}
              {deck.slides.map((s, n) => <option key={s.id} value={s.id}>Slide {n + 1}{s.topic ? ` · ${s.topic.trim()}` : ''}</option>)}
            </select>
            {at !== undefined && <button className={btn} onClick={() => { setMapOpen(false); onGoTo(at); }}>Go to</button>}
          </span>
        </label>
        <div>
          <span className="block text-slate-500 mb-0.5">Builds on (needed first)</span>
          <div className="flex flex-wrap gap-1">
            {c.needs.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100">
                <button className="hover:underline" onClick={() => setSelected(n)}>{byId.get(n)?.name ?? '?'}</button>
                <button aria-label="Remove the link" className="text-slate-400 hover:text-rose-600" onClick={() => onChange((x) => { const i = mine(x); if (i) { i.needs = i.needs.filter((y) => y !== n); delete i.byAI; } })}>×</button>
              </span>
            ))}
            {!c.needs.length && <span className="text-slate-400">nothing: a starting idea</span>}
          </div>
          {can.length > 0 && (
            <select className="mt-1 w-full border border-slate-300 rounded px-2 py-1" value="" onChange={(e) => { const v = e.target.value; if (v) onChange((x) => { const i = mine(x); if (i) { i.needs.push(v); delete i.byAI; } }); }}>
              <option value="">＋ Add an idea it builds on…</option>
              {can.map((o) => <option key={o.id} value={o.id}>{o.name} (slide {(slideOf.get(o.id) ?? 0) + 1})</option>)}
            </select>
          )}
        </div>
        {leads.length > 0 && (
          <div>
            <span className="block text-slate-500 mb-0.5">Leads to</span>
            <div className="flex flex-wrap gap-1">{leads.map((o) => <button key={o.id} className="px-2 py-0.5 rounded-full bg-slate-100 hover:underline" onClick={() => setSelected(o.id)}>{o.name}</button>)}</div>
          </div>
        )}
        {asked.length > 0 && (
          <div>
            <span className="block text-slate-500 mb-0.5">The classmates’ questions about it</span>
            <ul className="list-disc pl-4 text-slate-700">{asked.map((q) => <li key={q.id}>{q.q}</li>)}</ul>
          </div>
        )}
        <button className={`${btn} self-start text-rose-700`} onClick={() => {
          if (!window.confirm(`Remove “${c.name}” from the map?`)) return;
          onChange((x) => {
            x.ideas = x.ideas.filter((i) => i.id !== c.id);
            for (const i of x.ideas) i.needs = i.needs.filter((n) => n !== c.id);
            for (const k of Object.keys(x.questions)) if (x.questions[k] === c.id) delete x.questions[k];
            if (x.quiz) for (const k of Object.keys(x.quiz)) if (x.quiz[k] === c.id) delete x.quiz[k];
          });
          setSelected(null);
        }}>Remove this idea</button>
      </div>
    );
  };

  const sel = selected ? byId.get(selected) ?? null : null;
  const topics = [...new Set(deck.slides.map((s) => s.topic?.trim() ?? ''))].filter(Boolean);
  const colorOf = (c: Concept) => COLORS[Math.max(0, topics.indexOf(deck.slides[slideOf.get(c.id) ?? 0]?.topic?.trim() ?? '')) % COLORS.length];

  return (
    <div className="flex flex-col gap-3 text-xs text-slate-700">
      <p className="text-slate-500 leading-snug">
        The ideas the slides teach, and which build on which. The classmates only ask about an idea once its slide has played, and the professor knows what’s been taught so far.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={`${btn} font-semibold`} disabled={state.busy} onClick={draft}>{state.busy ? 'Reading the slides…' : ideas.length ? '✨ Draft again' : '✨ Draft with AI'}</button>
        {ideas.length > 0 && <button className={btn} onClick={() => setMapOpen(true)}>◎ Open the map</button>}
        {concepts && <button className={btn} onClick={addIdea}>＋ Idea</button>}
      </div>
      {state.error && <p className="text-rose-700">{state.error}</p>}
      {!ideas.length && !state.busy && <p className="text-slate-500">No map yet. “Draft with AI” reads the slides and writes one for you to check (about half a minute).</p>}
      {concepts && ideas.length > 0 && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!concepts.off} onChange={(e) => onChange((x) => { if (e.target.checked) delete x.off; else x.off = true; })} />
          The lesson uses this map
        </label>
      )}
      {issues.length > 0 && (
        <ul className="rounded-md bg-amber-50 border border-amber-200 p-2 flex flex-col gap-1">
          {issues.map((i, n) => <li key={n}>{i.id ? <button className="text-left hover:underline" onClick={() => setSelected(i.id)}>⚠ {i.text}</button> : <>⚠ {i.text}</>}</li>)}
        </ul>
      )}
      {sel && !mapOpen && (
        <div className="rounded-md border border-cyan-300 bg-cyan-50/50 p-2">
          <div className="flex justify-end"><button className="text-slate-400 hover:text-slate-700" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
          {editor(sel)}
        </div>
      )}
      {/* the list: the map as plain text */}
      {ideas.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {ideas.map((c) => {
            const at = slideOf.get(c.id);
            return (
              <li key={c.id}>
                <button className={`w-full text-left rounded-md border px-2 py-1.5 hover:border-cyan-500 ${selected === c.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200'}`} onClick={() => setSelected(c.id)}>
                  <span className="flex items-baseline gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(c) }} />
                    <span className="font-semibold text-slate-900 flex-1 min-w-0">{c.name}</span>
                    <span className="text-slate-400 shrink-0">{at === undefined ? 'no slide' : `slide ${at + 1}`}</span>
                  </span>
                  {c.means && <span className="block text-slate-600 mt-0.5">{c.means}</span>}
                  <span className="block text-slate-400 mt-0.5">{c.needs.length ? `builds on: ${c.needs.map((n) => byId.get(n)?.name ?? '?').join(', ')}` : 'a starting idea'}{c.byAI ? ' · ✨ AI' : ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {/* each of the classmates' questions, and the idea it's about */}
      {concepts && ideas.length > 0 && (deck.bank?.questions.length ?? 0) > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-slate-800">The classmates’ questions ({Object.keys(concepts.questions).length} of {deck.bank!.questions.length} with an idea)</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {deck.bank!.questions.map((q) => (
              <li key={q.id}>
                <span className="block text-slate-700">{q.q}</span>
                <select className="mt-0.5 w-full border border-slate-300 rounded px-2 py-1" value={concepts.questions[q.id] ?? ''}
                  onChange={(e) => onChange((x) => { if (e.target.value) x.questions[q.id] = e.target.value; else delete x.questions[q.id]; })}>
                  <option value="">(no idea: matched by its words)</option>
                  {ideas.map((c) => <option key={c.id} value={c.id}>{c.name} (slide {(slideOf.get(c.id) ?? 0) + 1})</option>)}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}
      {mapOpen && concepts && (
        <MapView ideas={ideas} slideOf={slideOf} slides={deck.slides.length} colorOf={colorOf} topics={topics} selected={selected} onSelect={setSelected}
          builtOnIds={sel ? new Set(builtOn(concepts, sel.id).map((c) => c.id)) : new Set()} onClose={() => setMapOpen(false)}>
          {sel ? editor(sel) : <p className="text-xs text-slate-500">Click an idea to see what it builds on and to change it. Drag the circles to tidy the map (it doesn’t change the lesson).</p>}
        </MapView>
      )}
    </div>
  );
}

/** The map, over the editor: circles (ideas) joined by arrows (an idea → the ideas that build on it); the selected idea's editor beside it */
function MapView({ ideas, slideOf, slides, colorOf, topics, selected, onSelect, builtOnIds, onClose, children }: {
  ideas: Concept[]; slideOf: Map<string, number>; slides: number; colorOf: (c: Concept) => string; topics: string[];
  selected: string | null; onSelect: (id: string | null) => void; builtOnIds: Set<string>; onClose: () => void; children: React.ReactNode;
}) {
  // (laid out again only when the ideas, their slides or their links change, not on a rename)
  const shape = ideas.map((c) => `${c.id}@${slideOf.get(c.id) ?? -1}<${c.needs.join(',')}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => layout(ideas, slideOf, slides), [shape, slides]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; far: boolean } | null>(null);
  const at = (id: string) => moved[id] ?? base.get(id) ?? { x: W / 2, y: H / 2 };
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const c of ideas) for (const n of c.needs) { d.set(c.id, (d.get(c.id) ?? 0) + 1); d.set(n, (d.get(n) ?? 0) + 1); }
    return d;
  }, [ideas]);
  const r = (id: string) => 9 + Math.min(9, (degree.get(id) ?? 0) * 1.6);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const point = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
  };
  const sel = selected ? ideas.find((c) => c.id === selected) : null;
  const near = new Set<string>(sel ? [sel.id, ...sel.needs, ...ideas.filter((c) => c.needs.includes(sel.id)).map((c) => c.id)] : []);
  const lit = (id: string) => !sel || near.has(id) || builtOnIds.has(id);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="The lesson’s ideas, as a map" onClick={onClose}>
      <div className="w-full max-w-6xl h-[88vh] rounded-2xl bg-white shadow-2xl flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 min-w-0 flex flex-col bg-slate-950">
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-slate-300">
            <span className="font-semibold text-white text-sm">The lesson’s ideas</span>
            <span>{ideas.length} ideas · an arrow points from an idea to one that builds on it · left to right = the order of the slides</span>
          </div>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="flex-1 min-h-0 w-full touch-none select-none" onClick={() => onSelect(null)}
            onPointerMove={(e) => { const d = drag.current; if (!d) return; d.far = true; const p = point(e); setMoved((m) => ({ ...m, [d.id]: p })); }}
            onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
            <defs>
              <marker id="idea-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8" /></marker>
              <marker id="idea-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#22d3ee" /></marker>
            </defs>
            {ideas.flatMap((c) => c.needs.map((n) => {
              const a = at(n), b = at(c.id);
              const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
              const on = !!sel && (c.id === sel.id || n === sel.id || (builtOnIds.has(c.id) && builtOnIds.has(n)) || (c.id === sel.id && builtOnIds.has(n)));
              // (from the edge of one circle to the edge of the other)
              return <line key={`${n}>${c.id}`} x1={a.x + ((b.x - a.x) / d) * r(n)} y1={a.y + ((b.y - a.y) / d) * r(n)} x2={b.x - ((b.x - a.x) / d) * (r(c.id) + 3)} y2={b.y - ((b.y - a.y) / d) * (r(c.id) + 3)}
                stroke={on ? '#22d3ee' : '#64748b'} strokeWidth={on ? 2.2 : 1.2} opacity={!sel || on ? 0.9 : 0.15} markerEnd={`url(#${on ? 'idea-arrow-on' : 'idea-arrow'})`} />;
            }))}
            {ideas.map((c) => {
              const p = at(c.id);
              const on = selected === c.id;
              return (
                <g key={c.id} transform={`translate(${p.x} ${p.y})`} opacity={lit(c.id) ? 1 : 0.25} className="cursor-pointer"
                  onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: c.id, far: false }; }}
                  onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}>
                  <circle r={r(c.id)} fill={colorOf(c)} stroke={on ? '#fff' : '#0f172a'} strokeWidth={on ? 3 : 1.5} />
                  <text y={r(c.id) + 13} textAnchor="middle" fontSize="11.5" fontWeight={on ? 700 : 500} fill={on ? '#fff' : '#cbd5e1'} style={{ pointerEvents: 'none' }}>{c.name.length > 30 ? `${c.name.slice(0, 29)}…` : c.name}</text>
                  <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>{(slideOf.get(c.id) ?? -1) + 1 || ''}</text>
                </g>
              );
            })}
          </svg>
          {topics.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-slate-300">
              {topics.map((t, i) => <span key={t} className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{t}</span>)}
              <span className="text-slate-500">the number in a circle is its slide</span>
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 border-l border-slate-200 p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-slate-900">{sel ? 'This idea' : 'The map'}</span>
            <button className={btn} onClick={onClose}>Close</button>
          </div>
          {children}
        </aside>
      </div>
    </div>
  );
}
