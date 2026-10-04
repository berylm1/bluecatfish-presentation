'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { camDebug, camDebugOn } from '@/lib/camDebug';
import { acquireCamera, releaseCamera } from '@/lib/sharedCamera';

/*
 * What the camera sees, in a circle in the bottom-right corner, with a
 * coloured ring for what the camera makes of it:
 *
 *   yellow  hand raised (a partial yellow ring while it's going up)
 *   orange  looks puzzled
 *   violet  gone quiet (flat face for a while)
 *   red     away (no face)
 *   green   here, watching
 *   blue    getting to know the learner's normal face (the first ~10 s)
 *   grey    starting up / camera or detection problem
 *
 * The circle sizes itself to the empty corner: it never covers the slide or
 * anything else marked data-bubble-avoid (the buttons). The picture is only
 * shown here, never recorded or sent anywhere.
 */

export type CameraSees = 'starting' | 'learning' | 'error' | 'hand' | 'away' | 'confused' | 'bored' | 'here';

const LOOK: Record<CameraSees | 'nocam', { ring: string; label: string }> = {
  hand: { ring: '#facc15', label: '✋ hand up' },
  confused: { ring: '#fb923c', label: '😕 puzzled?' },
  bored: { ring: '#a78bfa', label: '😐 gone quiet' },
  away: { ring: '#f87171', label: '🚫 away' },
  here: { ring: '#34d399', label: '🙂 watching' },
  starting: { ring: '#94a3b8', label: 'starting…' },
  learning: { ring: '#38bdf8', label: '👀 getting to know you…' },
  error: { ring: '#94a3b8', label: '⚠ detection off' },   // the picture works, the face/hand models didn't load
  nocam: { ring: '#94a3b8', label: '⚠ no camera' },
};

const MAX = 140;     // largest circle (px)
const MIN = 56;      // smallest
const EDGE = 12;     // gap to the window edge
const GAP = 10;      // gap to the slide / buttons
const RING = 5;      // ring thickness
const LABEL = 12;    // room above the circle for its label

/**
 * The largest circle on the right that stays clear of every data-bubble-avoid
 * box (the slide, the buttons, the transcript). Tries the bottom-right corner
 * and the strip beside the slide (level with its bottom), and takes whichever
 * fits the bigger circle.
 */
function fitPlace(): { d: number; top: number } {
  const w = window.innerWidth, h = window.innerHeight;
  const els = [...document.querySelectorAll('[data-bubble-avoid]')];
  const boxes = els.map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
  const slide = document.querySelector('[data-bubble-slide]')?.getBoundingClientRect();
  const clear = (left: number, top: number, d: number) =>
    top >= EDGE + LABEL && top + d <= h - EDGE &&
    boxes.every((b) => b.right + GAP <= left || b.left - GAP >= left + d || b.bottom + GAP <= top || b.top - GAP >= top + d);
  const most = Math.max(MIN, Math.min(MAX, Math.round(Math.min(w, h) * 0.22)));   // small screens, smaller circle
  for (let d = most; d >= MIN; d -= 4) {
    const left = w - EDGE - d;
    const tops = [h - EDGE - d, ...(slide ? [Math.min(h - EDGE - d, slide.bottom - d)] : [])];
    for (const top of tops) if (clear(left, top, d)) return { d, top };
  }
  return { d: MIN, top: h - EDGE - MIN };
}

export default function CameraBubble({ sees, progress = 0 }: { sees: CameraSees; progress?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [place, setPlace] = useState<{ d: number; top: number } | null>(null);
  const size = place?.d ?? MIN;
  const [camError, setCamError] = useState(false);

  // The shared camera feed (lib/sharedCamera.ts), the same one the detectors watch
  useEffect(() => {
    let stopped = false;
    acquireCamera()
      .then((s) => {
        if (stopped) return;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setCamError(true));
    return () => { stopped = true; releaseCamera(); };
  }, []);

  // Fit the corner now, when the window changes, and every half second (boxes
  // like the question-and-answer panel come and go)
  useLayoutEffect(() => {
    const refit = () => setPlace((p) => { const n = fitPlace(); return p && p.d === n.d && p.top === n.top ? p : n; });
    refit();
    window.addEventListener('resize', refit);
    const t = setInterval(refit, 500);
    return () => { window.removeEventListener('resize', refit); clearInterval(t); };
  }, []);

  // ?camDebug=1: what each detector sees, next to the circle
  const [debug, setDebug] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!camDebugOn()) return;
    const t = setInterval(() => setDebug({ ...camDebug }), 250);
    return () => clearInterval(t);
  }, []);

  const state: CameraSees | 'nocam' = camError ? 'nocam' : sees;
  const look = LOOK[state];
  // Hand going up: a yellow arc fills round the ring as the raise gets closer to counting
  const raising = state !== 'hand' && progress > 0.15;
  const ring = raising
    ? `conic-gradient(${LOOK.hand.ring} ${Math.round(progress * 360)}deg, ${look.ring} 0deg)`
    : look.ring;

  return (
    <div
      className="fixed z-30 flex flex-col items-center pointer-events-none select-none"
      style={{ right: EDGE, top: place?.top ?? undefined, bottom: place ? undefined : EDGE, width: size }}
      aria-label={`Camera: ${raising ? 'hand going up' : look.label}`}
      role="status"
    >
      <div
        className="rounded-full shadow-xl transition-[background] duration-300"
        style={{ width: size, height: size, padding: RING, background: ring }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full rounded-full object-cover bg-slate-800"
          style={{ transform: 'scaleX(-1)' }}   // mirrored, like a mirror
        />
      </div>
      <span
        className="absolute -top-2 right-0 px-2 py-0.5 rounded-full text-[10px] font-semibold text-slate-900 whitespace-nowrap shadow"
        style={{ background: raising ? LOOK.hand.ring : look.ring }}
      >
        {raising ? '✋ hand going up…' : look.label}
      </span>
      {debug && (
        <div className="absolute right-full bottom-0 mr-2 w-80 rounded-lg bg-black/85 text-[11px] leading-snug text-white p-2 font-mono space-y-1">
          <div>ring: <b>{raising ? `hand going up ${Math.round(progress * 100)}%` : state}</b></div>
          <div>✋ {debug.hand ?? '(hand detector not running)'}</div>
          <div>👤 {debug.face ?? '(face finder not running)'}</div>
          <div>🙂 {debug.mood ?? '(expression reader not running)'}</div>
        </div>
      )}
    </div>
  );
}
