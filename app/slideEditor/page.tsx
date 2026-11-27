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
import { answersToLookAt, claimKey, factBasis, lessonBasis, slideWarnings, slidesToFactCheck, type Warning } from '@/lib/canvas/checks';
import { speakingOrder } from '@/lib/canvas/queue';
import { topicRepeats } from '@/lib/canvas/topicRuns';
import { deckFromAnyVersion } from '@/lib/canvas/fromLegacy';
import { growMedia } from '@/lib/canvas/fillSpace';
import { answerState, countTodo, needsBank, openPictureIdeas, pictureBasis, pictureSkipKey, quizBasis, todoTotal, type Patch } from '@/lib/canvas/aiFields';
import { startsTopic } from '@/lib/canvas/intro';
import { applyRepeatFix, type RepeatSuggestion } from '@/lib/canvas/repeats';
import RepeatsPanel from '@/components/editor/RepeatsPanel';
import LessonPanel from '@/components/editor/LessonPanel';
import NewLessonWizard from '@/components/editor/NewLessonWizard';
import ConceptsPanel from '@/components/editor/ConceptsPanel';
import Menu, { MenuHeading, MenuItem } from '@/components/editor/Menu';
import PullFromOriginal from '@/components/editor/PullFromOriginal';
import { pullSlides } from '@/lib/canvas/studyLesson';
import { STUDY_LESSON, STUDY_SOURCE } from '@/lib/study/content';
import CheckPanel, { picturesWithoutDescription, type Described } from '@/components/editor/CheckPanel';
import { profileOf, usesMath } from '@/lib/canvas/profile';
import { countDeckLongDashes, removeDeckLongDashes } from '@/lib/dashes';
import { setMathText } from '@/lib/mathText';
import { enterProfile } from '@/lib/canvas/lessonContext';
import { deckAbout, deckSections, findCrossSectionRepeats } from '@/lib/lessonOverlap';
import { DEFAULT_PDF, type PdfOptions } from '@/components/editor/exportPdf';
import { DEFAULT_LESSON, type LessonInfo } from '@/lib/canvas/lessons';
import type { CheckedClaim, Deck, DeckChecks, OrderMove, Slide, SlideElement } from '@/lib/canvas/types';
import { ACTIVITY_KINDS, VISUAL_KINDS, activityTemplate, visualTemplate } from '@/components/editor/templates';
import { applyMove, clearRewordedWords, moveDone, moveKey, openMoves, slideName } from '@/lib/canvas/order';
import SavedVersions from '@/components/editor/SavedVersions';
import AssistantBox from '@/components/editor/AssistantBox';
import SlideGrid from '@/components/editor/SlideGrid';
import CopyLesson from '@/components/editor/CopyLesson';
import Icon, { type IconName } from '@/components/Icon';

/*
 * Slide editor (docs/customization-plan.md, step 3). Password-protected by the
 * middleware. Save writes the draft; Preview plays the saved draft; Publish
 * makes the draft the live deck that /presentation plays.
 */

/**
 * One round of the save-time AI (/api/editor/prepare). A round that fails on the way (the server
 * timed out or was busy: a 504, a dropped connection) is tried again, twice, a few seconds apart.
 * Was: one failed round ended it all, and the AI deck's audio never got made.
 */
async function prepareRound(lesson: string, kind: 'draft' | 'ai'): Promise<{ patches?: Patch[]; remaining?: number; errors?: string[]; error?: string; more?: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api/editor/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson, kind }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    // an answer from the route itself (done, or a real error like "Save the draft first"): as it is
    if (res && d && res.status < 500) return d;
    if (attempt >= 2) return { error: res ? `The AI step failed (${res.status}${res.status === 504 ? ': it took too long' : ''})` : 'The AI step couldn’t be reached' };
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}

type LiveInfo = { at?: string; by?: string; basedOn?: string; savedAs?: string } | null;
type AiDeckInfo = { at?: string; slides: number; topics: number; todo?: number } | null;
type Version = { key: string; label: string; slides: number; current: boolean };

// The editor's buttons: an everyday one (white, a clear edge), the main action (filled), "add to the slide" (tinted,
// so the four of them read as one group), and a quiet one for the toolbar's undo/redo
const btn = 'px-3 py-1.5 rounded-md text-sm font-semibold border border-slate-400 bg-white hover:bg-slate-100 text-slate-900 shadow-sm disabled:opacity-40';
const primary = 'px-4 py-1.5 rounded-md text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm disabled:opacity-40';
const addBtn = 'px-3 py-1.5 text-sm font-semibold bg-cyan-50 hover:bg-cyan-100 text-cyan-950 disabled:opacity-40 flex items-center gap-1.5';
const iconBtn = 'w-9 h-9 rounded-md text-base font-bold border border-slate-400 bg-white hover:bg-slate-100 text-slate-900 shadow-sm disabled:opacity-40';

// (on the dark top bar)
const ghost = 'h-8 px-3 rounded-md text-sm font-semibold bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap';
const ghostIcon = 'w-8 h-8 shrink-0 rounded-md bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 flex items-center justify-center';
// (the canvas toolbar: quiet, so the slide is what stands out)
const tool = 'h-8 px-2.5 rounded-md text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap';
const toolIcon = 'w-8 h-8 shrink-0 rounded-md text-slate-700 hover:bg-slate-100 flex items-center justify-center';

const TAG_TONES = {
  cyan: 'bg-cyan-100 text-cyan-800',
  slate: 'bg-slate-100 text-slate-700',
  emerald: 'bg-emerald-100 text-emerald-800',
  violet: 'bg-violet-100 text-violet-800',
};
function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return <span className={`px-1.5 py-0.5 rounded text-xs font-normal ${TAG_TONES[tone]}`}>{children}</span>;
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

  // "+ New lesson…": the creation flow (components/editor/NewLessonWizard.tsx); "Just an empty lesson" in it: a name only
  const [creating, setCreating] = useState(false);
  // "Duplicate this lesson…" / "Translate a copy…" (components/editor/CopyLesson.tsx)
  const [copying, setCopying] = useState<{ translate: boolean } | null>(null);
  const newLesson = () => setCreating(true);
  const blankLesson = async () => {
    setCreating(false);
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
    <>
    {creating && (
      <NewLessonWizard onClose={() => setCreating(false)} onBlank={blankLesson}
        onCreated={(lesson, notes) => {
          setCreating(false);
          setLessons((l) => (l.some((x) => x.id === lesson.id) ? l : [...l, lesson]));
          switchLesson(lesson.id);
          if (notes.length) window.setTimeout(() => window.alert(`“${lesson.title}” is ready.\n\n${notes.join('\n')}`), 500);
        }} />
    )}
    {copying && (
      <CopyLesson from={lessonId} title={lessons.find((l) => l.id === lessonId)?.title ?? lessonId} translate={copying.translate} onClose={() => setCopying(null)}
        onMade={(lesson, note) => {
          setCopying(null);
          setLessons((l) => (l.some((x) => x.id === lesson.id) ? l : [...l, lesson]));
          switchLesson(lesson.id);
          window.setTimeout(() => window.alert(note), 500);
        }} />
    )}
    <Editor
      key={initial.key}
      onCopyLesson={(translate) => setCopying({ translate })}
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
    </>
  );
}

