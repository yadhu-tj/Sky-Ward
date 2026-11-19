import type { HandLandmarks, Landmark } from '../hooks/useMediaPipeHands';
import type { TiltDebugState } from './tiltController';

/** Palm roll in mirrored camera coordinates; leaning right produces positive bar tilt. */
export function palmRollDegrees(hand: Landmark[] | null, aspect = 16 / 9): number | null {
  if (!hand || hand.length < 21) return null;
  const dx = (hand[9].x - hand[0].x) * aspect;
  const up = hand[0].y - hand[9].y;
  if (!Number.isFinite(dx) || !Number.isFinite(up) || up < 0.02) return null;
  return Math.atan2(dx, up) * 180 / Math.PI;
}

export class SingleHandController {
  private neutral = 0;
  private calibrated = false;
  private calibrationStart: number | null = null;
  private samples: number[] = [];
  private lastSeen: number | null = null;
  private lastTime: number | null = null;
  private lastOutput = 0;
  private output = 0;
  private lastPalm: Landmark | null = null;

  resetCalibration() {
    this.calibrated = false;
    this.calibrationStart = null;
    this.samples = [];
    this.lastSeen = null;
    this.lastTime = null;
    this.output = 0;
    this.lastOutput = 0;
    this.lastPalm = null;
  }

  trackingAge(now: number): number { return this.lastSeen === null ? Infinity : now - this.lastSeen; }
  shouldPause(now: number): boolean { return this.calibrated && this.trackingAge(now) > 1500; }
  heldAngleRad(now: number): number {
    const age = this.trackingAge(now);
    const hold = age <= 150 ? 1 : Math.max(0, 1 - (age - 150) / 700);
    return this.lastOutput * hold * Math.PI / 180;
  }

  process(landmarks: HandLandmarks, now: number, aspect = 16 / 9): TiltDebugState {
    const candidates = [landmarks.left, landmarks.right].filter((hand): hand is Landmark[] => palmRollDegrees(hand, aspect) !== null);
    // Keep following the same visible palm when a second hand enters the frame.
    if (this.lastPalm) {
      const palm = this.lastPalm;
      candidates.sort((a, b) => Math.hypot(a[0].x - palm.x, a[0].y - palm.y) - Math.hypot(b[0].x - palm.x, b[0].y - palm.y));
    }
    const hand = candidates[0] ?? null;
    const raw = palmRollDegrees(hand, aspect) ?? 0;
    const dt = Math.max(1, Math.min(100, now - (this.lastTime ?? now - 33)));
    this.lastTime = now;
    let progress = this.calibrated ? 1 : 0;
    if (hand) {
      this.lastSeen = now;
      this.lastPalm = hand[0];
      if (!this.calibrated) {
        if (this.calibrationStart === null || Math.abs(raw - this.samples[0]) > 6) {
          this.calibrationStart = now;
          this.samples = [];
        }
        this.samples.push(raw);
        progress = Math.min(1, (now - this.calibrationStart) / 650);
        if (progress === 1 && this.samples.length >= 10) {
          this.neutral = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
          this.calibrated = true;
        }
        this.output = 0;
      } else {
        const angle = raw - this.neutral;
        const target = Math.max(-25, Math.min(25, Math.sign(angle) * Math.max(0, Math.abs(angle) - 2)));
        const smoothed = this.output + (target - this.output) * (1 - Math.exp(-dt / 70));
        const maxStep = 120 * dt / 1000;
        this.output += Math.max(-maxStep, Math.min(maxStep, smoothed - this.output));
      }
      this.lastOutput = this.output;
    } else {
      this.output = this.heldAngleRad(now) * 180 / Math.PI;
      if (!this.calibrated) { this.calibrationStart = null; this.samples = []; }
    }
    return {
      hasBothHands: false,
      leftHand: hand === landmarks.left ? hand?.[0] ?? null : null,
      rightHand: hand === landmarks.right ? hand?.[0] ?? null : null,
      rawAngleRad: raw * Math.PI / 180, rawAngleDeg: raw,
      calibratedAngleDeg: this.calibrated ? raw - this.neutral : 0,
      smoothedAngleDeg: this.output, finalAngleDeg: this.output, finalAngleRad: this.output * Math.PI / 180,
      isCalibrating: !this.calibrated, calibrationProgress: progress, isCalibrated: this.calibrated,
      neutralOffsetDeg: this.neutral, isOpenPalm: false, palmPauseTriggered: false,
      leftHandHeight: 0.5, rightHandHeight: 0.5,
      isHandTrackingActive: !!hand, isSingleHandMode: true,
      isHandLockActive: this.calibrated, lockedLeftAnchor: null, lockedRightAnchor: null, lockedBaselineY: 0.5,
      handLockStatus: !hand ? 'SEARCHING' : this.calibrated ? 'LOCKED' : 'LOCKING',
    };
  }
}
