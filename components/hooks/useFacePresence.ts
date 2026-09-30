"use client";

import { useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { camDebug, camDebugOn } from "@/lib/camDebug";
import { acquireCamera, cameraVideo, releaseCamera } from "@/lib/sharedCamera";

const ABSENCE_GRACE_MS = 3000;
// Only a face that's clearly there and big enough to be the learner counts.
// Before, anything the detector was 50% sure of counted, so a poster or a
// pattern behind the learner kept them "here" after they left.
const MIN_SCORE = 0.7;
const MIN_FACE_WIDTH = 0.08;   // share of the picture's width (someone at the screen is ~15–40%)

export function useFacePresence(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSeenRef = useRef<number>(Date.now());

  const [present, setPresent] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let acquired = false;

    const start = async () => {
      setError(null);
      setReady(false);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,   // filtered harder below (MIN_SCORE, MIN_FACE_WIDTH)
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

        const debug = camDebugOn();
        const loop = () => {
          if (cancelled || !detectorRef.current || !videoRef.current) return;
          const result = detectorRef.current.detectForVideo(
            videoRef.current,
            performance.now()
          );

          const frameW = videoRef.current.videoWidth || 640;
          const faces = result.detections.filter((d) =>
            (d.categories?.[0]?.score ?? 0) >= MIN_SCORE && (d.boundingBox?.width ?? 0) / frameW >= MIN_FACE_WIDTH);
          if (debug) {
            camDebug.face = result.detections.length
              ? result.detections.map((d) => `score ${(d.categories?.[0]?.score ?? 0).toFixed(2)} width ${Math.round(((d.boundingBox?.width ?? 0) / frameW) * 100)}%`).join(' | ') + ` → ${faces.length ? 'HERE' : 'ignored'}`
              : 'no face seen';
          }

          // was: if (result.detections.length > 0) {
          if (faces.length > 0) {
            lastSeenRef.current = Date.now();
            setPresent(true);
          } else if (Date.now() - lastSeenRef.current > ABSENCE_GRACE_MS) {
            // grace period so a blink or head turn doesn't trigger it
            setPresent(false);
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
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.close();
      // was: stop the camera's tracks. The feed is shared now: let go of it instead.
      if (acquired) releaseCamera();
    };
  }, [enabled]);

  return { present, ready, error };
}
