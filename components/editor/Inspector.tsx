'use client';

import type { Slide, SlideElement, TextStyle } from '@/lib/canvas/types';
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
        <h3 className="font-bold text-slate-900">{el.type === 'text' ? 'Text box' : 'Image'}</h3>
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
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={el.src} alt="" className="w-full max-h-36 object-contain rounded-md bg-slate-100" />
          <div>
            <label className={label}>Description</label>
            <textarea rows={3} className={input} value={el.alt ?? ''} placeholder="What the image shows" onChange={(e) => update({ alt: e.target.value })} />
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
            <LaserMarks el={el} update={update} placing={placing ?? null} onPlace={onPlacePointer} />
          </>
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
}: {
  slide: Slide;
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
