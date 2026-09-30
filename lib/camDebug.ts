/*
 * ?camDebug=1 in the address: the camera detectors write what they see here
 * (one line each), and the camera bubble shows it next to the circle. For
 * tuning on a real camera; nothing is sent anywhere.
 */
export const camDebug: Record<string, string> = {};

export function camDebugOn(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  return q.has('camDebug') || q.has('handDebug');
}
