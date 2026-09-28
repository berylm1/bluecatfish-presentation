'use client';

import { useCallback, useRef, useState } from 'react';
import type { Deck, Slide, SlideElement } from '@/lib/canvas/types';

// The deck being edited, with undo/redo. Typing and dragging are grouped:
// changes with the same `group` in quick succession make one undo step.

const HISTORY_LIMIT = 100;
const GROUP_MS = 1200;

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankSlide(topic?: string): Slide {
  return {
    id: newId('s'),
    topic,
    background: { color: '#ffffff' },
    elements: [
      { id: newId('el'), type: 'text', x: 5, y: 5, w: 90, h: 13, text: 'New slide', style: 'title', color: '#0b3b5c', silent: true },
    ],
  };
}

export function blankDeck(lessonId: string, title: string): Deck {
  return { lessonId, title, source: 'hand', slides: [blankSlide()] };
}

/** A copy with fresh ids, for duplicating. */
export function cloneSlide(slide: Slide): Slide {
  const copy: Slide = structuredClone(slide);
  copy.id = newId('s');
  copy.elements = copy.elements.map((e) => ({ ...e, id: newId('el') }));
  return copy;
}

export function useEditorDeck(initial: Deck) {
  const [deck, setDeck] = useState<Deck>(initial);
  const [slideIdx, setSlideIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const past = useRef<Deck[]>([]);
  const future = useRef<Deck[]>([]);
  const lastGroup = useRef<{ key: string; at: number } | null>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;

  /** Apply a change. `group` merges quick repeats (typing, dragging) into one undo step. */
  const change = useCallback((fn: (d: Deck) => void, group?: string) => {
    const now = Date.now();
    const merge = group && lastGroup.current?.key === group && now - lastGroup.current.at < GROUP_MS;
    if (!merge) {
      past.current.push(deckRef.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
    }
    lastGroup.current = group ? { key: group, at: now } : null;
    const next = structuredClone(deckRef.current);
    fn(next);
    deckRef.current = next;
    setDeck(next);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(deckRef.current);
    lastGroup.current = null;
    deckRef.current = prev;
    setDeck(prev);
    setDirty(true);
    setSlideIdx((i) => Math.min(i, prev.slides.length - 1));
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(deckRef.current);
    lastGroup.current = null;
    deckRef.current = next;
    setDeck(next);
    setDirty(true);
    setSlideIdx((i) => Math.min(i, next.slides.length - 1));
  }, []);

  /** Replace everything (loading a lesson, Start from AI). */
  const reset = useCallback((d: Deck, markDirty = false) => {
    past.current = [];
    future.current = [];
    lastGroup.current = null;
    deckRef.current = d;
    setDeck(d);
    setSlideIdx(0);
    setSelected(null);
    setDirty(markDirty);
  }, []);

  const slide = deck.slides[Math.min(slideIdx, deck.slides.length - 1)];
  const element: SlideElement | null = slide?.elements.find((e) => e.id === selected) ?? null;

  /** Change the selected element (or any element on the current slide by id). */
  const updateElement = useCallback((id: string, patch: Partial<SlideElement>, group?: string) => {
    change((d) => {
      const s = d.slides[Math.min(slideIdx, d.slides.length - 1)];
      const el = s.elements.find((e) => e.id === id);
      if (el) Object.assign(el, patch);
    }, group ?? `el:${id}:${Object.keys(patch).join(',')}`);
  }, [change, slideIdx]);

  const updateSlide = useCallback((patch: Partial<Slide>, group?: string) => {
    change((d) => {
      Object.assign(d.slides[Math.min(slideIdx, d.slides.length - 1)], patch);
    }, group ?? `slide:${slideIdx}:${Object.keys(patch).join(',')}`);
  }, [change, slideIdx]);

  return {
    deck, slide, slideIdx, setSlideIdx, element, selected, setSelected,
    dirty, setDirty, change, undo, redo, reset, updateElement, updateSlide,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
