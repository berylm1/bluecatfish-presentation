/*
 * One camera feed for everything that watches the learner (hand raise,
 * presence, expression, the camera bubble). Each used to open the camera on
 * its own: four feeds at once, and some browsers (Safari) freeze the older
 * feeds when a new one opens, so a detector could be looking at a still
 * picture. Now the first user opens it, the rest share it, and the last one
 * to let go turns the camera off.
 */
import { learner } from './learnerBaseline';

let stream: Promise<MediaStream> | null = null;
let users = 0;

export function acquireCamera(): Promise<MediaStream> {
  users++;
  if (!stream) {
    learner.reset();   // camera turned on: learn this learner's normal face again
    stream = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
    stream.catch(() => { stream = null; });   // a later try can ask again
  }
  return stream;
}

export function releaseCamera(): void {
  users = Math.max(0, users - 1);
  if (users > 0 || !stream) return;
  const s = stream;
  stream = null;
  s.then((m) => m.getTracks().forEach((t) => t.stop())).catch(() => {});
}

/** A playing <video> of the shared feed, for a detector (not added to the page). */
export async function cameraVideo(s: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.srcObject = s;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return video;
}
