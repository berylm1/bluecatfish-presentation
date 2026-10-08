'use client';

import { useState } from 'react';
import type { ActivityElement, ChartElement, DiagramElement, Slide, SlideElement, TextStyle } from '@/lib/canvas/types';
import type { Warning } from '@/lib/canvas/checks';

// Right-hand panel: everything about the selected element, or the slide when
// nothing is selected.

const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1';
const input = 'w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-cyan-500';
const small = 'px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs text-slate-700';

function AiBadge({ show }: { show?: boolean }) {
  return show ? <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-semibold normal-case tracking-normal">AI-written</span> : null;
}

function Num({ value, onChange, min = 0, max = 100 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      step={0.5}
      min={min}
      max={max}
      value={Math.round(value * 100) / 100}
      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }}
      className={input}
    />
  );
}

export function ElementInspector({
  el,
  order,
  update,
  onDelete,
  onDuplicate,
  onLayer,
  warnings,
  placing,
  onPlacePointer,
}: {
  el: SlideElement;
  /** The laser mark being placed (click on the slide to put it), if any */
  placing?: number | null;
  onPlacePointer?: (index: number | null) => void;
  /** 1-based speaking position, or null when silent */
  order: number | null;
  update: (patch: Partial<SlideElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayer: (dir: 1 | -1) => void;
  warnings: Warning[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{el.type === 'text' ? 'Text box' : el.type === 'chart' ? 'Chart' : el.type === 'diagram' ? 'Diagram' : el.type === 'activity' ? 'Hands-on box' : 'Image'}</h3>
        <div className="flex gap-1">
          <button className={small} onClick={onDuplicate} title="Duplicate (Ctrl+D)">Duplicate</button>
          <button className={`${small} text-red-600`} onClick={onDelete} title="Delete (Del)">Delete</button>
        </div>
      </div>

      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">⚠ {w.message}</p>
      ))}

      {el.type === 'text' ? (
        <>
          <div>
            <label className={label} htmlFor="inspector-text">Shown text</label>
            <textarea id="inspector-text" rows={4} className={input} value={el.text} onChange={(e) => update({ text: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Style</label>
              <select className={input} value={el.style} onChange={(e) => update({ style: e.target.value as TextStyle })}>
                <option value="title">Title</option>
                <option value="body">Body</option>
                <option value="caption">Caption</option>
                <option value="bigNumber">Big number</option>
              </select>
            </div>
            <div>
              <label className={label}>Color</label>
              <input type="color" className="w-full h-[34px] rounded-md border border-slate-300" value={el.color ?? '#0f172a'} onChange={(e) => update({ color: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={`${small} ${el.bold ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`} onClick={() => update({ bold: !el.bold || undefined })}><b>B</b></button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`${small} ${(el.align ?? 'left') === a ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`} onClick={() => update({ align: a })}>
                {a === 'left' ? '⯇ Left' : a === 'center' ? 'Center' : 'Right ⯈'}
              </button>
            ))}
          </div>
        </>
      ) : el.type === 'chart' ? (
        <>
          <div>
            <label className={label}>Kind</label>
            <select className={input} value={el.kind ?? 'bar'} onChange={(e) => update({ kind: e.target.value === 'bar' ? undefined : e.target.value as ChartElement['kind'] } as Partial<SlideElement>)}>
              <option value="bar">Bars (how big, how many)</option>
              <option value="line">Line (a change over time; label = when)</option>
              <option value="pie">Pie (parts of a whole)</option>
            </select>
          </div>
          <div>
            <label className={label}>{el.kind === 'line' ? 'Points' : el.kind === 'pie' ? 'Slices' : 'Bars'}</label>
            <div className="flex flex-col gap-1">
              {el.bars.map((b, i) => (
                <div key={i} className="flex gap-1">
                  <input className={input} value={b.label} placeholder="Label"
                    onChange={(e) => update({ bars: el.bars.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input className={`${input} w-24`} type="number" min={0} value={b.value}
                    onChange={(e) => update({ bars: el.bars.map((x, j) => (j === i ? { ...x, value: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                  <button className={`${small} text-red-600`} disabled={el.bars.length <= 1} aria-label={`Remove bar ${i + 1}`}
                    onClick={() => update({ bars: el.bars.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {el.bars.length < 6 && <button className={`${small} self-start`} onClick={() => update({ bars: [...el.bars, { label: 'New', value: 1 }] })}>+ Add a bar</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Unit</label>
              <input className={input} value={el.unit ?? ''} placeholder="lbs, %, years" onChange={(e) => update({ unit: e.target.value || undefined })} />
            </div>
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea rows={2} className={input} value={el.alt ?? ''} placeholder="What the chart shows" onChange={(e) => update({ alt: e.target.value || undefined })} />
          </div>
        </>
      ) : el.type === 'diagram' ? (
        <DiagramFields key={el.id} el={el} update={update} />
      ) : el.type === 'activity' ? (
        <ActivityFields key={el.id} el={el} update={update} placing={placing ?? null} onPlace={onPlacePointer} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={el.src} alt="" className="w-full max-h-36 object-contain rounded-md bg-slate-100" />
          <div>
            <label className={label}>Description</label>
            <textarea rows={3} className={input} value={el.alt ?? ''} placeholder="What the image shows" onChange={(e) => update({ alt: e.target.value })} />
          </div>
          <div>
            <label className={label}>Caption <AiBadge show={el.captionByAI && !el.captionOff} /></label>
            <input
              className={input}
              value={el.caption ?? ''}
              disabled={el.captionOff}
              maxLength={120}
              placeholder={el.captionOff ? 'No caption' : 'Blank: the AI writes one from the description when you save'}
              onChange={(e) => update({ caption: e.target.value || undefined, captionByAI: undefined })}
            />
            <label className="flex items-center gap-2 text-xs text-slate-600 mt-1">
              <input type="checkbox" checked={!!el.captionOff} onChange={(e) => update({ captionOff: e.target.checked || undefined })} />
              No caption on this picture
            </label>
          </div>
          <div>
            <label className={label}>Fit</label>
            <select className={input} value={el.fit ?? 'contain'} onChange={(e) => update({ fit: e.target.value as 'cover' | 'contain' })}>
              <option value="contain">Show the whole image</option>
              <option value="cover">Fill the box (crops edges)</option>
            </select>
          </div>
        </>
      )}

      <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={!!el.silent} onChange={(e) => update({ silent: e.target.checked || undefined })} />
          Silent {el.type === 'image' ? '(decoration: no audio, can sit behind text)' : '(titles, labels)'}
        </label>
        {!el.silent && (
          <>
            <p className="text-xs text-slate-500">
              {order
                ? <>Speaks <b>#{order}</b> on this slide.</>
                : el.type === 'image' && !el.alt?.trim()
                  ? 'Won’t speak yet: give it a description (the AI writes its words from that when you save), or type the words here.'
                  : 'Will speak once its words are written: the AI writes them when you save.'}
            </p>
            <div>
              <label className={label}>Spoken words <AiBadge show={el.sayByAI} /></label>
              <textarea
                rows={5}
                className={input}
                value={el.say ?? ''}
                placeholder={el.type === 'text'
                  ? 'Leave blank: the AI writes this from the knowledge base when you save.'
                  : 'Leave blank: the AI writes this from the description when you save.'}
                onChange={(e) => update({ say: e.target.value || undefined, sayByAI: undefined })}
              />
            </div>
            <div>
              <label className={label}>Plain version (“simpler please”) <AiBadge show={el.plainByAI} /></label>
              <textarea
                rows={3}
                className={input}
                value={el.plain ?? ''}
                placeholder="Leave blank: the AI writes it when you save."
                onChange={(e) => update({ plain: e.target.value || undefined, plainByAI: undefined })}
              />
            </div>
            <div>
              <label className={label}>Queue number</label>
              <input
                type="number"
                min={1}
                className={input}
                value={el.queue ?? ''}
                placeholder="Blank: reading order"
                onChange={(e) => update({ queue: e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value))) })}
              />
            </div>
            {/* (a hands-on box has its own spots to place; a laser on it would make no sense) */}
            {el.type !== 'activity' && <LaserMarks el={el} update={update} placing={placing ?? null} onPlace={onPlacePointer} />}
          </>
        )}
        {el.silent && el.type !== 'activity' && (
          <p className="text-xs text-slate-500">
            🔴 No laser pointer: silent elements don’t speak, so there’s nothing for the dot to follow. Untick Silent to give it words (and laser marks).
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 pt-4">
        <label className={label}>Position and size (% of the slide)</label>
        <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500">
          <span>X</span><span>Y</span><span>Width</span><span>Height</span>
          <Num value={el.x} max={100 - el.w} onChange={(x) => update({ x })} />
          <Num value={el.y} max={100 - el.h} onChange={(y) => update({ y })} />
          <Num value={el.w} min={3} max={100 - el.x} onChange={(w) => update({ w })} />
          <Num value={el.h} min={3} max={100 - el.y} onChange={(h) => update({ h })} />
        </div>
        <div className="flex gap-1 mt-2">
          <button className={small} onClick={() => onLayer(1)}>Bring forward</button>
          <button className={small} onClick={() => onLayer(-1)}>Send backward</button>
        </div>
      </div>
    </div>
  );
}

export function SlideInspector({
  slide,
  update,
  warnings,
  onPickBackground,
  recap,
  recapByAI,
  onRecap,
  topicStart,
}: {
  slide: Slide;
  /** The first slide of its topic: it has the topic's introduction */
  topicStart?: boolean;
  update: (patch: Partial<Slide>) => void;
  warnings: Warning[];
  onPickBackground: () => void;
  /** The whole lesson's end-of-lesson recap */
  recap?: string;
  recapByAI?: boolean;
  onRecap: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-slate-900">Slide</h3>
      <div>
        <label className={label}>Topic <AiBadge show={slide.topicByAI} /></label>
        <input
          className={input}
          value={slide.topic ?? ''}
          placeholder="Blank: the AI names it when you save"
          onChange={(e) => update({ topic: e.target.value || undefined, topicByAI: undefined })}
        />
        <p className="text-xs text-slate-500 mt-1">Only you see this. Slides in a row with the same topic are one topic (“next topic”, “go to”).</p>
      </div>
      {topicStart && (
        <div>
          <label className={label}>Topic introduction <AiBadge show={slide.intro?.sayByAI && !slide.intro?.off} /></label>
          <textarea
            rows={3}
            className={input}
            value={slide.intro?.say ?? ''}
            disabled={slide.intro?.off}
            placeholder={slide.intro?.off ? 'No introduction' : 'Blank: the AI writes one when you save'}
            onChange={(e) => update({ intro: { ...slide.intro, say: e.target.value || undefined, sayByAI: undefined } })}
          />
          <label className="flex items-center gap-2 text-xs text-slate-600 mt-1">
            <input type="checkbox" checked={!!slide.intro?.off} onChange={(e) => update({ intro: { ...slide.intro, off: e.target.checked || undefined } })} />
            No introduction for this topic
          </label>
          <p className="text-xs text-slate-500 mt-1">Said before this slide, with the topic&apos;s name on a small title card.</p>
        </div>
      )}
      <div>
        <label className={label}>Background</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-12 h-[34px] rounded-md border border-slate-300"
            value={slide.background?.color ?? '#ffffff'}
            onChange={(e) => update({ background: { ...slide.background, color: e.target.value } })}
          />
          <button className={small} onClick={onPickBackground}>{slide.background?.image ? 'Change image' : 'Use an image'}</button>
          {slide.background?.image && (
            <button className={small} onClick={() => update({ background: { ...slide.background, image: undefined } })}>Remove image</button>
          )}
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className={label}>Checks</label>
          {warnings.map((w, i) => (
            <p key={i} className={`text-xs rounded-md px-2 py-1.5 border ${w.level === 'warn' ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              {w.level === 'warn' ? '⚠' : 'ℹ'} {w.message}
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Click a box to edit it. Drag to move, pull the corners to resize. Drop images from the Images tab onto the slide.</p>

      {/* Lesson-wide, so it sits apart from the slide's own settings */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="font-bold text-slate-900 mb-2">Lesson</h3>
        <label className={label}>End-of-lesson recap <AiBadge show={recapByAI} /></label>
        <textarea
          rows={5}
          className={input}
          value={recap ?? ''}
          placeholder="Blank: the AI writes it when you publish. What the professor says after the last slide."
          onChange={(e) => onRecap(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">
          {recapByAI ? 'Written by the AI: it is rewritten on each publish until you edit it.' : recap?.trim() ? 'Yours: publishing keeps it as it is.' : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * Laser-pointer marks: when the professor says the phrase, a red dot points
 * at the spot. "Place" then a click on the slide puts the mark there.
 */
function LaserMarks({ el, update, placing, onPlace }: {
  el: SlideElement;
  update: (patch: Partial<SlideElement>) => void;
  placing: number | null;
  onPlace?: (index: number | null) => void;
}) {
  const marks = el.pointers ?? [];
  const spoken = (el.say ?? (el.type === 'text' ? el.text : '')).toLowerCase();
  const set = (next: typeof marks) => update({ pointers: next, pointersByAI: undefined });   // a person's marks: the AI leaves them alone
  return (
    <div>
      <label className={label}>🔴 Laser pointer <AiBadge show={el.pointersByAI} /></label>
      <p className="text-xs text-slate-500 mb-2">When the professor says a phrase, a red dot points at a spot{el.type === 'image' ? ' on the picture' : ''}.</p>
      {!marks.length && (
        <p className="text-xs text-slate-500 mb-2">
          {el.pointers === undefined && el.type === 'image' && /^https:\/\//.test(el.src)
            ? 'No marks yet: when you save, the AI looks at the picture and places up to 3 where they help (sometimes none). Or add your own.'
            : el.pointers === undefined && el.type === 'image'
              ? 'No marks yet, and the AI can’t look at this picture (it isn’t a web address), so add them here if you want the dot.'
              : el.pointers === undefined
                ? 'No marks: the AI only places them on pictures. Add your own to point at part of this box.'
                : 'None: you (or the AI) chose no marks for this one.'}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {marks.map((m, i) => {
          const heard = !m.word.trim() || spoken.includes(m.word.toLowerCase().trim());
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex gap-1 items-center">
                <span className="w-5 h-5 shrink-0 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                <input
                  className={input}
                  value={m.word}
                  placeholder="Phrase from the spoken words"
                  onChange={(e) => set(marks.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)))}
                />
                <button className={`${small} ${placing === i ? 'bg-red-500 text-white hover:bg-red-600' : ''}`} onClick={() => onPlace?.(placing === i ? null : i)}>
                  {placing === i ? 'Click the slide…' : 'Place'}
                </button>
                <button className={`${small} text-red-600`} onClick={() => { onPlace?.(null); set(marks.filter((_, j) => j !== i)); }} aria-label={`Remove mark ${i + 1}`}>✕</button>
              </div>
              {!heard && <p className="text-[11px] text-amber-700 pl-6">The spoken words don’t contain this phrase, so the dot won’t show.</p>}
            </div>
          );
        })}
        {marks.length < 3 && (
          <button className={`${small} self-start`} onClick={() => { set([...marks, { word: '', x: 50, y: 50 }]); onPlace?.(marks.length); }}>
            + Add a mark
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ diagrams and hands-on */

/**
 * A list edited as lines of text ("Label | detail"). It keeps what's typed
 * (half-typed lines included) and hands the parsed list up on every change.
 */
function LinesField({ id, title, hint, initial, rows = 5, onLines }: {
  id: string; title: string; hint: string; initial: string; rows?: number; onLines: (lines: string[][]) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div>
      <label className={label} htmlFor={id}>{title}</label>
      <textarea id={id} rows={rows} className={`${input} font-mono text-xs`} value={text} placeholder={hint}
        onChange={(e) => {
          setText(e.target.value);
          onLines(e.target.value.split('\n').map((l) => l.split(/\s*(?:\||→|->)\s*/).map((c) => c.trim())).filter((c) => c[0]));
        }} />
      <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
    </div>
  );
}
const numOr = (v: string | undefined) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const join = (...cols: (string | number | undefined)[]) => {
  const out = cols.map((c) => (c === undefined ? '' : String(c)));
  while (out.length > 1 && !out[out.length - 1]) out.pop();
  return out.join(' | ');
};

type Update = (patch: Partial<SlideElement>) => void;

function DiagramFields({ el, update }: { el: DiagramElement; update: Update }) {
  const set = (patch: Partial<DiagramElement>) => update(patch as Partial<SlideElement>);
  return (
    <>
      <div>
        <label className={label}>Kind</label>
        <select className={input} value={el.kind} onChange={(e) => set({ kind: e.target.value as DiagramElement['kind'] })}>
          <option value="steps">Steps (boxes joined by arrows)</option>
          <option value="cycle">Cycle (round a circle)</option>
          <option value="timeline">Timeline (label = when)</option>
          <option value="compare">Compare (two columns)</option>
          <option value="sizes">Sizes (circles by value)</option>
        </select>
      </div>
      {el.kind === 'compare' && (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => (
            <input key={i} className={input} placeholder={i ? 'Right header' : 'Left header'} value={el.columns?.[i] ?? ''}
              onChange={(e) => { const c: [string, string] = [el.columns?.[0] ?? '', el.columns?.[1] ?? '']; c[i] = e.target.value; set({ columns: c[0] || c[1] ? c : undefined }); }} />
          ))}
        </div>
      )}
      <LinesField id="diagram-items" title="Items (one per line, up to 8)"
        hint={el.kind === 'compare' ? 'Left | Right' : el.kind === 'sizes' ? 'Label | value | note' : el.kind === 'timeline' ? 'When | What happened' : 'Label | detail'}
        initial={el.items.map((i) => (el.kind === 'sizes' ? join(i.label, i.value, i.detail) : join(i.label, i.detail))).join('\n')}
        onLines={(lines) => set({
          items: lines.slice(0, 8).map((c) => (el.kind === 'sizes'
            ? { label: c[0], value: numOr(c[1]) ?? 1, detail: c[2] || undefined }
            : { label: c[0], detail: c[1] || undefined })),
        })} />
      {el.kind === 'sizes' && (
        <div>
          <label className={label}>Unit</label>
          <input className={input} value={el.unit ?? ''} placeholder="lbs, feet" onChange={(e) => set({ unit: e.target.value || undefined })} />
        </div>
      )}
      <div>
        <label className={label}>Description</label>
        <textarea rows={2} className={input} value={el.alt ?? ''} placeholder="Blank: made from the items" onChange={(e) => set({ alt: e.target.value || undefined })} />
      </div>
    </>
  );
}

/**
 * The explore box's spots: a name, what the learner finds out, and where it is.
 * "Place" then a click on the picture puts it there (like a laser mark).
 * (was: typed as "Name | fact | x | y" lines)
 */
function SpotRows({ el, set, placing, onPlace }: {
  el: ActivityElement; set: (patch: Partial<ActivityElement>) => void; placing: number | null; onPlace?: (index: number | null) => void;
}) {
  const items = el.items ?? [];
  const change = (i: number, patch: Partial<NonNullable<ActivityElement['items']>[number]>) => set({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <div>
      <label className={label}>Spots (up to 8)</label>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-1 border border-slate-200 rounded-md p-1.5">
            <div className="flex gap-1 items-center">
              <span className="w-5 h-5 shrink-0 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
              <input className={input} value={it.text} placeholder="Name (Whiskers)" onChange={(e) => change(i, { text: e.target.value })} />
              <button className={`${small} ${placing === i ? 'bg-orange-500 text-white hover:bg-orange-600' : ''}`} onClick={() => onPlace?.(placing === i ? null : i)}>
                {placing === i ? 'Click the picture…' : 'Place'}
              </button>
              <button className={`${small} text-red-600`} aria-label={`Remove spot ${i + 1}`}
                onClick={() => { onPlace?.(null); set({ items: items.filter((_, j) => j !== i) }); }}>✕</button>
            </div>
            <input className={input} value={it.back ?? ''} placeholder="What they find out (They taste the water)" onChange={(e) => change(i, { back: e.target.value || undefined })} />
          </div>
        ))}
        {items.length < 8 && (
          <button className={`${small} self-start`} onClick={() => { set({ items: [...items, { text: 'New spot', x: 50, y: 50 }] }); onPlace?.(items.length); }}>
            + Add a spot
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityFields({ el, update, placing = null, onPlace }: { el: ActivityElement; update: Update; placing?: number | null; onPlace?: (index: number | null) => void }) {
  const set = (patch: Partial<ActivityElement>) => update(patch as Partial<SlideElement>);
  const items = el.items ?? [];
  return (
    <>
      <p className="text-xs text-slate-600 bg-cyan-50 border border-cyan-200 rounded-md px-2 py-1.5">
        🖐 A hands-on box. In the lesson the professor says its spoken words (what to do), then waits until the learner has done it
        (a pointing hand shows how). It should use what this slide teaches.
      </p>
      <div>
        <label className={label}>Kind</label>
        <select className={input} value={el.kind} onChange={(e) => set({ kind: e.target.value as ActivityElement['kind'] })}>
          <option value="sort">Sort: drag each item into its group</option>
          <option value="order">Order: tap the steps in the right order</option>
          <option value="cards">Cards: guess, then flip to check</option>
          <option value="hotspots">Explore: tap spots on a picture</option>
          <option value="slider">Slider: move it and watch what changes</option>
        </select>
      </div>
      <div>
        <label className={label}>Instruction shown on the box</label>
        <input className={input} value={el.prompt ?? ''} placeholder="Drag each fish to where it came from" onChange={(e) => set({ prompt: e.target.value || undefined })} />
      </div>
      {el.kind === 'sort' && (
        <>
          <LinesField id="act-groups" title="Groups (2 to 4, one per line)" hint="One group name per line" rows={3}
            initial={(el.groups ?? []).join('\n')} onLines={(l) => set({ groups: l.slice(0, 4).map((c) => c[0]) })} />
          <LinesField id="act-items" title="Items (up to 8)" hint="Item → Group name (or the group's number, from 1)"
            initial={items.map((i) => `${i.text} → ${el.groups?.[i.group ?? 0] ?? ''}`).join('\n')}
            onLines={(l) => set({ items: l.slice(0, 8).map((c) => {
              const byName = (el.groups ?? []).findIndex((g) => g.toLowerCase() === (c[1] ?? '').toLowerCase());
              const n = numOr(c[1]);
              return { text: c[0], group: byName >= 0 ? byName : n !== undefined ? Math.max(0, n - 1) : 0 };
            }) })} />
        </>
      )}
      {el.kind === 'order' && (
        <LinesField id="act-steps" title="Steps, in the RIGHT order (they're shuffled for the learner)" hint="One step per line, first to last"
          initial={items.map((i) => i.text).join('\n')} onLines={(l) => set({ items: l.slice(0, 8).map((c) => ({ text: c[0] })) })} />
      )}
      {el.kind === 'cards' && (
        <LinesField id="act-cards" title="Cards (up to 8)" hint="Front (the question or guess) | Back (the answer)"
          initial={items.map((i) => join(i.text, i.back)).join('\n')} onLines={(l) => set({ items: l.slice(0, 8).map((c) => ({ text: c[0], back: c[1] || undefined })) })} />
      )}
      {el.kind === 'hotspots' && (
        <>
          <div>
            <label className={label}>Picture address</label>
            <input className={input} value={el.src ?? ''} placeholder="https://… or /canvas-sample/catfish.svg" onChange={(e) => set({ src: e.target.value || undefined })} />
          </div>
          <SpotRows el={el} set={set} placing={placing} onPlace={onPlace} />
        </>
      )}
      {el.kind === 'slider' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="Label (Age)" value={el.slider?.label ?? ''} onChange={(e) => set({ slider: { ...sliderOf(el), label: e.target.value } })} />
            <input className={input} placeholder="Unit (years)" value={el.slider?.unit ?? ''} onChange={(e) => set({ slider: { ...sliderOf(el), unit: e.target.value || undefined } })} />
            <input className={input} type="number" placeholder="From" value={el.slider?.min ?? 0} onChange={(e) => set({ slider: { ...sliderOf(el), min: Number(e.target.value) || 0 } })} />
            <input className={input} type="number" placeholder="To" value={el.slider?.max ?? 10} onChange={(e) => set({ slider: { ...sliderOf(el), max: Number(e.target.value) || 0 } })} />
          </div>
          <div>
            <label className={label}>Picture address (optional: it grows with the scale)</label>
            <input className={input} value={el.src ?? ''} placeholder="https://… or /canvas-sample/catfish.svg" onChange={(e) => set({ src: e.target.value || undefined })} />
          </div>
          <LinesField id="act-stops" title="Stops (2 to 8): what shows from each value up" hint="At value | what it says | picture scale (0.1 to 3, optional)"
            initial={(el.slider?.stops ?? []).map((st) => join(st.at, st.text, st.scale)).join('\n')}
            onLines={(l) => set({ slider: { ...sliderOf(el), stops: l.slice(0, 8).map((c) => ({ at: numOr(c[0]) ?? 0, text: c[1] ?? '', scale: numOr(c[2]) })).filter((st) => st.text).sort((a, b) => a.at - b.at) } })} />
        </>
      )}
    </>
  );
}
const sliderOf = (el: ActivityElement): NonNullable<ActivityElement['slider']> => el.slider ?? { label: '', min: 0, max: 10, stops: [] };
