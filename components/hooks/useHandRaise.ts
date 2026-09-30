"use client";
import { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { checkHand } from "@/lib/handPose";
import { camDebug, camDebugOn } from "@/lib/camDebug";
import { acquireCamera, cameraVideo, releaseCamera } from "@/lib/sharedCamera";

const RAISE_SUSTAIN_MS = 600; 
const COOLDOWN_MS = 4000;
// A raise counts when most recent frames saw a raised hand (a missed frame or
// two doesn't reset it), and then the hand must come down before it counts again.
const WINDOW_MS = 700;
const RAISED_SHARE = 0.7;
const DETECT_EVERY_MS = 66;   // ~15 checks a second is plenty, and spares the laptop

export function useHandRaise(enabled: boolean, onRaised: () => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const raiseStartRef = useRef<number | null>(null);
  const lastTriggerRef = useRef<number>(0);
  const onRaisedRef = useRef(onRaised);
  const smoothedYRef = useRef<number | null>(null)
  const samplesRef = useRef<{ t: number; raised: boolean }[]>([]);
  const loweredRef = useRef(true);   // hand came down since the last raise
  const lastDetectRef = useRef(0);
  const lastLogRef = useRef(0);
  onRaisedRef.current = onRaised;

  const [ready, setReady] = useState(false);
  // 0 to 1: how close a raise is to counting (for a "hand seen" hint on screen)
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return
    let acquired = false;
    let cancelled = false;
    const debug = camDebugOn();

    const start = async () => {
      setError(null);
      setReady(false);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        const detector = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 2,
          // defaults are 0.5; a bit lower so a hand at the edge of the picture is still found
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,   // either hand can be the raised one
        });
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;

        // The shared camera feed (lib/sharedCamera.ts), not a camera of its own
        if (cancelled) return;
        acquired = true;
        const stream = await acquireCamera();
        if (cancelled) return;
        const video = await cameraVideo(stream);
        if (cancelled) return;
        videoRef.current = video;
        setReady(true);

        const loop = () => {
          
          if (cancelled || !detectorRef.current || !videoRef.current) {
            console.log('loop exiting early:', { cancelled, hasDetector: !!detectorRef.current, hasVideo: !!videoRef.current });
            return;
          }

          try {
            const now = performance.now();
            if (now - lastDetectRef.current < DETECT_EVERY_MS) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
            lastDetectRef.current = now;
            const result = detectorRef.current.detectForVideo(videoRef.current, now);

            // Raised: an open hand, fingers up, palm to the camera, high enough
            // and near enough (lib/handPose.ts). Any of the (up to two) hands.
            const checks = (result.landmarks ?? []).map((hand, i) => {
              const h = result.handedness?.[i]?.[0];
              return checkHand(hand, h?.categoryName, false, h?.score ?? 0);
            });
            const isRaised = checks.some((c) => c.raised);
            // ?camDebug=1 in the address: what each check sees (shown by the camera bubble, and in the console)
            if (debug && now - lastLogRef.current > 250) {
              lastLogRef.current = now;
              const yn = (v: boolean | null) => (v === null ? '?' : v ? '✓' : '✗');
              camDebug.hand = checks.length
                ? checks.map((c, i) => `${result.handedness?.[i]?.[0]?.categoryName ?? '?'} open${yn(c.open)} up${yn(c.upright)} high${yn(c.high)} near${yn(c.near)} palm${yn(c.palm)} → ${c.raised ? 'RAISED' : 'no'}`).join(' | ')
                : 'no hand seen';
              if (now % 2000 < 250) console.log('[hand]', camDebug.hand);
            }

            const samples = samplesRef.current;
            samples.push({ t: now, raised: isRaised });
            while (samples.length && now - samples[0].t > WINDOW_MS) samples.shift();
            const share = samples.filter((x) => x.raised).length / samples.length;
            const covered = samples.length > 1 && now - samples[0].t >= RAISE_SUSTAIN_MS;
            setProgress((p) => {
              const next = covered ? Math.min(1, share / RAISED_SHARE) : share * 0.5;
              return Math.abs(next - p) > 0.05 ? next : p;
            });

            if (share < 0.2) loweredRef.current = true;
            if (
              covered && share >= RAISED_SHARE && loweredRef.current &&
              Date.now() - lastTriggerRef.current > COOLDOWN_MS
            ) {
              lastTriggerRef.current = Date.now();
              loweredRef.current = false;
              samples.length = 0;
              onRaisedRef.current();
            }

            // Before: only "is the wrist in the top 35% of the picture" (kept for reference)
            // const result = detectorRef.current.detectForVideo(videoRef.current, performance.now());
            // const hand = result.landmarks?.[0];

            // // Landmark 0 = wrist. Video y-coords are 0 (top) to 1 (bottom).
            // // A raised hand puts the wrist in the upper portion of frame.
            // const wristY = hand?.[0]?.y;

            // if (wristY !== undefined) {
            // smoothedYRef.current =
            // smoothedYRef.current === null
            // ? wristY
            // : smoothedYRef.current * 0.75 + wristY * 0.25; // heavily weight history, smooth out jitter
            // } else {
            // smoothedYRef.current = null; // hand left frame entirely
            // }

            // const isRaised = smoothedYRef.current !== null && smoothedYRef.current < 0.35;

            // if (isRaised) {
            // if (raiseStartRef.current === null) {
            // raiseStartRef.current = Date.now();
            // } else if (
            // Date.now() - raiseStartRef.current > RAISE_SUSTAIN_MS &&
            // Date.now() - lastTriggerRef.current > COOLDOWN_MS
            // ) {
            // console.log('TRIGGERING onRaised');
            // lastTriggerRef.current = Date.now();
            // raiseStartRef.current = null;
            // onRaisedRef.current();
            // }
            // } else {
            // raiseStartRef.current = null;
            // }
          } catch (err) {
            console.error('ERROR IN LOOP:', err);
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        loop();
      } catch (e: any) {
        setError(e.message ?? "Camera unavailable");
      }
    };

    start();
        
    return () => {
      console.log('useHandRaise cleanup firing, was enabled:', enabled);
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.close();
      // was: stop the camera's tracks. The feed is shared now: let go of it instead.
      if (acquired) releaseCamera();
    };
  }, [enabled]);

  return { ready, error, progress };
}
