/*
 * Is this hand raised, the way a student raises it in class?
 *
 * Works on MediaPipe HandLandmarker's 21 points (x, y from 0 to 1, y down).
 * The old check was only "the wrist is in the top 35% of the picture", which
 * missed hands on laptop cameras (the head fills the top) and fired on
 * head-scratching and chin-resting. Now a raised hand must be all of:
 *
 *   open     at least 3 of the 4 fingers straight (tip farther from the wrist
 *            than the middle joint)
 *   upright  wrist → middle knuckle points up, within ~40° of straight up
 *   high     fingertips in the upper 60% of the picture
 *   near     big enough to be the learner, not someone walking behind them
 *
 * With the learner's face known (lib/learnerBaseline.ts), "high" and "near"
 * are measured against it instead of the picture: fingertips above the middle
 * of their face, and a hand in proportion to their face (so it fits how close
 * they sit, and a hand on the chin or someone behind them doesn't count).
 *
 * `palm` (palm or back of the hand to the camera) is still worked out and
 * shown in ?camDebug=1, but no longer required: it depends on MediaPipe
 * telling left hands from right, and on real webcams that made every raise
 * fail. (A raised hand either way round is a raised hand.)
 *
 * Point numbers: 0 wrist, 5/9/13/17 knuckles (index → pinky),
 * 6/10/14/18 middle joints, 8/12/16/20 fingertips.
 */

import type { FaceBox } from './learnerBaseline';

export type Point = { x: number; y: number; z?: number };

export type HandCheck = {
  raised: boolean;
  open: boolean;
  upright: boolean;
  palm: boolean | null;   // null: can't tell (no handedness)
  high: boolean;
  near: boolean;
};

const MAX_TILT_DEG = 40;
const MAX_TIP_Y = 0.6;      // a fingertip must be above this (0 top, 1 bottom)
const MIN_HAND_SIZE = 0.06; // wrist → middle knuckle, as a share of the picture

const FACE_HIGH = 0.5;       // fingertips above this far down the face (its middle)
const FACE_NEAR = 0.25;      // wrist → middle knuckle at least a quarter of the face's width

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * handedness: MediaPipe's label ('Left' / 'Right'). MediaPipe assumes a
 * mirrored (selfie) picture, so on a plain webcam picture the learner's right
 * hand is labelled 'Left'. mirrored: set if the frames given to MediaPipe were
 * flipped first. handednessScore: MediaPipe's confidence in that label.
 */
export function checkHand(lm: Point[], handedness?: string, mirrored = false, handednessScore = 1, face?: FaceBox | null): HandCheck {
  const wrist = lm[0];
  const size = dist(wrist, lm[9]);

  const fingers: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  const straight = fingers.filter(([tip, mid]) => dist(lm[tip], wrist) > dist(lm[mid], wrist) * 1.1).length;
  const open = straight >= 3;

  // Up the hand: wrist → middle knuckle. In picture coordinates "up" is -y.
  const ux = lm[9].x - wrist.x, uy = lm[9].y - wrist.y;
  const tilt = Math.abs(Math.atan2(ux, -uy)) * 180 / Math.PI;
  const upright = uy < 0 && tilt <= MAX_TILT_DEG;

  // Across the hand: pinky knuckle → index knuckle. Which side the thumb is on,
  // relative to "up", tells palm from back once we know which hand it is.
  // For the learner's right hand, palm to the camera, on a plain (unmirrored)
  // picture the index side is on the right: cross(up, across) > 0.
  let palm: boolean | null = null;
  if ((handedness === 'Left' || handedness === 'Right') && handednessScore >= 0.7) {   // unsure which hand: don't judge
    const ax = lm[5].x - lm[17].x, ay = lm[5].y - lm[17].y;
    const cross = ux * ay - uy * ax;
    const learnersRight = (handedness === 'Left') !== mirrored;
    palm = learnersRight ? cross > 0 : cross < 0;
  }

  const tipY = Math.min(lm[8].y, lm[12].y);
  // was (still used until the face is seen): the upper 60% of the picture, and 6% of it in size
  const high = face ? tipY < face.y + face.h * FACE_HIGH : tipY < MAX_TIP_Y;
  const near = face ? size > face.w * FACE_NEAR : size > MIN_HAND_SIZE;
  // was: open && upright && palm !== false && high && near (palm made every real raise fail)
  return { raised: open && upright && high && near, open, upright, palm, high, near };
}
