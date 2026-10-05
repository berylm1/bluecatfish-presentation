'use client';

/**
 * Emotion watcher — Phase C: the instructor notices, uninvited.
 *
 * Runs MediaPipe FaceLandmarker (already in the dependency tree) over the
 * webcam and derives learner-state signals from the 52 ARKit blendshapes:
 *
 *   confused  — brow lowered/knitted (browDown, browInnerUp) with no smile,
 *               sustained. The classic "trying to parse it" face.
 *   bored     — long stretch of a near-flat face (no expressive channels),
 *               sustained. Low engagement.
 *
 * Both are judged against the learner's own normal face (lib/learnerBaseline.ts),
 * learnt in the first ~10 s; until then nothing fires.
 *
 * Deterministic heuristics, no extra ML model, everything on-device — the
 * video frames never leave the browser. Emits at most once per cooldown so
 * the professor isn't twitchy.
 */
import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { camDebug, camDebugOn } from '@/lib/camDebug';
import { acquireCamera, cameraVideo, releaseCamera } from '@/lib/sharedCamera';
import { learner } from '@/lib/learnerBaseline';

export type LearnerEmotion = 'neutral' | 'confused' | 'bored';
/** What the face looks like right now (for the camera bubble), before any sustain or cooldown. */
export type LiveFace = 'none' | LearnerEmotion;
const LIVE_CONFUSED_MS = 1500;   // a knit brow held this long shows as puzzled
const LIVE_FLAT_MS = 8000;       // a flat face held this long shows as gone quiet

const CONFUSED_SUSTAIN_MS = 5000;   // brow-knit held this long -> confused
const BORED_SUSTAIN_MS = 20000;     // flat face held this long -> bored
const COOLDOWN_MS = 90000;          // don't re-fire the same state for 90s

export function useEmotionWatcher(
  enabled: boolean,
  onState: (state: LearnerEmotion) => void
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const confusedSinceRef = useRef<number | null>(null);
  const flatSinceRef = useRef<number | null>(null);
  const lastFiredRef = useRef<Record<string, number>>({});
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveFace>('none');
  const [learning, setLearning] = useState(true);   // still learning the learner's normal face

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let acquired = false;

    const start = async () => {
      setError(null);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );
        // Graphics card first (faster); without one (some Chromebooks, older
        // laptops) that fails, so fall back to the processor instead of
        // turning the whole camera's detection off
        const make = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate,
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        const landmarker = await make('GPU').catch(() => make('CPU'));
        if (cancelled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;

        // The shared camera feed (lib/sharedCamera.ts), not a camera of its own
        if (cancelled) return;
        acquired = true;
        stream = await acquireCamera();
        if (cancelled) return;
        const video = await cameraVideo(stream);
        if (cancelled) return;
        videoRef.current = video;
        setReady(true);

        const bs = (result: any, name: string): number => {
          const cats = result?.faceBlendshapes?.[0]?.categories ?? [];
          const c = cats.find((x: any) => x.categoryName === name);
          return c ? c.score : 0;
        };

        const debug = camDebugOn();
        let lastCheck = 0;
        const tick = () => {
          if (cancelled || !landmarkerRef.current || !videoRef.current) return;
          // ~10 readings a second: expressions are held for seconds (was every frame)
          const t = performance.now();
          if (t - lastCheck < 100) { rafRef.current = requestAnimationFrame(tick); return; }
          lastCheck = t;
          try {
            const result = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
            const hasFace = (result?.faceLandmarks?.length ?? 0) > 0;
            const now = Date.now();

            if (hasFace) {
              const browDown = (bs(result, 'browDownLeft') + bs(result, 'browDownRight')) / 2;
              const browInnerUp = bs(result, 'browInnerUp');
              const smile = Math.max(bs(result, 'mouthSmileLeft'), bs(result, 'mouthSmileRight'));
              const jawOpen = bs(result, 'jawOpen');

              // Confused: brow knit or raised inner brow, minimal smile.
              const confusion = Math.max(browDown * 1.4, browInnerUp) - smile * 1.5 - jawOpen * 0.5;
              // was: confusion > 0.28 for everyone. Now: clearly above this learner's own normal.
              const isConfused = learner.isConfused(confusion);

              // Bored: flat face — every expressive channel near zero.
              const expressive = Math.max(browDown, browInnerUp, smile, jawOpen);
              // was: expressive < 0.12 for everyone. Now: well below this learner's own normal.
              const isFlat = learner.isFlat(expressive);

              // Learn their normal (not while a reaction is building)
              const hold = confusedSinceRef.current !== null || flatSinceRef.current !== null;
              learner.confusion.add(confusion, now, hold);
              learner.expressive.add(expressive, now, hold);
              const stillLearning = learner.learning;
              setLearning(stillLearning);

              confusedSinceRef.current = isConfused ? (confusedSinceRef.current ?? now) : null;
              flatSinceRef.current = isFlat ? (flatSinceRef.current ?? now) : null;
              if (debug) {
                const c = learner.confusion, e = learner.expressive;
                camDebug.mood = stillLearning
                  ? `learning your face… puzzle ${confusion.toFixed(2)} · expression ${expressive.toFixed(2)}`
                  : `puzzle ${confusion.toFixed(2)} (yours ${c.mean.toFixed(2)}, needs ${(c.mean + Math.max(0.18, 3 * c.dev)).toFixed(2)}) · ` +
                    `expression ${expressive.toFixed(2)} (yours ${e.mean.toFixed(2)}, flat under ${Math.min(0.18, Math.max(0.03, e.mean * 0.55)).toFixed(2)})`;
              }
              if (stillLearning) {
                // nothing is judged until we know their normal face
                confusedSinceRef.current = null;
                flatSinceRef.current = null;
              }
              setLive(
                confusedSinceRef.current && now - confusedSinceRef.current > LIVE_CONFUSED_MS ? 'confused'
                  : flatSinceRef.current && now - flatSinceRef.current > LIVE_FLAT_MS ? 'bored'
                    : 'neutral');

              const canFire = (state: string) =>
                (lastFiredRef.current[state] ?? 0) < now - COOLDOWN_MS;

              if (confusedSinceRef.current && now - confusedSinceRef.current > CONFUSED_SUSTAIN_MS && canFire('confused')) {
                lastFiredRef.current.confused = now;
                confusedSinceRef.current = null;
                flatSinceRef.current = null;
                onStateRef.current('confused');
              } else if (flatSinceRef.current && now - flatSinceRef.current > BORED_SUSTAIN_MS && canFire('bored')) {
                lastFiredRef.current.bored = now;
                flatSinceRef.current = null;
                confusedSinceRef.current = null;
                onStateRef.current('bored');
              }
            } else {
              confusedSinceRef.current = null;
              flatSinceRef.current = null;
              setLive('none');
              if (debug) camDebug.mood = 'no face';
            }
          } catch { /* frame skip */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Emotion watcher unavailable');
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      // was: stop the camera's tracks. The feed is shared now: let go of it instead.
      if (acquired) releaseCamera();
      videoRef.current = null;
    };
  }, [enabled]);

  return { ready, error, live, learning };
}
