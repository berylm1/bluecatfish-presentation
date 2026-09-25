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
 * Deterministic heuristics, no extra ML model, everything on-device — the
 * video frames never leave the browser. Emits at most once per cooldown so
 * the professor isn't twitchy.
 */
import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export type LearnerEmotion = 'neutral' | 'confused' | 'bored';

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

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const start = async () => {
      setError(null);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });
        if (cancelled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;

        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        videoRef.current = video;
        setReady(true);

        const bs = (result: any, name: string): number => {
          const cats = result?.faceBlendshapes?.[0]?.categories ?? [];
          const c = cats.find((x: any) => x.categoryName === name);
          return c ? c.score : 0;
        };

        const tick = () => {
          if (cancelled || !landmarkerRef.current || !videoRef.current) return;
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
              const isConfused = confusion > 0.28;

              // Bored: flat face — every expressive channel near zero.
              const expressive = Math.max(browDown, browInnerUp, smile, jawOpen);
              const isFlat = expressive < 0.12;

              confusedSinceRef.current = isConfused ? (confusedSinceRef.current ?? now) : null;
              flatSinceRef.current = isFlat ? (flatSinceRef.current ?? now) : null;

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
      stream?.getTracks().forEach((t) => t.stop());
      videoRef.current = null;
    };
  }, [enabled]);

  return { ready, error };
}
