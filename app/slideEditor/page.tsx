'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EditCanvas from '@/components/editor/EditCanvas';
import SlideList from '@/components/editor/SlideList';
import { SlideStatsPanel } from '@/components/editor/LearnerStats';
import type { SlideStats } from '@/lib/canvas/slideStats';
import ImageLibrary from '@/components/editor/ImageLibrary';
import { ElementInspector, SlideInspector } from '@/components/editor/Inspector';
import { useEditorDeck, blankDeck, blankSlide, cloneSlide, newId, elementsOf, helperView } from '@/components/editor/useEditorDeck';
import SlideCanvas from '@/components/canvas/SlideCanvas';
import { slideWarnings, type Warning } from '@/lib/canvas/checks';
import { speakingOrder } from '@/lib/canvas/queue';
import { deckFromAnyVersion } from '@/lib/canvas/fromLegacy';
import { countTodo, todoTotal } from '@/lib/canvas/aiFields';
import { DEFAULT_LESSON, type LessonInfo } from '@/lib/canvas/lessons';
import type { Deck, SlideElement } from '@/lib/canvas/types';

/*
 * Slide editor (docs/customization-plan.md, step 3). Password-protected by the
 * middleware. Save writes the draft; Preview plays the saved draft; Publish
 * makes the draft the live deck that /presentation plays.
 */

type LiveInfo = { at?: string; by?: string; basedOn?: string } | null;
type AiDeckInfo = { at?: string; slides: number; topics: number } | null;
type Version = { key: string; label: string; slides: number; current: boolean };

const btn = 'px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-40';
const primary = 'px-3 py-1.5 rounded-md text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-40';