function Editor({
  lessonId, lessons, initial, savedAt: initialSavedAt, savedBy: initialSavedBy, onSwitchLesson, onNewLesson, onDeleteLesson, onReload, onCopyLesson,
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
  onCopyLesson: (translate: boolean) => void;
}) {
  const ed = useEditorDeck(initial);
  // The saved draft this editor started from (or last saved). If someone else
  // saves in between, saving or publishing asks before overwriting.
  const baseRev = useRef<string | undefined>(initial.editRev);
  const [conflict, setConflict] = useState<{ by: string; at: string | null; then: 'save' | 'publish' } | null>(null);
  const { deck, slide, slideIdx, element } = ed;
  // (the lesson being edited: which recorded clips are in its teacher's voice, lib/canvas/aiFields.ts audioKey)
  enterProfile(profileOf(deck));
  setMathText(usesMath(profileOf(deck)));   // (a math lesson: fractions shown stacked)
  type Panel = 'props' | 'images' | 'background' | 'repeats' | 'check' | 'ideas' | 'lesson';
  const [panel, setPanelRaw] = useState<Panel>('props');
  // The side panels fold away, so the slide can have the room (remembered in this browser)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  useEffect(() => {
    try { setLeftOpen(localStorage.getItem('editor:left') !== '0'); setRightOpen(localStorage.getItem('editor:right') !== '0'); } catch { /* fine */ }
  }, []);
  const toggleSide = (side: 'left' | 'right') => {
    const set = side === 'left' ? setLeftOpen : setRightOpen;
    set((v) => { try { localStorage.setItem(`editor:${side}`, v ? '0' : '1'); } catch { /* fine */ } return !v; });
  };
  // (asking for a panel opens the side it's in)
  const setPanel = useCallback((p: Panel) => { setPanelRaw(p); setRightOpen(true); }, []);
  const [gridOpen, setGridOpen] = useState(false);   // every slide at once (components/editor/SlideGrid.tsx)
  // The slide is drawn as big as the room it has (was: a fixed share of the window's height)
  const stage = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState<number | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setFitW(Math.max(240, Math.floor(Math.min(r.width, (r.height * 16) / 9)))); };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  // Who unlocked the editor (the top bar's menu: "Unlocked as …", Lock)
  const [editorName, setEditorName] = useState<string | null>(null);
  useEffect(() => { const m = document.cookie.match(/(?:^|;\s*)editor_name=([^;]*)/); setEditorName(m ? decodeURIComponent(m[1]) : null); }, []);
  const lockEditor = async () => {
    if (ed.dirty && !window.confirm('You have unsaved changes. Lock the editor and lose them?')) return;
    await fetch('/api/editor/lock', { method: 'POST' });
    window.location.href = '/';
  };
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ at?: string; by?: string }>({ at: initialSavedAt, by: initialSavedBy });
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [live, setLive] = useState<LiveInfo | undefined>(undefined);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ busy: boolean; error?: string } | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);   // More ▾ → Saved versions…
  const [pullOpen, setPullOpen] = useState(false);     // More ▾ → Pull from the original… (the study's lesson)
  const versionsOpen = useRef(false);
  versionsOpen.current = versions !== null || confirmDelete !== null || conflict !== null || savedOpen || pullOpen;
  const [overflow, setOverflow] = useState<Record<string, string[]>>({});
  // Learners: how each slide went for learners (a heatmap on the slide list)
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

  // "PDF": the lesson as it is in the editor (unsaved changes too), as a teacher script or a handout
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [pdfOpts, setPdfOpts] = useState<PdfOptions>(DEFAULT_PDF);
  const downloadPdf = async () => {
    setPdfProgress('0%');
    try {
      const { exportDeckPdf } = await import('@/components/editor/exportPdf');
      await exportDeckPdf(deck, pdfOpts, (done, total) => setPdfProgress(`${Math.round((done / Math.max(1, total)) * 100)}%`));
    } catch (e) {
      flash(`The PDF couldn't be made: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setPdfProgress(null);
    }
  };
  const flash = useCallback((text: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    setNotice({ text, tone });
    if (tone === 'ok') setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3000);
  }, []);

  const loadLive = useCallback(() => {
    fetch(`/api/editor/deck?lesson=${encodeURIComponent(lessonId)}&kind=live`)
      .then((r) => r.json())
      .then((d) => setLive(d.deck ? { at: d.deck.updatedAt, by: d.deck.updatedBy, basedOn: d.deck.basedOn, savedAs: d.deck.savedAs } : null))
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

  // Each slide's own checks, kept until that slide changes: an edit re-checks only the slide being edited (was: every
  // slide on every keystroke or drag, and the empty-space check tries growing each picture step by step)
  const ownWarnings = useRef(new Map<string, { key: string; warnings: Warning[] }>());
  // (lesson-wide: a topic that's in two places)
  const repeatedTopics = useMemo(() => topicRepeats(deck.slides), [deck.slides]);
  const warningsFor = useCallback((i: number): Warning[] => {
    const s = deck.slides[i];
    const fit = (overflow[s.id] ?? []).map((id) => ({ elementId: id, level: 'warn' as const, message: 'Text doesn’t fit its box, even at the smallest size: make the box bigger or the text shorter' }));
    const key = JSON.stringify(s);
    let own = ownWarnings.current.get(s.id);
    if (own?.key !== key) ownWarnings.current.set(s.id, own = { key, warnings: slideWarnings(s) });
    const repeat = repeatedTopics.get(s.id);
    return [...fit, ...(repeat ? [{ level: 'warn' as const, kind: 'topic' as const, ...repeat }] : []), ...own.warnings];
  }, [deck, overflow, repeatedTopics]);
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
  const todo = useMemo(() => countTodo(deck), [deck]);
  const todoHere = todoTotal(todo);

  const runAi = useCallback((): Promise<void> => {
    if (aiRun.current) { aiAgain.current = true; return aiRun.current; }
    const run = (async () => {
      setAi((a) => ({ ...a, running: true, errors: [] }));
      let errors: string[] = [];
      try {
        do {
          aiAgain.current = false;
          for (let pass = 0; pass < 30; pass++) {
            const d = await prepareRound(lessonId, 'draft');
            if (d.error) { errors = [d.error]; break; }
            ed.applyRemote(d.patches ?? []);
            errors = d.errors ?? [];
            setAi({ running: true, remaining: d.remaining ?? 0, errors });
            // done, or stuck (errors say why); "more": the round ran out of time, so on with the next
            if (!d.remaining || (!d.patches?.length && !d.more)) break;
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

  /** fromHere: the preview starts at the slide being edited (no clicking through the whole lesson to test one slide) */
  const preview = async (fromHere = false) => {
    if (ed.dirty && !(await save())) return;
    window.open(`/presentation?lesson=${encodeURIComponent(lessonId)}&preview=1${fromHere ? `&slide=${slideIdx + 1}` : ''}`, '_blank');
  };

  // Publish asks first: warnings, and repeats the free check finds (with a way to have the AI check first)
  type PublishCheck = {
    warnings: number;
    repeats: number;                 // the free word match
    repeatsAi: 'none' | 'changed' | 'ok';   // the AI repeat check: never run / the lesson changed since / up to date
    factsToCheck: number;            // slides never fact-checked, or changed since
    factsOpen: { bad: number; missing: number };   // / not marked fine, on checked slides
    pictures: number;                // pictures without a description
    answers: { flagged: number; fixed: number; unchecked: number };   // hands-on answer keys: not backed up by the knowledge base / fixed by the AI, not looked at / not checked yet
    orderMoves: number;              // story-order moves suggested, not made or skipped
  };
  const [publishAsk, setPublishAsk] = useState<PublishCheck | null>(null);
  // The name the published version is saved under (a name not used before: lib/canvas/saved.ts)
  const [publishName, setPublishName] = useState('');
  const [nameCheck, setNameCheck] = useState<'checking' | 'ok' | 'taken' | 'bad'>('checking');
  const lastPublishName = useRef('');   // for "Keep mine" after a conflict
  const nameFree = async (name: string) => {
    const d = await fetch(`/api/editor/saved?name=${encodeURIComponent(name)}`).then((r) => r.json()).catch(() => null);
    return d ? (!d.ok ? 'bad' : d.taken ? 'taken' : 'ok') : 'ok';
  };
  // checked as it's typed
  useEffect(() => {
    if (!publishAsk) return;
    if (!publishName.trim()) { setNameCheck('bad'); return; }
    setNameCheck('checking');
    let gone = false;
    const t = setTimeout(async () => { const r = await nameFree(publishName); if (!gone) setNameCheck(r); }, 300);
    return () => { gone = true; clearTimeout(t); };
  }, [publishName, publishAsk]);
  /** A name to start from: the lesson and the date, with (2), (3)… if that's taken */
  const suggestName = async () => {
    const base = `${deck.title} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`.slice(0, 52);
    for (let n = 1; n <= 20; n++) {
      const name = n === 1 ? base : `${base} (${n})`;
      if ((await nameFree(name)) === 'ok') return name;
    }
    return base;
  };
  const [repeatRun, setRepeatRun] = useState(0);   // bumped: the Repeats panel runs the AI check
  // What's been checked is remembered (deck.checks): only what changed since needs looking at
  const checkLesson = (): PublishCheck => {
    const fine = new Set(deck.checks?.factsOk ?? []);
    const open = { bad: 0, missing: 0 };
    for (const sl of deck.slides) {
      const f = deck.checks?.facts?.[sl.id];
      if (!f || f.from !== factBasis(sl)) continue;
      for (const c of f.claims) {
        if (c.verdict === 'supported' || fine.has(claimKey(sl.id, c.claim))) continue;
        if (c.verdict === 'contradicted') open.bad++; else open.missing++;
      }
    }
    const last = deck.checks?.repeats;
    return {
      warnings: allWarnings.flat().filter((w) => w.level === 'warn' && w.kind !== 'answers').length,   // (answers: their own row)
      repeats: findCrossSectionRepeats(deckSections(deck), deckAbout(deck)).length,
      repeatsAi: !last ? 'none' : last.from === lessonBasis(deck) ? 'ok' : 'changed',
      factsToCheck: slidesToFactCheck(deck).length,
      factsOpen: open,
      pictures: picturesWithoutDescription(deck).length,
      answers: answersToLookAt(deck),
      orderMoves: openMoves(deck).length,
    };
  };
  const inReview = panel === 'check' || panel === 'repeats' || panel === 'ideas';
  // (the Review tab's list: worked out while it's open)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const review = useMemo(() => (inReview && rightOpen ? checkLesson() : null), [inReview, rightOpen, deck, allWarnings]);
  const publish = async () => {
    setPublishAsk(checkLesson());
    setPublishName('');
    suggestName().then((n) => setPublishName((cur) => cur || n));
  };

  /** Publish without asking (after the confirm, or after "Keep mine" in a conflict). */
  const publishNow = async (force = false, name = lastPublishName.current) => {
    lastPublishName.current = name;
    if ((ed.dirty || force) && !(await save({ force, then: 'publish' }))) return;
    // Learners should get finished words and audio: let the AI finish first
    if (todoHere > 0 || aiRun.current) {
      flash('Finishing the spoken words and audio before publishing…', 'warn');
      await runAi();
    }
    const d = await fetch('/api/editor/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson: lessonId, baseRev: baseRev.current ?? null, saveAs: name }),
    }).then((r) => r.json());
    if (d.conflict) return setConflict({ ...d.conflict, then: 'publish' });
    // the name was taken meanwhile (or isn't a name): back to the dialog to pick another
    if (d.field === 'saveAs') { flash(d.error, 'error'); publish(); return; }
    if (d.error) return flash(d.error, 'error');
    // The recap the server wrote (or kept), so saving later doesn't lose it
    ed.mergeRemote((deck) => { deck.recap = d.recap ?? undefined; deck.recapByAI = d.recapByAI || undefined; });
    flash(d.warning ? `Published, but: ${d.warning}` : `Published and saved as “${d.savedAs}”: /presentation now plays this deck`, d.warning ? 'warn' : 'ok');
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
      flash(`AI deck written: ${d.slides} slides (${d.seconds}s). Now the audio…`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), 'error');
      setAiGen(null);
      return;
    }
    await recordAiAudio();
  };

  /**
   * Audio (and the rest of the save-time AI) for the AI deck, round after round. Also "Finish the audio"
   * in Start from AI, for a deck whose audio was cut short (a failed round, a closed tab): the deck
   * itself is kept the moment it's written, so nothing is lost but time.
   */
  const recordAiAudio = async () => {
    setAiGen({ phase: 'audio' });
    try {
      for (let pass = 0; pass < 40; pass++) {
        const p = await prepareRound(lessonId, 'ai');
        if (p.error) throw new Error(p.error);
        setAiGen({ phase: 'audio', remaining: p.remaining });
        if (p.errors?.length) setAiNotes((n) => [...n, ...(p.errors ?? [])].slice(-12));
        if (!p.remaining || (!p.patches?.length && !p.more)) break;
      }
      flash('AI deck ready, with its audio.');
    } catch (e) {
      flash(`${e instanceof Error ? e.message : String(e)}. The AI deck is kept: press “Finish the audio” (More ▾ → Start from AI…) to carry on.`, 'error');
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
      draft.quiz = d.deck.quiz;
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
  const addImage = (img: { url: string; description: string; credit?: string; creditUrl?: string }, cx = 50, cy = 50) => {
    const w = 30, h = 36;
    addElement({
      id: newId('el'), type: 'image', src: img.url, alt: img.description || undefined, fit: 'contain',
      ...(img.credit ? { credit: img.credit, creditUrl: img.creditUrl } : {}),   // (a free picture from outside: who made it)
      w, h, x: Math.min(100 - w, Math.max(0, cx - w / 2)), y: Math.min(100 - h, Math.max(0, cy - h / 2)),
    });
  };

  // The AI makes a hands-on slide from what this slide teaches; it goes in after it
  const [handsOnBusy, setHandsOnBusy] = useState(false);
  // "Rewrite": the AI writes this slide again as asked (lib/canvas/rewriteSlide.ts); one undo step
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteText, setRewriteText] = useState('');
  const rewrite = async (instruction: string) => {
    const target = deck.slides[slideIdx];
    if (!target || !instruction.trim()) return;
    if (ed.layer !== 'main') ed.setLayer('main');
    setRewriteBusy(true);
    try {
      const res = await fetch('/api/editor/rewrite-slide', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson': lessonId },
        body: JSON.stringify({ slide: target, instruction, lessonTitle: deck.title }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.slide) throw new Error(d.error ?? `HTTP ${res.status}`);
      ed.change((dd) => {
        const i = dd.slides.findIndex((sl) => sl.id === target.id);
        if (i >= 0) dd.slides[i] = { ...d.slide, id: target.id, elements: d.slide.elements.map((e: SlideElement) => ({ ...e, id: newId('el') })) };
      });
      ed.setSelected(null);
      setRewriteText('');
      flash(`Rewrote the slide${d.note ? `: ${d.note}` : ''} (Ctrl+Z puts the old one back). Save to record its voice.`);
    } catch (e) {
      flash(`The slide couldn’t be rewritten (${e instanceof Error ? e.message : String(e)})`, 'error');
    } finally {
      setRewriteBusy(false);
    }
  };
  const aiHandsOn = async () => {
    const from = ed.mainSlide;
    if (!from) return;
    setHandsOnBusy(true);
    try {
      const res = await fetch('/api/editor/activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson': lessonId },
        body: JSON.stringify({ slide: from, lessonTitle: deck.title }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.slide) throw new Error(d.error ?? `HTTP ${res.status}`);
      const made: Slide = { ...d.slide, id: newId('s'), elements: d.slide.elements.map((e: SlideElement) => ({ ...e, id: newId('el') })) };
      const at = deck.slides.indexOf(from) + 1;
      ed.change((dd) => { dd.slides.splice(at, 0, made); });
      ed.setLayer('main');
      ed.setSlideIdx(at);
      ed.setSelected(made.elements.find((e) => e.type === 'activity')?.id ?? null);
      flash('Hands-on slide added after this one: try it in the preview, and change anything on the right.', 'ok');
    } catch (e) {
      flash(`Couldn't make a hands-on slide: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setHandsOnBusy(false);
    }
  };

  const deleteElement = useCallback(() => {
    if (!ed.selected) return;
    const id = ed.selected;
    ed.change((d) => {
      const s = d.slides[slideIdx];
      // (was: splice(findIndex) — a missing id (-1) removed the last box instead)
      if (ed.layer === 'helper') { const h = elementsOf(s, 'helper'); const i = h.findIndex((e) => e.id === id); if (i >= 0) h.splice(i, 1); }
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
  // "Check for repeats": accept a rewrite (an undoable edit), or jump to the slide it's on
  const acceptRepeat = (s: RepeatSuggestion) => {
    if (!applyRepeatFix(structuredClone(deck), s, 'person')) return false;   // that part changed since the check
    ed.change((d) => { applyRepeatFix(d, s, 'person'); }, `repeat:${s.slideId}:${s.elId}`);
    return true;
  };
  // The Check tab's results live with the lesson (deck.checks): kept through undo, saved with the lesson
  const [factRun, setFactRun] = useState(0);   // bumped: the Check tab checks the changed slides (Publish)
  const recordFacts = (slideId: string, fact: NonNullable<DeckChecks['facts']>[string]) =>
    ed.annotate((d) => {
      // (results for slides that have since been deleted go)
      const ids = new Set(d.slides.map((x) => x.id));
      const kept = Object.fromEntries(Object.entries(d.checks?.facts ?? {}).filter(([id]) => ids.has(id)));
      d.checks = { ...d.checks, facts: { ...kept, [slideId]: fact } };
    });
  const markFine = (key: string, fine: boolean) => ed.annotate((d) => {
    const ok = new Set(d.checks?.factsOk ?? []);
    if (fine) ok.add(key); else ok.delete(key);
    d.checks = { ...d.checks, factsOk: [...ok] };
  });
  /** "Use this": a fact's fix into its box (an undoable edit), unless the box changed since the check */
  const applyFix = (slideId: string, c: CheckedClaim) => {
    if (!c.rewrite || !c.elId) return false;
    const fix: RepeatSuggestion = { slideIndex: 0, slideId, elId: c.elId, say: c.rewrite.say, text: c.rewrite.text, why: '', beforeSay: c.rewrite.beforeSay, beforeText: c.rewrite.beforeText };
    if (!applyRepeatFix(structuredClone(deck), fix, 'person')) return false;
    ed.change((d) => { applyRepeatFix(d, fix, 'person'); }, `fix:${slideId}:${c.elId}`);
    return true;
  };
  /** Describe all: the descriptions in one undo step, only where there's still none and it's the same picture */
  const fillDescriptions = (list: Described[]) => {
    let n = 0;
    const fits = (d: Deck, x: Described) => {
      const s = d.slides.find((v) => v.id === x.slideId);
      const el = (x.helper ? s?.helper?.elements : s?.elements)?.find((e) => e.id === x.elId);
      return el?.type === 'image' && el.src === x.src && !el.alt?.trim() ? el : null;
    };
    n = list.filter((x) => fits(deck, x)).length;
    if (n) ed.change((d) => { for (const x of list) { const el = fits(d, x); if (el) el.alt = x.alt; } });
    return n;
  };
  // "Split this topic": the AI suggests where and the names; a person confirms
  const [splitAsk, setSplitAsk] = useState<{ start: number; busy?: boolean; error?: string; split?: { splitAt: number; first: string; second: string; why: string } } | null>(null);
  const askSplit = async (start: number) => {
    setSplitAsk({ start, busy: true });
    try {
      const res = await fetch('/api/editor/split-topic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck, start }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.split) throw new Error(d.error || `It didn't work (${res.status})`);
      setSplitAsk({ start, split: d.split });
    } catch (e) {
      setSplitAsk({ start, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const doSplit = () => {
    const a = splitAsk;
    if (!a?.split) return;
    const { splitAt, first, second } = a.split;
    const old = (deck.slides[a.start]?.topic ?? '').trim().toLowerCase();
    ed.change((d) => {
      for (let i = a.start; i < d.slides.length && (d.slides[i].topic ?? '').trim().toLowerCase() === old; i++) {
        // a person's names now (the AI won't rename them); the new part gets its intro written on save
        Object.assign(d.slides[i], { topic: i < splitAt ? first : second, topicByAI: undefined });
      }
    });
    setSplitAsk(null);
    flash(`Split into “${first}” and “${second}” (Ctrl+Z undoes it)`);
  };
  // The Check tab's count: open / facts on up-to-date checks, and pictures without a description
  const checkBadge = useMemo(() => {
    const fine = new Set(deck.checks?.factsOk ?? []);
    let n = picturesWithoutDescription(deck).length + openMoves(deck).length + openPictureIdeas(deck).length;
    for (const sl of deck.slides) {
      const f = deck.checks?.facts?.[sl.id];
      if (f && f.from === factBasis(sl)) n += f.claims.filter((c) => c.verdict !== 'supported' && !fine.has(claimKey(sl.id, c.claim))).length;
    }
    return n;
  }, [deck]);
  // Story order (the Check tab): make suggested moves (one undo step), or skip one
  const makeMoves = (moves: OrderMove[]) => {
    let made = 0;
    const theirs: string[] = [];
    ed.change((d) => {
      for (const m of moves) {
        if (moveDone(d.slides, m) || !applyMove(d, m)) continue;
        made++;
        theirs.push(...clearRewordedWords(d, m.reword).map(slideName));
      }
    });
    if (!made) return flash('The slides have changed since: nothing to move', 'warn');
    flash(`${made === 1 ? 'Moved' : `Made ${made} moves`} (Ctrl+Z undoes it).${theirs.length ? ` Check your words on “${theirs.join('”, “')}”: they may not fit the new order.` : ''}`, theirs.length ? 'warn' : 'ok');
  };
  const skipMove = (m: OrderMove) => ed.change((d) => { d.checks = { ...d.checks, orderSkips: [...(d.checks?.orderSkips ?? []), moveKey(m)].slice(-200) }; });
  // Pictures to add (the Check tab): the slide laid out with them, if it's still as it was checked (one undo step), or skip them
  const addPictures = (slideId: string) => {
    let added = 0;
    ed.change((d) => {
      const sl = d.slides.find((x) => x.id === slideId);
      const c = d.checks?.pictures?.[slideId];
      if (!sl || !c?.idea || c.from !== pictureBasis(sl)) return;
      sl.elements = structuredClone(c.idea.elements);
      added = c.idea.pictures.length;
    });
    flash(added ? `Added ${added === 1 ? 'a picture' : `${added} pictures`} (Ctrl+Z undoes it)` : 'The slide has changed since: it’s checked again on save', added ? 'ok' : 'warn');
  };
  const skipPictures = (slideId: string) => ed.change((d) => {
    const c = d.checks?.pictures?.[slideId];
    if (c) d.checks = { ...d.checks, pictureSkips: [...(d.checks?.pictureSkips ?? []), pictureSkipKey(slideId, c.from)].slice(-300) };
  });

  // Pictures with no description (the chip in the top row, More ▾): the Check tab's Describe all, started from here
  const missingDescriptions = useMemo(() => picturesWithoutDescription(deck).length, [deck]);
  const [describeRun, setDescribeRun] = useState(0);
  const describeAllPictures = () => { setPanel('check'); setDescribeRun((n) => n + 1); };
  /** The helper's "Show me": that part of the page, scrolled to and flashing (a right-panel tab is opened too) */
  const showPart = (where: string) => {
    if (where === 'tab-edit') setPanel('props');
    else if (where === 'tab-images' || where === 'tab-repeats' || where === 'tab-check') setPanel(where.slice(4) as 'images' | 'repeats' | 'check');
    else if (where === 'describe-all' && !missingDescriptions) setPanel('check');
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-help="${CSS.escape(where)}"]`)
        ?? (where === 'describe-all' ? document.querySelector<HTMLElement>('[data-help="tab-check"]') : null)
        // (How learners did and the PDF are in the More menu now)
        ?? (where === 'learners' || where === 'pdf' ? document.querySelector<HTMLElement>('[data-help="more"]') : null);
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      el.classList.remove('help-flash');
      void el.offsetWidth;   // (restart the animation)
      el.classList.add('help-flash');
      setTimeout(() => el.classList.remove('help-flash'), 3200);
    }, 80);
  };

  const goToRepeat = (i: number, elId?: string) => {
    if (ed.layer !== 'main') ed.setLayer('main');
    ed.setSlideIdx(Math.max(0, Math.min(i, deck.slides.length - 1)));
    ed.setSelected(elId ?? null);
  };
  const copyIntoHelper = () => ed.change((d) => {
    const s = d.slides[slideIdx];
    const h = elementsOf(s, 'helper');
    h.splice(0, h.length, ...structuredClone(s.elements));   // same ids: every box morphs from itself
  });
  const aiHelper = () => ed.change((d) => { d.slides[slideIdx].helper = undefined; });   // the AI drafts it on the next save
  const noHelper = () => ed.change((d) => { d.slides[slideIdx].helper = { elements: [], off: true }; });
  const [morphPreview, setMorphPreview] = useState<boolean | null>(null);
  // The laser mark being placed on the selected element (index), if any
  const [placingMark, setPlacingMark] = useState<number | null>(null);
  useEffect(() => { setPlacingMark(null); }, [ed.selected, slideIdx, ed.layer]);   // null = closed; true = showing the helper
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
        if (e.key === 'Escape') { setVersions(null); setConfirmDelete(null); setSavedOpen(false); }
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

  // Download as a PDF: its choices (from the More menu)
  const [pdfAsk, setPdfAsk] = useState(false);
  // Long dashes ("—") in the lesson's words, and taking them out (lib/dashes.ts): one undo step
  const longDashes = useMemo(() => countDeckLongDashes(deck), [deck]);
  const removeLongDashes = () => {
    let gone = 0;
    ed.change((d) => { gone = removeDeckLongDashes(d); });
    flash(`Took out ${gone} long dash${gone === 1 ? '' : 'es'} (Ctrl+Z puts them back). Narration that changed is recorded again when you save.`);
  };

  const confirmSwitch = (id: string) => {
    if (ed.dirty && !window.confirm('You have unsaved changes. Switch lessons and lose them?')) return;
    onSwitchLesson(id);
  };

  /* ------------------------------------------------------------ view */

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900">
      {/* The one top bar: the lesson, what's left for the AI, the helper, then undo, save, preview, publish and the menus
          (was: a dark bar of page links, a row of saving and a row of adding: three bars before any slide) */}
      <header className="flex items-center gap-2 px-3 h-12 shrink-0 bg-slate-900 text-white" data-editor-toolbar>
        <select data-help="lesson" className="h-8 px-2 rounded-md bg-slate-800 border border-slate-600 text-sm font-semibold text-white max-w-48" value={lessonId} aria-label="Lesson"
          onChange={(e) => (e.target.value === '__new' ? onNewLesson() : confirmSwitch(e.target.value))}>
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          <option value="__new">+ New lesson…</option>
        </select>
        {/* What the AI still has to write or record: the number, and (click) what it's made of */}
        <Menu help="ai-status" width="w-80" title={ai.errors.join('\n') || 'What the AI fills in when you save: click to see it'}
          className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${ai.running ? 'bg-violet-500 text-white' : ai.errors.length ? 'bg-red-500 text-white' : todoHere ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-emerald-300'}`}
          label={ai.running
            ? <><Icon name="sparkle" size={14} /> Writing and recording…{ai.remaining ? <b>{ai.remaining} left</b> : null}</>
            : ai.errors.length
              ? <><Icon name="warning" size={14} /> The AI step had problems</>
              : todoHere
                ? <><b className="text-sm">{todoHere}</b> to write or record</>
                : <><Icon name="check-mark" size={14} /> Words and audio ready</>}>
          {(close) => {
            const rows: [number, string][] = [
              [todo.say, 'spoken words to write'], [todo.plain, 'simpler versions to write'], [todo.audio, 'voice clips to record'],
              [todo.helpers, 'helper slides to draft'], [todo.bank, 'topics that need class questions'], [todo.quiz, 'end-of-lesson quiz to write'],
              [todo.intros, 'topic introductions to write'], [todo.topics, 'slides that need a topic name'], [todo.captions, 'picture captions to write'],
              [todo.pointers, 'pictures that need laser-pointer marks'], [todo.answers, 'hands-on boxes whose answers need checking'],
              [todo.pictures, 'slides to look at for pictures'], [todo.order, 'story-order check'],
            ];
            const open = rows.filter(([n]) => n > 0);
            return (
              <div className="p-2 text-slate-800 flex flex-col gap-2" data-status-breakdown>
                <div className="font-bold text-slate-900">{ai.running ? 'The AI is working' : todoHere ? `${todoHere} to write or record` : 'Nothing left to write or record'}</div>
                {open.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {open.map(([n, what]) => <li key={what} className="flex gap-2"><b className="w-7 text-right tabular-nums">{n}</b><span>{what}</span></li>)}
                  </ul>
                )}
                {ai.errors.length > 0 && <ul className="text-xs text-red-700 list-disc pl-4">{ai.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
                {missingDescriptions > 0 && (
                  <button data-help="describe-all" className="text-left text-xs px-2 py-1.5 rounded-md bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100"
                    onClick={() => { close(); describeAllPictures(); }}>
                    {missingDescriptions} picture{missingDescriptions === 1 ? ' has' : 's have'} no description. <b>Describe {missingDescriptions === 1 ? 'it' : 'them'} with the AI</b>
                  </button>
                )}
                <p className="text-xs text-slate-500">The AI does these in the background each time you save. You can keep editing while it works.</p>
                {todoHere > 0 && !ai.running && <button className={primary} onClick={() => { close(); save(); }}>Save and start</button>}
              </div>
            );
          }}
        </Menu>
        <div className="flex-1 min-w-[9rem] flex justify-center">
          <AssistantBox lesson={lessonId} onShow={showPart} onAddImage={(img) => { addImage(img); flash('Added the picture to this slide (Ctrl+Z undoes it)'); }}
            onAddText={(text) => { addElement({ id: newId('el'), type: 'text', x: 8, y: 68, w: 84, h: 20, text, style: 'body', color: '#0f172a' }); flash('Added the sentence as a text box (Ctrl+Z undoes it)'); }} />
        </div>
        <span className="hidden xl:inline text-xs text-slate-300 whitespace-nowrap" data-save-state>
          {saving ? 'Saving…' : ed.dirty ? <span className="text-amber-300 font-bold">● Unsaved changes</span> : saved.at ? `Saved ${when(saved.at)}${saved.by ? ` by ${saved.by}` : ''}` : 'Not saved yet'}
        </span>
        <button data-help="undo" className={ghostIcon} onClick={ed.undo} disabled={!ed.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="undo" size={17} /></button>
        <button className={ghostIcon} onClick={ed.redo} disabled={!ed.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Icon name="redo" size={17} /></button>
        <button data-help="save" className={ed.dirty ? 'h-8 px-3.5 rounded-md text-sm font-bold bg-white hover:bg-slate-200 text-slate-950 disabled:opacity-40 flex items-center gap-1.5' : ghost} onClick={() => save()} disabled={saving} title="Ctrl+S"><Icon name="save" size={16} /> Save</button>
        <Menu help="preview" className={ghost} label={<><Icon name="play" size={15} /> Preview</>} title="Play the saved lesson in a new tab" width="w-56">
          {(close) => (
            <>
              <MenuItem onClick={() => { close(); preview(); }} hint="Opens in a new tab">From the start</MenuItem>
              <MenuItem onClick={() => { close(); preview(true); }} hint="Opens in a new tab">From slide {slideIdx + 1}</MenuItem>
            </>
          )}
        </Menu>
        {/* (the one coloured button: the main thing to do) */}
        <button data-help="publish" className="h-8 px-4 rounded-md text-sm font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950" onClick={publish}>Publish</button>
        <span className="w-px h-6 bg-white/20" />
        {/* The lesson's profile (what it's about, who it's for, the teacher…): in the side panel */}
        <button className={`${ghost} ${panel === 'lesson' && rightOpen ? '!bg-white !text-slate-950' : ''}`} onClick={() => setPanel(panel === 'lesson' ? 'props' : 'lesson')}
          title="What the lesson is about, who it’s for, the teacher, the family card, the sources" aria-pressed={panel === 'lesson'} data-help="lesson-settings">
          <Icon name="settings" size={16} /> <span className="hidden lg:inline">Lesson settings</span>
        </button>
        {/* Everything else about the lesson, and the other editor pages, in one menu */}
        <Menu help="more" className={`${ghostIcon} ${heat ? '!bg-white !text-slate-950' : ''}`} title="More" label={pdfProgress ? <span className="text-xs">{pdfProgress}</span> : <Icon name="more" size={18} />} width="w-72">
          {(close) => (
            <>
              <MenuHeading>This lesson</MenuHeading>
              <MenuItem onClick={() => { close(); toggleHeat(); }} disabled={heatLoading}
                hint="Puzzled faces, “I’m lost”, simpler please… on each slide, for the last 30 days">
                How learners did{heat ? ' (showing: click to hide)' : ''}
              </MenuItem>
              <MenuItem onClick={() => { close(); setPdfAsk(true); }} disabled={pdfProgress !== null} hint="Teacher script, handout or narration only">Download as a PDF…</MenuItem>
              <MenuItem onClick={() => { close(); setSavedOpen(true); }} hint="Versions saved when they were published: copy a slide back, or go back to one">Saved versions…</MenuItem>
              <MenuItem onClick={() => { close(); openVersions(); }} hint="Replace this draft with an AI-made deck">Start from AI…</MenuItem>
              {lessonId === STUDY_LESSON && (
                <MenuItem onClick={() => { close(); setPullOpen(true); }} hint={`Bring changed or new slides across from “${lessons.find((l) => l.id === STUDY_SOURCE)?.title ?? STUDY_SOURCE}”, one by one`}>Pull from the original…</MenuItem>
              )}
              <MenuItem onClick={() => { close(); if (!ed.dirty || window.confirm('The copy is made from the draft as last saved, so your unsaved changes won’t be in it. Go on?')) onCopyLesson(false); }} hint="A new lesson with the same slides, to change freely">Duplicate this lesson…</MenuItem>
              <MenuItem onClick={() => { close(); if (!ed.dirty || window.confirm('The copy is made from the draft as last saved, so your unsaved changes won’t be in it. Go on?')) onCopyLesson(true); }} hint="A copy with every word in another language">Translate a copy…</MenuItem>
              {/*MORE-LESSON*/}
              <MenuHeading>Other pages (new tab)</MenuHeading>
              <MenuItem onClick={() => { close(); window.open(`/lessonReview?lesson=${encodeURIComponent(lessonId)}&preview=1`, '_blank', 'noopener'); }}>Lesson review, to read or print</MenuItem>
              <MenuItem onClick={() => { close(); window.open('/textIngest', '_blank', 'noopener'); }}>Add source text to a knowledge base</MenuItem>
              <MenuItem onClick={() => { close(); window.open('/studyResults', '_blank', 'noopener'); }}>Study: static vs adaptive</MenuItem>
              <MenuItem onClick={() => { close(); window.open('/studyResults/classmates', '_blank', 'noopener'); }}>Study: classmates</MenuItem>
              <MenuItem onClick={() => { close(); window.open('/lessonBackup', '_blank', 'noopener'); }}>Lesson backup</MenuItem>
              <MenuHeading>{editorName ? `Unlocked as ${editorName}` : 'Editor'}</MenuHeading>
              <MenuItem onClick={() => { close(); lockEditor(); }}>Lock the editor</MenuItem>
              {lessonId !== DEFAULT_LESSON.id && (
                <MenuItem danger onClick={() => { close(); setConfirmDelete({ busy: false }); }}>Delete this lesson…</MenuItem>
              )}
            </>
          )}
        </Menu>
      </header>

      {notice && (
        <div className={`px-4 py-1.5 text-sm flex justify-between ${notice.tone === 'error' ? 'bg-red-100 text-red-800' : notice.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* slides */}
        <aside data-help="slide-list" className={`w-56 shrink-0 p-2 border-r border-slate-300 bg-slate-50 min-h-0 ${leftOpen ? '' : 'hidden'}`}>
          <SlideList
            onOverview={() => setGridOpen(true)}
            onSplitTopic={askSplit}
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
        <main className="flex-1 min-w-0 flex flex-col" onPointerDown={() => ed.setSelected(null)}>
          {/* The slide's own toolbar: fold the sides, add to the slide, which version of it */}
          <div className="flex items-center gap-1 px-2 h-11 shrink-0 bg-white border-b border-slate-300" onPointerDown={(e) => e.stopPropagation()} data-canvas-toolbar>
            <button className={`${toolIcon} ${leftOpen ? '' : 'bg-slate-200'}`} onClick={() => toggleSide('left')} title={leftOpen ? 'Hide the slide list' : 'Show the slide list'} aria-label="Slide list" aria-pressed={leftOpen}><Icon name="panel-left" size={18} /></button>
            <span className="w-px h-6 bg-slate-300 mx-1" />
            <span className="text-xs font-semibold text-slate-500 mr-1 hidden xl:inline">Add</span>
            <div className="flex items-center gap-0.5" role="group" aria-label="Add to this slide" data-add-group>
              <button data-help="add-text" className={tool} onClick={addText}><Icon name="text" size={16} /> Text</button>
              <button data-help="add-image" className={tool} onClick={() => setPanel('images')}><Icon name="image" size={16} /> Picture</button>
              <Menu help="add-chart" className={tool} title="A chart or a diagram" label={<><Icon name="chart" size={16} /> Chart <Icon name="chevron-down" size={13} /></>} width="w-56">
                {(close) => VISUAL_KINDS.map(([k, name]) => <MenuItem key={k} onClick={() => { close(); addElement(visualTemplate(k)); }}>{name}</MenuItem>)}
              </Menu>
              <Menu help="hands-on" className={tool} label={handsOnBusy ? 'Making a hands-on slide…' : <><Icon name="hands-on-activity" size={16} /> Hands-on <Icon name="chevron-down" size={13} /></>} disabled={!!handsOnBusy} width="w-72">
                {(close) => (
                  <>
                    <MenuItem onClick={() => { close(); aiHandsOn(); }} hint="The AI makes a hands-on slide from what this slide teaches"><span className="text-violet-700"><Icon name="sparkle" size={14} /> Hands-on slide from this slide</span></MenuItem>
                    <MenuHeading>Add an example to edit</MenuHeading>
                    {ACTIVITY_KINDS.map(([k, name]) => <MenuItem key={k} onClick={() => { close(); addElement(activityTemplate(k)); }}>{name}</MenuItem>)}
                  </>
                )}
              </Menu>
            </div>
            <span className="w-px h-6 bg-slate-300 mx-1" />
            {/* The AI writes this slide again, as asked (violet: the AI's) */}
            <Menu help="rewrite" className={`${tool} !text-violet-800 hover:!bg-violet-50`} disabled={rewriteBusy} width="w-80" title="The AI writes this slide again, the way you ask"
              label={rewriteBusy ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-violet-200 border-t-violet-700 animate-spin" aria-hidden /> Rewriting…</> : <><Icon name="sparkle" size={16} /> Rewrite <Icon name="chevron-down" size={13} /></>}>
              {(close) => (
                <div data-rewrite-menu>
                  <MenuHeading>Rewrite this slide</MenuHeading>
                  {([
                    ['Make it simpler', 'Make this slide simpler: fewer and easier words, one idea at a time'],
                    ['Add an example', 'Add a concrete everyday example of what this slide teaches'],
                    ['Shorten the words', 'Shorten what is shown and what the professor says, keeping the main point'],
                    ['Make it more visual', 'Show this with a chart, a diagram or a picture instead of bullets, where it fits'],
                    ['Turn it into a question', 'Turn this slide into a hands-on box that asks the learner about what it teaches'],
                  ] as const).map(([name, ask]) => <MenuItem key={name} onClick={() => { close(); rewrite(ask); }}>{name}</MenuItem>)}
                  <form className="p-1.5 pt-2 mt-1 border-t border-slate-200 flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); if (rewriteText.trim()) { close(); rewrite(rewriteText); } }}>
                    <textarea value={rewriteText} onChange={(e) => setRewriteText(e.target.value)} maxLength={500} rows={2} placeholder="Or say what to change: “use a pizza for the example”, “add a bar chart of the three speeds”…"
                      className="w-full px-2 py-1.5 rounded-md border border-slate-300 text-sm text-slate-900 outline-none focus:border-violet-500" aria-label="What to change" />
                    <button className="self-end px-3 py-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-40" disabled={!rewriteText.trim()}>Rewrite</button>
                    <p className="text-xs text-slate-500">Ctrl+Z puts the old slide back.</p>
                  </form>
                </div>
              )}
            </Menu>
            <div className="flex-1" />
            <div data-help="layers" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs" role="tablist" aria-label="Which version">
              <button role="tab" aria-selected={ed.layer === 'main'} onClick={() => switchLayer('main')}
                className={`px-3 py-1.5 ${ed.layer === 'main' ? 'bg-slate-900 text-white font-semibold' : 'bg-white hover:bg-slate-100 text-slate-700'}`} title="The slide as learners first see it">Main</button>
              <button role="tab" aria-selected={ed.layer === 'helper'} onClick={() => switchLayer('helper')}
                className={`px-3 py-1.5 border-l border-slate-300 ${ed.layer === 'helper' ? 'bg-slate-900 text-white font-semibold' : 'bg-white hover:bg-slate-100 text-slate-700'}`}
                title={`What this slide turns into when a learner says they're lost${helperState === 'ai' ? ' (drafted by the AI)' : ''}`}>
                Helper{helperState === 'none' ? ' · none' : helperState === 'off' ? ' · off' : ''}
              </button>
            </div>
            {ed.layer === 'helper' && helperState !== 'none' && helperState !== 'off' && (
              <span className="flex items-center gap-2 text-xs text-slate-600 ml-1 whitespace-nowrap">
                <button className="underline" onClick={() => setMorphPreview(true)}>Preview the morph</button>
                <button className="underline" onClick={aiHelper} title="Throw this helper away; the AI drafts a new one when you save">Redo with AI</button>
                <button className="underline text-red-600" onClick={noHelper}>No helper</button>
              </span>
            )}
            <div className="flex-1" />
            <span className="text-xs text-slate-500 whitespace-nowrap" title={main?.topic || undefined}>Slide {slideIdx + 1} of {deck.slides.length}</span>
            <span className="w-px h-6 bg-slate-300 mx-1" />
            <button className={`${toolIcon} ${rightOpen ? '' : 'bg-slate-200'}`} onClick={() => toggleSide('right')} title={rightOpen ? 'Hide the side panel' : 'Show the side panel'} aria-label="Side panel" aria-pressed={rightOpen}><Icon name="panel-right" size={18} /></button>
          </div>
          <div ref={stage} className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden" data-stage>
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
          <div data-help="canvas" className="w-full flex justify-center" onPointerDown={(e) => e.stopPropagation()}>
            <EditCanvas
              width={fitW ? `${fitW}px` : undefined}
              onDuplicate={duplicateElement}
              onDelete={deleteElement}
              onLayer={layer}
              slide={slide}
              selected={ed.selected}
              onSelect={ed.setSelected}
              onChange={(id, patch, group) => ed.updateElement(id, patch, group)}
              onDropImage={(img, x, y) => addImage(img, x, y)}
              onEditText={() => { setPanel('props'); setTimeout(() => document.getElementById('inspector-text')?.focus(), 0); }}
              warnIds={warnIds}
              placing={placingMark !== null && element ? { elId: element.id, index: placingMark } : null}
              onPlace={(x, y) => {
                if (!element || placingMark === null) return;
                if (element.type === 'activity') {
                  // an explore spot (the hands-on box's own "Place")
                  const items = [...(element.items ?? [])];
                  if (items[placingMark]) items[placingMark] = { ...items[placingMark], x, y };
                  ed.updateElement(element.id, { items } as Partial<SlideElement>);
                  setPlacingMark(null);
                  return;
                }
                const marks = [...(element.pointers ?? [])];
                if (marks[placingMark]) marks[placingMark] = { ...marks[placingMark], x, y };
                ed.updateElement(element.id, { pointers: marks, pointersByAI: undefined });
                setPlacingMark(null);
              }}
            />
          </div>
          )}
          </div>
          {heat && <div className="shrink-0 px-4 pb-2 flex justify-center" onPointerDown={(e) => e.stopPropagation()}><SlideStatsPanel stats={heat[main.id]} days={HEAT_DAYS} onClose={() => setHeat(null)} all={heat} slides={deck.slides} current={main.id} onGo={(i) => goToRepeat(i)} /></div>}
          {morphPreview !== null && main && (
            <div className="fixed inset-0 z-50 bg-slate-950/70 flex flex-col items-center justify-center gap-3 p-6" onPointerDown={(e) => { e.stopPropagation(); setMorphPreview(null); }} role="dialog" aria-label="Morph preview">
              <SlideCanvas slide={morphPreview ? helperView(main) : main} morph width="min(80vw, calc(75vh * 16 / 9))" />
              <p className="text-sm text-white/80">{morphPreview ? 'Helper (when lost)' : 'Main slide'} · loops until you click</p>
            </div>
          )}
          {/* What learners see now, against this draft (was: a line in the top row); the keys, a hover away */}
          <div className="shrink-0 flex items-center gap-3 px-3 h-8 bg-white border-t border-slate-300 text-xs text-slate-600" onPointerDown={(e) => e.stopPropagation()} data-help="live" data-live-strip>
            {live === undefined ? <span /> : live ? (
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">Learners see {live.savedAs ? <b className="text-slate-900">“{live.savedAs}”</b> : 'the published lesson'}, published {when(live.at)}{live.by ? ` by ${live.by}` : ''}</span>
                {(ed.dirty || (saved.at && live.at && saved.at > live.at)) && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold whitespace-nowrap" data-unpublished>Your changes since then are not published</span>}
                <button className="underline whitespace-nowrap" onClick={unpublish}>take down</button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />Not published yet: learners get the AI-made lesson</span>
            )}
            <span className="flex-1" />
            <span className="relative group cursor-help underline decoration-dotted whitespace-nowrap">Keys and marks
              <span className="hidden group-hover:block absolute right-0 bottom-full mb-1 z-40 w-72 whitespace-normal rounded-md border border-slate-300 bg-white shadow-xl p-3 text-xs leading-relaxed text-slate-700 no-underline">
                <b>Drag</b> to move, <b>corners</b> to resize<br /><b>Arrows</b> nudge (Shift: more)<br /><b>Del</b> removes the box, <b>Ctrl+D</b> copies it<br /><b>Ctrl+Z</b> undo, <b>Ctrl+S</b> save<br /><b>PageUp / PageDown</b>: the slide before or after<br />
                <span className="text-violet-700">Dashed purple “AI” on a box: its words were written by the AI</span><br />
                <span className="text-amber-700">Amber on a slide or box: something to check</span>
              </span>
            </span>
          </div>
        </main>

        {/* properties / images */}
        <aside className={`w-80 shrink-0 border-l border-slate-300 bg-white flex flex-col min-h-0 ${rightOpen ? '' : 'hidden'}`}>
          {/* Three tabs: the selected thing, pictures, and the lesson's checks in one place (was five) */}
          {panel === 'lesson' ? (
            // The lesson's settings take the panel over: named, with the way back
            <div className="flex items-center justify-between px-3 h-11 border-b border-slate-300" data-panel-title>
              <span className="font-bold flex items-center gap-2"><Icon name="settings" size={17} /> Lesson settings</span>
              <button className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center" onClick={() => setPanel('props')} aria-label="Close" title="Close"><Icon name="close" size={16} /></button>
            </div>
          ) : (
          <div className="flex border-b border-slate-300 text-sm h-11" role="tablist">
            {([
              ['props', 'pencil', 'Edit', 'The selected box, or the slide'],
              ['images', 'image', 'Pictures', 'Your library, free pictures and uploads'],
              ['check', 'checklist', 'Review', 'Everything to look at before publishing: facts, pictures, repeats, the idea map'],
            ] as [Panel, IconName, string, string][]).map(([id, icon, name, hint]) => {
              const on = panel === id || (id === 'images' && panel === 'background') || (id === 'check' && inReview);
              const badge = id === 'check' ? checkBadge : 0;
              return (
                <button key={id} data-help={`tab-${id === 'props' ? 'edit' : id}`} role="tab" aria-selected={on} title={hint} onClick={() => setPanel(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 border-b-2 -mb-px ${on ? 'font-bold border-slate-900 text-slate-950' : 'border-transparent font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
                  <Icon name={icon} size={16} />
                  {name}
                  {badge > 0 && <span className="min-w-5 px-1 rounded-full bg-amber-400 text-xs font-bold text-slate-900 leading-5" aria-label={`${badge} to look at`}>{badge}</span>}
                </button>
              );
            })}
          </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {/* Review: the list of what to look at, then the three checks it's made of */}
            {inReview && (
              <div className="mb-3 flex flex-col gap-2" data-review>
                {review && (() => {
                  const r = review;
                  const rows: [tone: 'ok' | 'warn' | 'bad', text: string, act?: () => void][] = [
                    r.warnings ? ['warn', `${r.warnings} layout warning${r.warnings === 1 ? '' : 's'} on the slides`, () => { const i = allWarnings.findIndex((w) => w.some((x) => x.level === 'warn')); if (i >= 0) goToRepeat(i); setPanel('props'); }] : ['ok', 'No layout warnings'],
                    r.pictures ? ['warn', `${r.pictures} picture${r.pictures === 1 ? '' : 's'} without a description`, describeAllPictures] : ['ok', 'Every picture has a description'],
                    r.answers.flagged ? ['bad', `${r.answers.flagged} hands-on box${r.answers.flagged === 1 ? '' : 'es'} with answers to check`, () => { const is = (e: SlideElement) => e.type === 'activity' && answerState(e) === 'flagged'; const i = deck.slides.findIndex((sl) => sl.elements.some(is)); if (i >= 0) { goToRepeat(i, deck.slides[i].elements.find(is)?.id); setPanel('props'); } }] : r.answers.unchecked ? ['warn', `${r.answers.unchecked} hands-on box${r.answers.unchecked === 1 ? '' : 'es'} not checked yet (checked when you save)`] : ['ok', 'Hands-on answers checked'],
                    r.factsOpen.bad || r.factsOpen.missing ? [r.factsOpen.bad ? 'bad' : 'warn', `${r.factsOpen.bad + r.factsOpen.missing} fact${r.factsOpen.bad + r.factsOpen.missing === 1 ? '' : 's'} the sources don’t back up`, () => setPanel('check')] : r.factsToCheck ? ['warn', `${r.factsToCheck} slide${r.factsToCheck === 1 ? '' : 's'} not fact-checked since ${r.factsToCheck === 1 ? 'it' : 'they'} changed`, () => { setPanel('check'); setFactRun((n) => n + 1); }] : ['ok', 'Facts checked on every slide'],
                    r.orderMoves ? ['warn', `${r.orderMoves} suggested move${r.orderMoves === 1 ? '' : 's'} for the story order`, () => setPanel('check')] : ['ok', 'Slides are in story order'],
                    r.repeats ? ['warn', `${r.repeats} possible repeat${r.repeats === 1 ? '' : 's'} across topics`, () => setPanel('repeats')] : r.repeatsAi !== 'ok' ? ['warn', r.repeatsAi === 'none' ? 'Not checked for repeats with the AI yet' : 'Changed since the last AI repeat check', () => { setPanel('repeats'); setRepeatRun((n) => n + 1); }] : ['ok', 'No repeats found'],
                    longDashes ? ['warn', `${longDashes} long dash${longDashes === 1 ? '' : 'es'} in the words (click to remove)`, removeLongDashes] : ['ok', 'No long dashes'],
                    todoHere ? ['warn', `${todoHere} to write or record (click to save and start)`, () => save()] : ['ok', 'Words and audio ready'],
                  ];
                  const left = rows.filter(([t]) => t !== 'ok').length;
                  return (
                    <div className="rounded-lg border border-slate-300 overflow-hidden" data-review-list>
                      <div className={`px-3 py-2 text-sm font-bold ${left ? 'bg-amber-50 text-amber-950' : 'bg-emerald-50 text-emerald-900'}`}>{left ? `${left} thing${left === 1 ? '' : 's'} to look at before publishing` : 'Ready to publish'}</div>
                      <ul className="divide-y divide-slate-200 text-sm">
                        {rows.map(([tone, text, act]) => (
                          <li key={text}>
                            <button disabled={!act} onClick={act} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${act ? 'hover:bg-slate-50' : 'cursor-default'}`}>
                              <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'}`}><Icon name={tone === 'ok' ? 'check-mark' : 'warning'} size={12} /></span>
                              <span className={`flex-1 ${tone === 'ok' ? 'text-slate-500' : 'text-slate-900 font-medium'}`}>{text}</span>
                              {act && <Icon name="chevron-right" size={14} className="text-slate-400" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-semibold" role="tablist" aria-label="Which check">
                  {([['check', 'Facts and pictures', 'tab-check2'], ['repeats', 'Repeats', 'tab-repeats'], ['ideas', 'Idea map', 'tab-ideas']] as [Panel, string, string][]).map(([id, name, help], i) => (
                    <button key={id} role="tab" aria-selected={panel === id} data-help={help} onClick={() => setPanel(id)}
                      className={`flex-1 py-1.5 ${i ? 'border-l border-slate-300' : ''} ${panel === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>{name}</button>
                  ))}
                </div>
              </div>
            )}
            {/* kept mounted, so its results stay while you edit (and switch tabs) */}
            <div className={panel === 'repeats' ? '' : 'hidden'}>
              <RepeatsPanel deck={deck} active={panel === 'repeats'} runSignal={repeatRun} onAccept={acceptRepeat} onGoTo={goToRepeat}
                onChecked={(from, found, slides) => ed.annotate((d) => { d.checks = { ...d.checks, repeats: { from, at: new Date().toISOString(), found, slides } }; })}
                onSkip={(key) => ed.annotate((d) => { d.checks = { ...d.checks, repeatSkips: [...new Set([...(d.checks?.repeatSkips ?? []), key])] }; })} />
            </div>
            {panel === 'ideas' && (
              <ConceptsPanel deck={deck} onGoTo={(i) => ed.setSlideIdx(i)}
                onChange={(fn, group) => ed.change((d) => { d.concepts ??= { ideas: [], questions: {} }; d.concepts.ideas ??= []; d.concepts.questions ??= {}; for (const i of d.concepts.ideas) i.needs ??= []; fn(d.concepts); }, group)}
                onDraft={(c) => ed.change((d) => { d.concepts = c; })} />
            )}
            {/* kept mounted too: each slide's results stay */}
            <div className={panel === 'check' ? '' : 'hidden'}>
              <CheckPanel deck={deck} slideIndex={slideIdx} lessonTitle={deck.title} active={panel === 'check'} runSignal={factRun} describeSignal={describeRun}
                onRecord={recordFacts} onFine={markFine} onUseThis={applyFix} onDescribed={fillDescriptions}
                onGoTo={(id) => { if (ed.layer !== 'main') ed.setLayer('main'); ed.setSelected(id); }} onGoToSlide={(i) => goToRepeat(i)}
                onMoves={makeMoves} onSkipMove={skipMove} onAddPictures={addPictures} onSkipPictures={skipPictures}
                onRecheckPictures={(slideId) => { ed.change((d) => {
                  const rest = { ...d.checks?.pictures };
                  delete rest[slideId];
                  d.checks = { ...d.checks, pictures: rest };
                }); flash('This slide’s pictures are checked again when you save'); }} />
            </div>
            {panel === 'lesson' && (
              <LessonPanel deck={deck} onChange={(profile, group) => ed.change((d) => { d.profile = profile; }, group)} />
            )}
            {panel === 'repeats' || panel === 'check' || panel === 'ideas' || panel === 'lesson' ? null : panel === 'props' ? (
              element ? (
                <ElementInspector
                  el={element}
                  order={element.silent ? null : order.findIndex((e) => e.id === element.id) + 1 || null}
                  update={(patch) => ed.updateElement(element.id, patch)}
                  warnings={slideWarns.filter((w) => w.elementId === element.id)}
                  placing={placingMark}
                  onPlacePointer={setPlacingMark}
                  about={{ lessonTitle: deck.title, topic: slide.topic }}
                />
              ) : (
                <SlideInspector
                  slide={slide}
                  update={(p) => ed.updateSlide(p)}
                  warnings={slideWarns}
                  onPickBackground={() => setPanel('background')}
                  recap={deck.recap}
                  recapByAI={deck.recapByAI}
                  topicStart={ed.layer !== 'helper' && startsTopic(deck.slides, slideIdx)}
                  onRecap={(text) => ed.change((d) => { d.recap = text || undefined; d.recapByAI = undefined; }, 'deck:recap')}
                  quiz={deck.quiz}
                  quizStale={!!deck.quiz && deck.quiz.from !== quizBasis(deck)}
                  onQuiz={(change) => ed.change((d) => { d.quiz = change(d.quiz ? structuredClone(d.quiz) : undefined); })}
                  bank={deck.bank}
                  bankPending={needsBank(deck)}
                  slides={deck.slides}
                  onBank={(change) => ed.change((d) => { d.bank = change(d.bank ? structuredClone(d.bank) : undefined); }, 'deck:bank')}
                  onGrowMedia={() => {
                    // the layer being edited (the slide, or its helper): each box takes its grown place
                    const grown = new Map(growMedia(slide).elements.map((e) => [e.id, e]));
                    ed.change((d) => {
                      const s = d.slides[slideIdx];
                      for (const el of (ed.layer === 'helper' ? s?.helper?.elements : s?.elements) ?? []) {
                        const g = grown.get(el.id);
                        if (g) Object.assign(el, { x: g.x, y: g.y, w: g.w, h: g.h });
                      }
                    });
                  }}
                />
              )
            ) : (
              <ImageLibrary
                lesson={deck.lessonId}
                kb={profileOf(deck).knowledgeBases[0]}
                onSuggestPlaces={() => {
                  // (every slide's picture check is forgotten: the next save looks at them all again, with the library as it is now)
                  ed.change((d) => { d.checks = { ...d.checks, pictures: {} }; });
                  flash('Press Save: the AI looks at every slide for pictures from the library. Its suggestions come up in the Review tab.');
                }}
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

      {gridOpen && <SlideGrid slides={deck.slides} current={slideIdx} warnCounts={allWarnings.map((w) => w.filter((x) => x.level === 'warn').length)}
        onOpen={(i) => { ed.setSlideIdx(i); ed.setSelected(null); }} onMove={moveSlide} onClose={() => setGridOpen(false)} />}

      {/* Download as a PDF: its choices (was a menu of its own in the toolbar) */}
      {pdfAsk && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" role="dialog" aria-label="Download as a PDF" onPointerDown={() => setPdfAsk(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-5 text-sm text-slate-800 flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()} data-help="pdf">
            <h2 className="text-lg font-bold text-slate-900">Download as a PDF</h2>
            <div className="flex flex-col gap-2" aria-label="PDF options">
              <label className="flex items-start gap-2">
                <input type="radio" name="pdf-kind" className="mt-1" checked={pdfOpts.kind === 'script'} onChange={() => setPdfOpts((o) => ({ ...o, kind: 'script' }))} />
                <span><b>Teacher script</b><br /><span className="text-xs text-slate-500">One slide per page, each part with what the professor says</span></span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="pdf-kind" className="mt-1" checked={pdfOpts.kind === 'handout'} onChange={() => setPdfOpts((o) => ({ ...o, kind: 'handout' }))} />
                <span><b>Handout</b><br /><span className="text-xs text-slate-500">Just the slides, two per page, for learners</span></span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="pdf-kind" className="mt-1" checked={pdfOpts.kind === 'narration'} onChange={() => setPdfOpts((o) => ({ ...o, kind: 'narration' }))} />
                <span><b>Narration only</b><br /><span className="text-xs text-slate-500">Just what the professor says, in order: no pictures</span></span>
              </label>
              <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                <label className={`flex items-center gap-2 text-xs ${pdfOpts.kind === 'handout' ? 'opacity-40' : ''}`}>
                  <input type="checkbox" disabled={pdfOpts.kind === 'handout'} checked={pdfOpts.helpers && pdfOpts.kind !== 'handout'} onChange={(e) => setPdfOpts((o) => ({ ...o, helpers: e.target.checked }))} />
                  Helper slides (after each slide)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={pdfOpts.sources} onChange={(e) => setPdfOpts((o) => ({ ...o, sources: e.target.checked }))} />
                  Sources page at the end
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btn} onClick={() => setPdfAsk(false)}>Cancel</button>
              <button className={primary} onClick={() => { setPdfAsk(false); downloadPdf(); }}>Download</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish? A checklist of what's been checked (remembered with the lesson: only what changed needs another look) */}
      {publishAsk && (() => {
        const a = publishAsk;
        const go = (tab: 'repeats' | 'check', run?: 'repeats' | 'facts') => {
          setPublishAsk(null);
          setPanel(tab);
          if (run === 'repeats') setRepeatRun((n) => n + 1);
          if (run === 'facts') setFactRun((n) => n + 1);
        };
        const row = (tone: 'ok' | 'warn' | 'bad', _icon: string, text: React.ReactNode, action?: React.ReactNode) => (
          <li className={`flex items-start gap-2 rounded-md px-3 py-2 border ${tone === 'ok' ? 'bg-emerald-50 border-emerald-200' : tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${tone === 'ok' ? 'bg-emerald-200 text-emerald-800' : tone === 'warn' ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'}`}><Icon name={tone === 'ok' ? 'check-mark' : 'warning'} size={12} /></span><span className="flex-1">{text}</span>{action}
          </li>
        );
        const link = (label: string, onClick: () => void) => <button className="underline shrink-0" onClick={onClick}>{label}</button>;
        // The first hands-on box in that state, selected (on the helper if that's where it is)
        const showBox = (state: 'flagged' | 'fixed') => {
          setPublishAsk(null);
          const is = (e: SlideElement) => e.type === 'activity' && answerState(e) === state;
          const i = deck.slides.findIndex((sl) => [...sl.elements, ...(sl.helper?.elements ?? [])].some(is));
          if (i < 0) return;
          const sl = deck.slides[i];
          const onMain = sl.elements.find(is);
          if (onMain) return goToRepeat(i, onMain.id);
          ed.setSlideIdx(i);
          ed.setLayer('helper');
          ed.setSelected(sl.helper?.elements.find(is)?.id ?? null);
        };
        const issues = a.orderMoves + a.answers.flagged + a.answers.fixed + a.warnings + a.repeats + (a.repeatsAi !== 'ok' ? 1 : 0) + a.factsToCheck + a.factsOpen.bad + a.factsOpen.missing + a.pictures;
        return (
          <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={() => setPublishAsk(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4" role="alertdialog" aria-labelledby="publish-title" onClick={(e) => e.stopPropagation()}>
              <h2 id="publish-title" className="font-bold text-lg">Publish this lesson?</h2>
              <p className="text-sm text-slate-600">Learners will see this deck instead of the AI lesson. Checks you&apos;ve already done are remembered: only what changed since needs another look.</p>
              <ul className="text-sm flex flex-col gap-2">
                {a.warnings > 0
                  ? row('warn', '⚠', <>{a.warnings === 1 ? '1 warning' : `${a.warnings} warnings`} on the slides (marked ⚠)</>)
                  : row('ok', '✓', 'No layout warnings')}
                {a.pictures > 0 && row('warn', '', <>{a.pictures} picture{a.pictures === 1 ? '' : 's'} without a description</>, link('Describe', () => go('check')))}
                {a.answers.flagged > 0
                  ? row('bad', '⚠', <>{a.answers.flagged} hands-on box{a.answers.flagged === 1 ? '' : 'es'} with answers the knowledge base doesn&apos;t back up (marked ⚠ Check answers)</>, link('Show', () => showBox('flagged')))
                  : a.answers.unchecked > 0
                    ? row('warn', '', <>{a.answers.unchecked} hands-on box{a.answers.unchecked === 1 ? '' : 'es'} not checked yet: the answers are checked against the knowledge base as you publish</>)
                    : row('ok', '✓', 'Hands-on answers checked against the knowledge base')}
                {a.answers.fixed > 0 && row('warn', '', <>The AI fixed the answers in {a.answers.fixed} hands-on box{a.answers.fixed === 1 ? '' : 'es'} (marked ✓ AI fixed answers): have a look</>, link('Show', () => showBox('fixed')))}
                {a.orderMoves > 0 && row('warn', '', <>{a.orderMoves} suggested move{a.orderMoves === 1 ? '' : 's'} to put the slides in story order</>, link('Review', () => go('check')))}
                {a.factsToCheck > 0
                  ? row('warn', '', <>{a.factsToCheck} slide{a.factsToCheck === 1 ? '' : 's'} not fact-checked since {a.factsToCheck === 1 ? 'it' : 'they'} changed</>, link('Check now', () => go('check', 'facts')))
                  : row('ok', '✓', 'Facts checked on every slide')}
                {(a.factsOpen.bad > 0 || a.factsOpen.missing > 0) && row(a.factsOpen.bad ? 'bad' : 'warn', a.factsOpen.bad ? '' : '',
                  <>{a.factsOpen.bad ? `${a.factsOpen.bad} fact${a.factsOpen.bad === 1 ? '' : 's'} the sources disagree with` : ''}{a.factsOpen.bad && a.factsOpen.missing ? ', ' : ''}{a.factsOpen.missing ? `${a.factsOpen.missing} not found in the sources` : ''}</>,
                  link('Review', () => go('check')))}
                {a.repeats > 0 && row('warn', '', <>{a.repeats === 1 ? '1 possible repeat' : `${a.repeats} possible repeats`}: the same words on screen in two topics</>, link('Review', () => go('repeats')))}
                {a.repeatsAi === 'ok'
                  ? row('ok', '✓', 'Checked for repeats with the AI, nothing changed since')
                  : row('warn', '', a.repeatsAi === 'none' ? 'Not checked for repeats with the AI yet' : 'Changed since the last AI repeat check', link('Check now', () => go('repeats', 'repeats')))}
              </ul>
              <label className="flex flex-col gap-1 text-sm" data-publish-name>
                <span className="font-semibold text-slate-800">Save this version as</span>
                <input value={publishName} maxLength={60} onChange={(e) => setPublishName(e.target.value)} placeholder="A name for this version"
                  className={`px-3 py-2 rounded-md border outline-none ${nameCheck === 'taken' || nameCheck === 'bad' ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-cyan-500'}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nameCheck === 'ok') { setPublishAsk(null); publishNow(false, publishName.trim()); } }} />
                <span className={`text-xs ${nameCheck === 'taken' || nameCheck === 'bad' ? 'text-red-700' : 'text-slate-500'}`} role="status">
                  {nameCheck === 'taken' ? 'That name is already used: pick another.'
                    : nameCheck === 'bad' ? 'Give it a name (letters or numbers, up to 60 characters).'
                      : nameCheck === 'checking' ? 'Checking the name…'
                        : 'You can load it again later (More ▾ → Saved versions).'}
                </span>
              </label>
              <div className="flex gap-2 justify-end">
                <button className={btn} onClick={() => setPublishAsk(null)}>Cancel</button>
                <button className={primary} disabled={nameCheck !== 'ok'} onClick={() => { setPublishAsk(null); publishNow(false, publishName.trim()); }}>{issues ? 'Publish anyway' : 'Publish'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Split this topic? */}
      {splitAsk && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6" onClick={() => setSplitAsk(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-3" role="dialog" aria-labelledby="split-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="split-title" className="font-bold text-lg">Split “{deck.slides[splitAsk.start]?.topic || 'this topic'}”</h2>
            {splitAsk.busy && <p className="text-sm text-slate-600" role="status">Finding the best place to split it…</p>}
            {splitAsk.error && <p className="text-sm text-red-700">{splitAsk.error}</p>}
            {splitAsk.split && (() => {
              const sp = splitAsk.split;
              const old = (deck.slides[splitAsk.start]?.topic ?? '').trim().toLowerCase();
              let end = splitAsk.start;
              while (end + 1 < deck.slides.length && (deck.slides[end + 1].topic ?? '').trim().toLowerCase() === old) end++;
              return (
                <>
                  <ol className="text-sm flex flex-col gap-1.5">
                    <li className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2"><b>{sp.first}</b> <span className="text-slate-500">· slides {splitAsk.start + 1}{sp.splitAt - 1 > splitAsk.start ? `–${sp.splitAt}` : ''}</span></li>
                    <li className="rounded-md bg-cyan-50 border border-cyan-200 px-3 py-2"><b>{sp.second}</b> <span className="text-slate-500">· slides {sp.splitAt + 1}{end > sp.splitAt ? `–${end + 1}` : ''} (new topic)</span></li>
                  </ol>
                  {sp.why && <p className="text-xs text-slate-500">{sp.why}</p>}
                  <p className="text-xs text-slate-500">You can rename either afterwards (the Topic box on a slide). The new topic gets its introduction written when you save.</p>
                </>
              );
            })()}
            <div className="flex gap-2 justify-end">
              <button className={btn} onClick={() => setSplitAsk(null)}>Cancel</button>
              <button className={primary} disabled={!splitAsk.split} onClick={doSplit}>Split</button>
            </div>
          </div>
        </div>
      )}

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

      {pullOpen && (
        <PullFromOriginal source={STUDY_SOURCE} sourceTitle={lessons.find((l) => l.id === STUDY_SOURCE)?.title ?? STUDY_SOURCE} deck={deck}
          onClose={() => setPullOpen(false)}
          onPull={(original, ids) => {
            ed.change((d) => { d.slides = pullSlides(original, d.slides, ids); });
            setPullOpen(false); ed.setSelected(null);
            flash(`Pulled ${ids.size} slide${ids.size === 1 ? '' : 's'} from the original (Ctrl+Z undoes it). Save to write their helpers again, from this lesson’s slides.`);
          }} />
      )}

      {savedOpen && (
        <SavedVersions lessonId={lessonId} slideNumber={slideIdx + 1} onClose={() => setSavedOpen(false)}
          onReplace={(saved, name) => {
            ed.change((draft) => {
              draft.slides = structuredClone(saved.slides);
              draft.recap = saved.recap; draft.recapByAI = saved.recapByAI; draft.quiz = saved.quiz;
              draft.basedOn = undefined;
            });
            ed.setSlideIdx(0); ed.setSelected(null); setSavedOpen(false);
            flash(`The draft is now “${name}” (${saved.slides.length} slides). Ctrl+Z undoes it; press Save to keep it.`);
          }}
          onCopySlide={(sl, name) => {
            ed.change((d) => { d.slides.splice(slideIdx + 1, 0, cloneSlide(sl)); });
            ed.setSlideIdx(slideIdx + 1); ed.setSelected(null);
            flash(`Copied a slide from “${name}” after slide ${slideIdx + 1} (Ctrl+Z undoes it)`);
          }} />
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
              {aiDeck && !aiGen && (aiDeck.todo ?? 0) > 0 && (
                <button className={btn} onClick={recordAiAudio} title="The audio (and the rest the AI fills in) was cut short: carry on from where it stopped">
                  Finish the audio ({aiDeck.todo} left)
                </button>
              )}
              <button className={primary} onClick={generateAi} disabled={!!aiGen}>
                {aiGen?.phase === 'writing' ? 'Writing the slides… (a few minutes)'
                  : aiGen?.phase === 'audio' ? `Recording audio…${aiGen.remaining ? ` ${aiGen.remaining} left` : ''}`
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