const TAG_TONES = {
  cyan: 'bg-cyan-100 text-cyan-800',
  slate: 'bg-slate-100 text-slate-700',
  emerald: 'bg-emerald-100 text-emerald-800',
  violet: 'bg-violet-100 text-violet-800',
};
function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-normal ${TAG_TONES[tone]}`}>{children}</span>;
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export default function SlideEditorPage() {
  const [lessons, setLessons] = useState<LessonInfo[]>([DEFAULT_LESSON]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ deck: Deck; savedAt?: string; savedBy?: string; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);   // bumped to load the saved draft again

  useEffect(() => {
    fetch('/api/editor/lessons').then((r) => r.json()).then((d) => d.lessons && setLessons(d.lessons)).catch(() => {});
    setLessonId(new URLSearchParams(window.location.search).get('lesson') || DEFAULT_LESSON.id);
  }, []);

  // Load the lesson's saved draft (or start a blank one)
  useEffect(() => {
    if (!lessonId) return;
    setInitial(null);
    setError(null);
    const title = lessons.find((l) => l.id === lessonId)?.title ?? lessonId;
    fetch(`/api/editor/deck?lesson=${encodeURIComponent(lessonId)}&kind=draft`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setInitial({ deck: d.deck ?? blankDeck(lessonId, title), savedAt: d.deck?.updatedAt, savedBy: d.deck?.updatedBy, key: Date.now() });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, reloadKey]);

  const switchLesson = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('lesson', id);
    window.history.replaceState(null, '', url);
    setLessonId(id);
  };

  const newLesson = async () => {
    const title = window.prompt('Name of the new lesson?');
    if (!title?.trim()) return;
    const d = await fetch('/api/editor/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => r.json());
    if (d.error) return alert(d.error);
    setLessons((l) => [...l, d.lesson]);
    switchLesson(d.lesson.id);
  };

  /** Returns an error message, or null once deleted (then opens the main lesson). */
  const deleteLesson = async (id: string): Promise<string | null> => {
    const d = await fetch('/api/editor/lessons', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then((r) => r.json()).catch(() => ({ error: 'Could not reach the server' }));
    if (d.error) return d.error;
    setLessons((l) => l.filter((x) => x.id !== id));
    switchLesson(DEFAULT_LESSON.id);
    return null;
  };

  if (error) return <div className="p-10 text-red-700">Could not open the editor: {error}</div>;
  if (!initial || !lessonId) return <div className="p-10 text-slate-600">Opening the editor…</div>;
  return (
    <Editor
      key={initial.key}
      lessonId={lessonId}
      lessons={lessons}
      initial={initial.deck}
      savedAt={initial.savedAt}
      savedBy={initial.savedBy}
      onSwitchLesson={switchLesson}
      onNewLesson={newLesson}
      onDeleteLesson={deleteLesson}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  );
}

function Editor({
  lessonId, lessons, initial, savedAt: initialSavedAt, savedBy: initialSavedBy, onSwitchLesson, onNewLesson, onDeleteLesson, onReload,
}: {
  onDeleteLesson: (id: string) => Promise<string | null>;
  onReload: () => void;
  lessonId: string;
  lessons: LessonInfo[];
  initial: Deck;
  savedAt?: string;
  savedBy?: string;
  onSwitchLesson: (id: string) => void;
  onNewLesson: () => void;
}) {
  const ed = useEditorDeck(initial);
  // The saved draft this editor started from (or last saved). If someone else
  // saves in between, saving or publishing asks before overwriting.
  const baseRev = useRef<string | undefined>(initial.editRev);
  const [conflict, setConflict] = useState<{ by: string; at: string | null; then: 'save' | 'publish' } | null>(null);
  const { deck, slide, slideIdx, element } = ed;
  const [panel, setPanel] = useState<'props' | 'images' | 'background'>('props');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ at?: string; by?: string }>({ at: initialSavedAt, by: initialSavedBy });
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [live, setLive] = useState<LiveInfo | undefined>(undefined);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ busy: boolean; error?: string } | null>(null);
  const versionsOpen = useRef(false);
  versionsOpen.current = versions !== null || confirmDelete !== null || conflict !== null;
  const [overflow, setOverflow] = useState<Record<string, string[]>>({});
  // 📊 Learners: how each slide went for learners (a heatmap on the slide list)
  const HEAT_DAYS = 30;
  const [heat, setHeat] = useState<Record<string, SlideStats> | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const toggleHeat = async () => {
    if (heat) { setHeat(null); return; }
    setHeatLoading(true);
    try {
      const res = await fetch(`/api/editor/slide-stats?lesson=${encodeURIComponent(lessonId)}&days=${HEAT_DAYS}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Couldn't load learner data (${res.status})`);
      setHeat(d.slides ?? {});
      const n = Object.values(d.slides ?? {}).reduce((m: number, s) => Math.max(m, (s as SlideStats).learners), 0);
      if (!n) setNotice({ text: `No learner data for this lesson in the last ${HEAT_DAYS} days yet.`, tone: 'warn' });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setHeatLoading(false);
    }
  };

  const flash = useCallback((text: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    setNotice({ text, tone });
    if (tone === 'ok') setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3000);
  }, []);

  const loadLive = useCallback(() => {
    fetch(`/api/editor/deck?lesson=${encodeURIComponent(lessonId)}&kind=live`)
      .then((r) => r.json())
      .then((d) => setLive(d.deck ? { at: d.deck.updatedAt, by: d.deck.updatedBy, basedOn: d.deck.basedOn } : null))
      .catch(() => setLive(null));
  }, [lessonId]);
  useEffect(loadLive, [loadLive]);

  // "Text doesn't fit" comes from the rendered page: FitText marks boxes that
  // still overflow at the smallest size it will shrink to
  useEffect(() => {
    const t = setTimeout(() => {
      const found: Record<string, string[]> = {};
      document.querySelectorAll('[data-fit-overflow]').forEach((node) => {
        const slideId = node.closest('[data-slide-id]')?.getAttribute('data-slide-id');
        const elId = node.closest('[data-element-id]')?.getAttribute('data-element-id');
        if (slideId && elId) (found[slideId] ??= []).includes(elId) || found[slideId].push(elId);
      });
      setOverflow(found);
    }, 400);
    return () => clearTimeout(t);
  }, [deck]);

  const warningsFor = useCallback((i: number): Warning[] => {
    const s = deck.slides[i];
    const fit = (overflow[s.id] ?? []).map((id) => ({ elementId: id, level: 'warn' as const, message: 'Text doesn’t fit its box, even at the smallest size: make the box bigger or the text shorter' }));
    return [...fit, ...slideWarnings(s)];
  }, [deck, overflow]);
  const allWarnings = useMemo(() => deck.slides.map((_, i) => warningsFor(i)), [deck, warningsFor]);
  // On the helper layer: the helper's own checks (overlaps, text that doesn't fit, ...)
  const slideWarns = useMemo(() => ed.layer === 'helper'
    ? [...(overflow[slide.id] ?? []).map((id) => ({ elementId: id, level: 'warn' as const, message: 'Text doesn’t fit its box, even at the smallest size: make the box bigger or the text shorter' })), ...slideWarnings(slide)]
    : allWarnings[slideIdx] ?? [], [ed.layer, overflow, slide, allWarnings, slideIdx]);
  const warnIds = useMemo(() => new Set(slideWarns.filter((w) => w.level === 'warn' && w.elementId).map((w) => w.elementId!)), [slideWarns]);
  const order = useMemo(() => speakingOrder(slide), [slide]);

  /* ------------------------------------------------------------ saving */

  const save = useCallback(async (opts: { force?: boolean; then?: 'save' | 'publish' } = {}): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch('/api/editor/deck', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: lessonId, deck, baseRev: baseRev.current ?? null, force: !!opts.force }),
      });
      const d = await res.json();
      if (res.status === 409) {   // someone else saved since this editor loaded
        setConflict({ ...d.conflict, then: opts.then ?? 'save' });
        return false;
      }
      if (res.status === 401) throw new Error('You were locked out: unlock again in a new tab, then press Save.');
      if (!res.ok || d.error) throw new Error(d.error || `Save failed (${res.status})`);
      ed.setDirty(false);
      baseRev.current = d.editRev;
      setSaved({ at: d.savedAt, by: d.by });
      if (d.warning) flash(`Saved, but: ${d.warning}`, 'warn');
      else flash('Saved');
      runAi();   // fill in blanks and make audio for what changed, in the background
      return true;
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), 'error');
      return false;
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, lessonId, ed, flash]);

  /* ----------------------------------------------------- save-time AI */

  // Runs /api/editor/prepare until nothing is left (each call works ~40s).
  // A save while it runs just queues one more pass.
  const [ai, setAi] = useState<{ running: boolean; remaining: number; errors: string[] }>({ running: false, remaining: 0, errors: [] });
  const aiRun = useRef<Promise<void> | null>(null);
  const aiAgain = useRef(false);
  const todoHere = useMemo(() => todoTotal(countTodo(deck)), [deck]);

  const runAi = useCallback((): Promise<void> => {
    if (aiRun.current) { aiAgain.current = true; return aiRun.current; }
    const run = (async () => {
      setAi((a) => ({ ...a, running: true, errors: [] }));
      let errors: string[] = [];
      try {
        do {
          aiAgain.current = false;
          for (let pass = 0; pass < 30; pass++) {
            const res = await fetch('/api/editor/prepare', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lesson: lessonId }),
            });
            const d = await res.json().catch(() => ({ error: `The AI step failed (${res.status})` }));
            if (d.error) { errors = [d.error]; break; }
            ed.applyRemote(d.patches ?? []);
            errors = d.errors ?? [];
            setAi({ running: true, remaining: d.remaining ?? 0, errors });
            if (!d.remaining || !d.patches?.length) break;   // done, or stuck (errors say why)
          }
        } while (aiAgain.current);
      } finally {
        setAi((a) => ({ ...a, running: false, errors }));
        aiRun.current = null;
      }
    })();
    aiRun.current = run;
    return run;
  }, [lessonId, ed]);

  const preview = async () => {
    if (ed.dirty && !(await save())) return;
    window.open(`/presentation?lesson=${encodeURIComponent(lessonId)}&preview=1`, '_blank');
  };

  const publish = async () => {
    const count = allWarnings.flat().filter((w) => w.level === 'warn').length;
    const ask = count
      ? `There ${count === 1 ? 'is 1 warning' : `are ${count} warnings`} (slides marked ⚠). Publish anyway? Learners will see this deck.`
      : 'Publish? Learners will see this deck instead of the AI lesson.';
    if (!window.confirm(ask)) return;
    await publishNow();
  };

  /** Publish without asking (after the confirm, or after "Keep mine" in a conflict). */
  const publishNow = async (force = false) => {
    if ((ed.dirty || force) && !(await save({ force, then: 'publish' }))) return;
    // Learners should get finished words and audio: let the AI finish first
    if (todoHere > 0 || aiRun.current) {
      flash('Finishing the spoken words and audio before publishing…', 'warn');
      await runAi();
    }
    const d = await fetch('/api/editor/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson: lessonId, baseRev: baseRev.current ?? null }),
    }).then((r) => r.json());
    if (d.conflict) return setConflict({ ...d.conflict, then: 'publish' });
    if (d.error) return flash(d.error, 'error');
    // The recap the server wrote (or kept), so saving later doesn't lose it
    ed.mergeRemote((deck) => { deck.recap = d.recap ?? undefined; deck.recapByAI = d.recapByAI || undefined; });
    flash(d.warning ? `Published, but: ${d.warning}` : 'Published: /presentation now plays this deck', d.warning ? 'warn' : 'ok');
    loadLive();
  };

  const unpublish = async () => {
    if (!window.confirm('Take the live deck down? Learners will get the AI lesson again. Your draft stays.')) return;
    const d = await fetch('/api/editor/publish', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson: lessonId }),
    }).then((r) => r.json());
    if (d.error) return flash(d.error, 'error');
    flash('Taken down: learners get the AI lesson');
    loadLive();
  };

  /* ---------------------------------------------------- start from AI */

  // The AI deck (step 5): made in the canvas format, played when nothing is published
  const [aiDeck, setAiDeck] = useState<AiDeckInfo | undefined>(undefined);
  const [aiGen, setAiGen] = useState<{ phase: 'writing' | 'audio'; remaining?: number } | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);

  const loadAiDeck = useCallback(() => {
    fetch(`/api/editor/ai-deck?lesson=${encodeURIComponent(lessonId)}`)
      .then((r) => r.json())
      .then((d) => setAiDeck(d.ai ?? null))
      .catch(() => setAiDeck(null));
  }, [lessonId]);

  const openVersions = async () => {
    setVersions([]);
    loadAiDeck();
    const d = await fetch('/api/editor/ai-versions').then((r) => r.json()).catch(() => ({}));
    setVersions(d.versions ?? []);
  };

  const generateAi = async () => {
    const replaces = aiDeck ? ' It replaces the current AI deck.' : '';
    const who = live ? '' : ' Learners get it straight away, since nothing is published.';
    if (!window.confirm(`Make a new AI deck for this lesson? It takes a few minutes, then a few more for the audio.${replaces}${who} Your draft isn’t touched.`)) return;
    setAiGen({ phase: 'writing' });
    setAiNotes([]);
    try {
      const d = await fetch('/api/editor/ai-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: lessonId }),
      }).then((r) => r.json()).catch(() => ({ error: 'The request timed out or failed' }));
      if (d.error) throw new Error(d.error);
      setAiNotes(d.notes ?? []);
      loadAiDeck();
      // Audio for the new deck: the same save-time AI step, on the AI deck
      setAiGen({ phase: 'audio' });
      for (let pass = 0; pass < 30; pass++) {
        const p = await fetch('/api/editor/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lesson: lessonId, kind: 'ai' }),
        }).then((r) => r.json()).catch(() => ({ error: 'The audio step failed' }));
        if (p.error) throw new Error(p.error);
        setAiGen({ phase: 'audio', remaining: p.remaining });
        if (p.errors?.length) setAiNotes((n) => [...n, ...p.errors]);
        if (!p.remaining || !p.patches?.length) break;
      }
      flash(`AI deck ready: ${d.slides} slides (${d.seconds}s).`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setAiGen(null);
      loadAiDeck();
    }
  };

  const copyAiDeck = async () => {
    if (!window.confirm('Replace this draft’s slides with the AI deck? You can undo with Ctrl+Z until you save.')) return;
    const d = await fetch(`/api/editor/deck?lesson=${encodeURIComponent(lessonId)}&kind=ai`).then((r) => r.json());
    if (!d.deck?.slides?.length) return flash('There is no AI deck yet', 'warn');
    ed.change((draft) => {
      draft.slides = d.deck.slides;
      draft.recap = d.deck.recap;
      draft.recapByAI = d.deck.recapByAI;
      draft.basedOn = `canvas_ai:${d.deck.updatedAt ?? ''}`;
    });
    ed.setSlideIdx(0);
    ed.setSelected(null);
    setVersions(null);
    flash(`Copied ${d.deck.slides.length} slides from the AI deck. Press Save to keep them.`);
  };

  const applyVersion = async (v: Version) => {
    if (!window.confirm(`Replace this draft with “${v.label}” (${v.slides} slides)? You can undo with Ctrl+Z until you save.`)) return;
    try {
      const d = await fetch(`/api/editor/ai-versions?key=${encodeURIComponent(v.key)}`).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      const converted = deckFromAnyVersion(d.data, lessonId, deck.title);
      ed.change((draft) => { draft.slides = converted.slides; draft.recap = converted.recap; draft.basedOn = v.key; });
      ed.setSlideIdx(0);
      ed.setSelected(null);
      setVersions(null);
      flash(`Copied ${converted.slides.length} slides from ${v.label}. Press Save to keep them.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  /* ------------------------------------------------------ slide edits */

  const addSlide = () => {
    ed.change((d) => { d.slides.splice(slideIdx + 1, 0, blankSlide(slide?.topic)); });
    ed.setSlideIdx(slideIdx + 1);
    ed.setSelected(null);
  };
  const duplicateSlide = () => {
    ed.change((d) => { d.slides.splice(slideIdx + 1, 0, cloneSlide(d.slides[slideIdx])); });
    ed.setSlideIdx(slideIdx + 1);
  };
  const deleteSlide = () => {
    if (deck.slides.length <= 1 || !window.confirm(`Delete slide ${slideIdx + 1}?`)) return;
    ed.change((d) => { d.slides.splice(slideIdx, 1); });
    ed.setSlideIdx(Math.max(0, slideIdx - 1));
    ed.setSelected(null);
  };
  const moveSlide = (from: number, to: number) => {
    ed.change((d) => { const [s] = d.slides.splice(from, 1); d.slides.splice(to, 0, s); });
    ed.setSlideIdx(to);
  };

  const addElement = (el: SlideElement) => {
    ed.change((d) => { elementsOf(d.slides[slideIdx], ed.layer).push(el); });
    ed.setSelected(el.id);
    setPanel('props');
  };
  const addText = () => addElement({ id: newId('el'), type: 'text', x: 30, y: 40, w: 40, h: 16, text: 'New text', style: 'body', color: '#0f172a' });
  const addImage = (img: { url: string; description: string }, cx = 50, cy = 50) => {
    const w = 30, h = 36;
    addElement({
      id: newId('el'), type: 'image', src: img.url, alt: img.description || undefined, fit: 'contain',
      w, h, x: Math.min(100 - w, Math.max(0, cx - w / 2)), y: Math.min(100 - h, Math.max(0, cy - h / 2)),
    });
  };

  const deleteElement = useCallback(() => {
    if (!ed.selected) return;
    const id = ed.selected;
    ed.change((d) => {
      const s = d.slides[slideIdx];
      if (ed.layer === 'helper') { const h = elementsOf(s, 'helper'); h.splice(h.findIndex((e) => e.id === id), 1); }
      else s.elements = s.elements.filter((e) => e.id !== id);
    });
    ed.setSelected(null);
  }, [ed, slideIdx]);

  /* ------------------------------------------------------- the helper */
  // The helper is what the slide morphs into when a learner is lost. A helper
  // element with the same id as a slide element morphs from it.
  const main = ed.mainSlide;
  const helperState = !main?.helper?.elements.length ? (main?.helper?.off ? 'off' : 'none') : main.helper.byAI ? 'ai' : 'yours';
  const switchLayer = (l: 'main' | 'helper') => { ed.setLayer(l); ed.setSelected(null); };
  const copyIntoHelper = () => ed.change((d) => {
    const s = d.slides[slideIdx];
    const h = elementsOf(s, 'helper');
    h.splice(0, h.length, ...structuredClone(s.elements));   // same ids: every box morphs from itself
  });
  const aiHelper = () => ed.change((d) => { d.slides[slideIdx].helper = undefined; });   // the AI drafts it on the next save
  const noHelper = () => ed.change((d) => { d.slides[slideIdx].helper = { elements: [], off: true }; });
  const [morphPreview, setMorphPreview] = useState<boolean | null>(null);   // null = closed; true = showing the helper
  useEffect(() => {
    if (morphPreview === null) return;
    const t = setTimeout(() => setMorphPreview((v) => (v === null ? null : !v)), 2600);
    return () => clearTimeout(t);
  }, [morphPreview]);

  const duplicateElement = useCallback(() => {
    if (!element) return;
    const copy = { ...structuredClone(element), id: newId('el'), x: Math.min(100 - element.w, element.x + 2), y: Math.min(100 - element.h, element.y + 2) };
    addElement(copy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);

  const layer = (dir: 1 | -1) => {
    if (!element) return;
    ed.updateElement(element.id, { z: (element.z ?? (element.type === 'image' && element.silent ? 0 : 1)) + dir });
  };

  /* -------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (versionsOpen.current) {   // a popup is open: only Escape, to close it
        if (e.key === 'Escape') { setVersions(null); setConfirmDelete(null); }
        return;
      }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateElement(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selected) { e.preventDefault(); deleteElement(); return; }
      if (e.key === 'Escape') { ed.setSelected(null); return; }
      if (element && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        ed.updateElement(element.id, {
          x: Math.min(100 - element.w, Math.max(0, element.x + dx)),
          y: Math.min(100 - element.h, Math.max(0, element.y + dy)),
        }, `nudge:${element.id}`);
      } else if (!element && (e.key === 'PageDown' || e.key === 'PageUp')) {
        ed.setSlideIdx((i) => Math.max(0, Math.min(deck.slides.length - 1, i + (e.key === 'PageDown' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed, element, save, deleteElement, duplicateElement, deck.slides.length]);

  // Don't lose unsaved work by closing the tab
  useEffect(() => {
    if (!ed.dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [ed.dirty]);

  const confirmSwitch = (id: string) => {
    if (ed.dirty && !window.confirm('You have unsaved changes. Switch lessons and lose them?')) return;
    onSwitchLesson(id);
  };

  /* ------------------------------------------------------------ view */

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] bg-slate-100 text-slate-900">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <select className="px-2 py-1.5 rounded-md border border-slate-300 text-sm" value={lessonId} onChange={(e) => (e.target.value === '__new' ? onNewLesson() : confirmSwitch(e.target.value))}>
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          <option value="__new">+ New lesson…</option>
        </select>
        {lessonId !== DEFAULT_LESSON.id && (
          <button className={`${btn} text-red-600`} onClick={() => setConfirmDelete({ busy: false })} title="Delete this lesson">Delete lesson</button>
        )}
        <span className="text-xs text-slate-500 min-w-40">
          {saving ? 'Saving…' : ed.dirty ? <span className="text-amber-700 font-medium">Unsaved changes</span> : saved.at ? `Saved ${when(saved.at)}${saved.by ? ` by ${saved.by}` : ''}` : 'Not saved yet'}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded-md ${ai.running ? 'bg-violet-100 text-violet-800' : ai.errors.length ? 'bg-red-100 text-red-800' : todoHere ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}
          title={ai.errors.join('\n') || 'Spoken words, plain versions, topics and audio the AI fills in when you save'}
        >
          {ai.running
            ? `✨ AI writing & recording… ${ai.remaining ? `${ai.remaining} left` : ''}`
            : ai.errors.length
              ? `⚠ AI step had problems (hover)`
              : todoHere
                ? `${todoHere} to write/record: Save to start`
                : '✓ Words & audio ready'}
        </span>
        <div className="w-px h-6 bg-slate-200" />
        <button className={btn} onClick={ed.undo} disabled={!ed.canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button className={btn} onClick={ed.redo} disabled={!ed.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        <button className={btn} onClick={addText}>＋ Text</button>
        <button className={btn} onClick={() => setPanel('images')}>＋ Image</button>
        <button className={btn} onClick={openVersions}>Start from AI…</button>
        <button
          className={`${btn} ${heat ? 'bg-cyan-50 border-cyan-500' : ''}`}
          onClick={toggleHeat}
          disabled={heatLoading}
          title="How each slide went for learners: puzzled faces, “I’m lost”, simpler please… (last 30 days)"
        >
          {heatLoading ? 'Loading…' : '📊 Learners'}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">
          {live === undefined ? '' : live ? <>Live: published {when(live.at)}{live.by ? ` by ${live.by}` : ''} · <button className="underline" onClick={unpublish}>take down</button></> : 'Not published: learners get the AI lesson'}
        </span>
        <button className={btn} onClick={() => save()} disabled={saving} title="Ctrl+S">Save</button>
        <button className={btn} onClick={preview}>Preview ↗</button>
        <button className={primary} onClick={publish}>Publish</button>
      </div>

      {notice && (
        <div className={`px-4 py-1.5 text-sm flex justify-between ${notice.tone === 'error' ? 'bg-red-100 text-red-800' : notice.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* slides */}
        <aside className="w-52 shrink-0 p-2 border-r border-slate-200 bg-slate-50 min-h-0">
          <SlideList
            slides={deck.slides}
            current={slideIdx}
            warnCounts={allWarnings.map((w) => w.filter((x) => x.level === 'warn').length)}
            heat={heat ?? undefined}
            onOpen={(i) => { ed.setSlideIdx(i); ed.setSelected(null); }}
            onMove={moveSlide}
            onAdd={addSlide}
            onDuplicate={duplicateSlide}
            onDelete={deleteSlide}
          />
        </aside>

        {/* canvas */}
        <main className="flex-1 min-w-0 flex flex-col items-center justify-center p-4 gap-2" onPointerDown={() => ed.setSelected(null)}>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500" onPointerDown={(e) => e.stopPropagation()}>
            <span>Slide {slideIdx + 1} of {deck.slides.length}{main?.topic ? ` · ${main.topic}` : ''}</span>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden" role="tablist" aria-label="Which version">
              <button role="tab" aria-selected={ed.layer === 'main'} onClick={() => switchLayer('main')}
                className={`px-3 py-1 ${ed.layer === 'main' ? 'bg-cyan-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-700'}`}>Main slide</button>
              <button role="tab" aria-selected={ed.layer === 'helper'} onClick={() => switchLayer('helper')}
                className={`px-3 py-1 border-l border-slate-300 ${ed.layer === 'helper' ? 'bg-violet-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-700'}`}
                title="What this slide morphs into when a learner says they're lost">
                Helper (when lost){helperState === 'ai' ? ' ✨' : helperState === 'none' ? ' ·' : helperState === 'off' ? ' ✕' : ''}
              </button>
            </div>
            {ed.layer === 'helper' && helperState !== 'none' && helperState !== 'off' && (
              <>
                <button className="underline" onClick={() => setMorphPreview(true)}>▶ Preview the morph</button>
                <button className="underline" onClick={aiHelper} title="Throw this helper away; the AI drafts a new one when you save">Redo with AI</button>
                <button className="underline text-red-600" onClick={noHelper}>No helper</button>
              </>
            )}
          </div>
          {ed.layer === 'helper' && (helperState === 'none' || helperState === 'off') ? (
            <div className="w-full max-w-2xl aspect-video rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/60 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700" onPointerDown={(e) => e.stopPropagation()}>
              <p className="max-w-md">
                {helperState === 'off'
                  ? 'This slide has no helper: when a learner is lost, the professor zooms in on the part being explained and says it in plain words.'
                  : 'No helper yet. When you save, the AI drafts one: the slide explained another way, which the slide morphs into when a learner is lost.'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button className={primary} onClick={copyIntoHelper}>Start from a copy of this slide</button>
                {helperState === 'off'
                  ? <button className={btn} onClick={aiHelper}>Let the AI draft one</button>
                  : <button className={btn} onClick={noHelper}>No helper for this slide</button>}
              </div>
              <p className="text-xs text-slate-500 max-w-md">Copied boxes morph from the box they were copied from: move them, resize them, change their words or pictures. New boxes fade in.</p>
            </div>
          ) : (
          <div className="w-full flex justify-center" onPointerDown={(e) => e.stopPropagation()}>
            <EditCanvas
              slide={slide}
              selected={ed.selected}
              onSelect={ed.setSelected}
              onChange={(id, patch, group) => ed.updateElement(id, patch, group)}
              onDropImage={(img, x, y) => addImage(img, x, y)}
              onEditText={() => { setPanel('props'); setTimeout(() => document.getElementById('inspector-text')?.focus(), 0); }}
              warnIds={warnIds}
            />
          </div>
          )}
          {heat && <SlideStatsPanel stats={heat[main.id]} days={HEAT_DAYS} onClose={() => setHeat(null)} />}
          {morphPreview !== null && main && (
            <div className="fixed inset-0 z-50 bg-slate-950/70 flex flex-col items-center justify-center gap-3 p-6" onPointerDown={(e) => { e.stopPropagation(); setMorphPreview(null); }} role="dialog" aria-label="Morph preview">
              <SlideCanvas slide={morphPreview ? helperView(main) : main} morph width="min(80vw, calc(75vh * 16 / 9))" />
              <p className="text-sm text-white/80">{morphPreview ? 'Helper (when lost)' : 'Main slide'} · loops until you click</p>
            </div>
          )}
          <div className="text-[11px] text-slate-400">
            Drag to move · corners to resize · arrows nudge (Shift = more) · Del removes · Ctrl+Z undo · Ctrl+S save ·{' '}
            <span className="text-violet-600">dashed purple ✨ AI = words written by the AI</span>
          </div>
        </main>

        {/* properties / images */}
        <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
          <div className="flex border-b border-slate-200 text-sm">
            <button className={`flex-1 py-2 ${panel === 'props' ? 'font-semibold border-b-2 border-cyan-600' : 'text-slate-500'}`} onClick={() => setPanel('props')}>Properties</button>
            <button className={`flex-1 py-2 ${panel !== 'props' ? 'font-semibold border-b-2 border-cyan-600' : 'text-slate-500'}`} onClick={() => setPanel('images')}>Images</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {panel === 'props' ? (
              element ? (
                <ElementInspector
                  el={element}
                  order={element.silent ? null : order.findIndex((e) => e.id === element.id) + 1 || null}
                  update={(patch) => ed.updateElement(element.id, patch)}
                  onDelete={deleteElement}
                  onDuplicate={duplicateElement}
                  onLayer={layer}
                  warnings={slideWarns.filter((w) => w.elementId === element.id)}
                />
              ) : (
                <SlideInspector
                  slide={slide}
                  update={(p) => ed.updateSlide(p)}
                  warnings={slideWarns}
                  onPickBackground={() => setPanel('background')}
                  recap={deck.recap}
                  recapByAI={deck.recapByAI}
                  onRecap={(text) => ed.change((d) => { d.recap = text || undefined; d.recapByAI = undefined; }, 'deck:recap')}
                />
              )
            ) : (
              <ImageLibrary
                mode={panel === 'background' ? 'background' : 'add'}
                onAdd={(img) => {
                  if (panel === 'background') {
                    ed.updateSlide({ background: { ...slide.background, image: img.url } });
                    setPanel('props');
                  } else {
                    addImage(img);
                  }
                }}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Someone else saved this lesson since it was opened here */}
      {conflict && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4" role="alertdialog" aria-labelledby="conflict-title">
            <h2 id="conflict-title" className="font-bold text-lg">{conflict.by} saved this lesson{conflict.at ? ` at ${when(conflict.at)}` : ''}</h2>
            <p className="text-sm text-slate-600">
              That was after you opened it here, so {conflict.then === 'publish' ? 'publishing now' : 'saving now'} would replace their changes with yours.
            </p>
            <div className="flex flex-col gap-2">
              <button
                className={primary}
                onClick={() => { setConflict(null); ed.setDirty(false); onReload(); }}
              >
                Load their version (your unsaved changes are dropped)
              </button>
              <button
                className={btn}
                onClick={async () => {
                  const then = conflict.then;
                  setConflict(null);
                  if (then === 'publish') await publishNow(true);
                  else await save({ force: true });
                }}
              >
                Keep mine ({conflict.then === 'publish' ? 'save over theirs, then publish' : 'save over theirs'})
              </button>
              <button className={btn} onClick={() => setConflict(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete lesson: confirm first */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={() => !confirmDelete.busy && setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="delete-title">
            <h2 id="delete-title" className="font-bold text-lg">Delete “{lessons.find((l) => l.id === lessonId)?.title ?? lessonId}”?</h2>
            <p className="text-sm text-slate-600">
              This deletes the lesson with its draft, its live deck and its publish history. Learners can no longer open it. This can’t be undone.
            </p>
            {confirmDelete.error && <p className="text-sm text-red-600">{confirmDelete.error}</p>}
            <div className="flex justify-end gap-2">
              <button className={btn} onClick={() => setConfirmDelete(null)} disabled={confirmDelete.busy} autoFocus>Cancel</button>
              <button
                className="px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                disabled={confirmDelete.busy}
                onClick={async () => {
                  setConfirmDelete({ busy: true });
                  const err = await onDeleteLesson(lessonId);
                  setConfirmDelete(err ? { busy: false, error: err } : null);
                }}
              >
                {confirmDelete.busy ? 'Deleting…' : 'Yes, delete it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start from AI: every lesson version in Redis */}
      {versions && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={() => setVersions(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-bold text-lg">Start from AI</h2>
              <p className="text-sm text-slate-600">Copying replaces this draft’s slides (undo works until you save).</p>
            </div>

            {/* The AI deck, made in the new slide format */}
            <div className="p-4 border-b border-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">AI deck (new slide format)</div>
                  <div className="text-xs text-slate-500">
                    {aiDeck === undefined ? 'Checking…'
                      : aiDeck ? `${aiDeck.slides} slides in ${aiDeck.topics} topics · made ${when(aiDeck.at)}`
                      : 'Not made yet for this lesson'}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {aiDeck && !live && <Tag tone="cyan">learners get this now (nothing published)</Tag>}
                    {aiDeck && live && <Tag tone="slate">used if the live deck is taken down</Tag>}
                    {aiDeck && deck.basedOn === `canvas_ai:${aiDeck.at ?? ''}` && <Tag tone="violet">this draft was copied from this</Tag>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {aiDeck && <button className={btn} onClick={() => window.open(`/presentation?lesson=${encodeURIComponent(lessonId)}&preview=ai`, '_blank')}>Preview ↗</button>}
                  {aiDeck && <button className={btn} onClick={copyAiDeck} disabled={!!aiGen}>Copy into draft</button>}
                </div>
              </div>
              <button className={primary} onClick={generateAi} disabled={!!aiGen}>
                {aiGen?.phase === 'writing' ? '✨ Writing the slides… (a few minutes)'
                  : aiGen?.phase === 'audio' ? `🔊 Recording audio…${aiGen.remaining ? ` ${aiGen.remaining} left` : ''}`
                  : aiDeck ? 'Make a new AI deck' : 'Make an AI deck'}
              </button>
              {aiNotes.length > 0 && (
                <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 list-disc pl-5">
                  {aiNotes.slice(0, 6).map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>

            <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Older AI lessons (converted from the old format)</div>
            <div className="overflow-y-auto p-2">
              {versions.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">None found in Redis.</p>
              ) : versions.map((v) => (
                <button key={v.key} onClick={() => applyVersion(v)} className="w-full text-left px-3 py-2 rounded-md hover:bg-cyan-50 flex justify-between items-center">
                  <span className="text-sm font-medium flex flex-col">
                    {v.label}
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {v.current && !live && !aiDeck && <Tag tone="cyan">learners get this now (nothing published)</Tag>}
                      {v.current && (live || aiDeck) && <Tag tone="slate">newest old-format lesson</Tag>}
                      {live?.basedOn === v.key && <Tag tone="emerald">the live deck was copied from this</Tag>}
                      {deck.basedOn === v.key && <Tag tone="violet">this draft was copied from this</Tag>}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">{v.slides} slides</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
