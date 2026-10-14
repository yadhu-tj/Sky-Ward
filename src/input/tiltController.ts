import type { HandLandmarks, Landmark } from '../hooks/useMediaPipeHands';
import { getPalmCentroid } from '../hooks/useMediaPipeHands';

export interface TiltConfig {
  calibrationFrames: number;
  emaAlpha: number;
  deadZoneDegrees: number;
}

export const DEFAULT_TILT_CONFIG: TiltConfig = {
  calibrationFrames: 25, // ~0.8s at 30fps
  emaAlpha: 0.18,
  deadZoneDegrees: 1.2,
};

export interface HandAnchor {
  x: number;
  y: number;
}

export interface CalibrationLockData {
  leftAnchor: HandAnchor;
  rightAnchor: HandAnchor;
  baselineY: number;
  neutralDistance: number;
  neutralOffsetDeg: number;
}

export interface TiltDebugState {
  hasBothHands: boolean;
  leftHand: Landmark | null;
  rightHand: Landmark | null;
  rawAngleRad: number;
  rawAngleDeg: number;
  calibratedAngleDeg: number;
  smoothedAngleDeg: number;
  finalAngleDeg: number;
  finalAngleRad: number;
  isCalibrating: boolean;
  calibrationProgress: number; // 0 to 1
  isCalibrated: boolean;
  neutralOffsetDeg: number;
  isOpenPalm: boolean;
  palmPauseTriggered: boolean;
  leftHandHeight: number; // 0 (top) to 1 (bottom)
  rightHandHeight: number;
  isHandTrackingActive: boolean;
  isSingleHandMode: boolean;

  // Calibration Hand Lock telemetry:
  isHandLockActive: boolean;
  lockedLeftAnchor: HandAnchor | null;
  lockedRightAnchor: HandAnchor | null;
  lockedBaselineY: number;
  handLockStatus: 'UNLOCKED' | 'LOCKING' | 'LOCKED' | 'SEARCHING';
}

/**
 * Calculates raw tilt angle from hands using stable palm centroids.
 * Sign convention: right hand lower (greater Y in screen space) -> positive tilt angle.
 * Positive tilt means bar dips right -> ball accelerates right.
 */
export function calculateRawTilt(
  landmarks: HandLandmarks,
  lockData: CalibrationLockData | null = null
): {
  angleRad: number;
  leftHand: Landmark;
  rightHand: Landmark;
  isSingleHand: boolean;
} | null {
  const maxTiltAngleRad = (35 * Math.PI) / 180;

  // Case 1: Both hands present
  if (landmarks.left && landmarks.right) {
    const leftCentroid = getPalmCentroid(landmarks.left);
    const rightCentroid = getPalmCentroid(landmarks.right);

    const deltaX = rightCentroid.x - leftCentroid.x;
    // Reject tight clusters (e.g. face/chin)
    if (deltaX >= 0.12) {
      const deltaY = rightCentroid.y - leftCentroid.y;
      const angleRad = Math.atan2(deltaY, deltaX);
      const clampedAngleRad = Math.max(-maxTiltAngleRad, Math.min(maxTiltAngleRad, angleRad));

      return {
        angleRad: clampedAngleRad,
        leftHand: { ...leftCentroid, z: landmarks.left[0].z },
        rightHand: { ...rightCentroid, z: landmarks.right[0].z },
        isSingleHand: false,
      };
    }
  }

  // Baseline vertical height for single-hand fallback (referenced to locked anchor, never arbitrary 0.52)
  const defaultBaseY = lockData ? lockData.baselineY : 0.55;

  // Case 2: Single-hand steering fallback
  if (landmarks.left && !landmarks.right) {
    const leftCentroid = getPalmCentroid(landmarks.left);
    const refY = lockData ? lockData.leftAnchor.y : defaultBaseY;
    const deltaY = leftCentroid.y - refY;
    // Raising left hand (-deltaY) tilts right
    const angleRad = Math.max(-maxTiltAngleRad, Math.min(maxTiltAngleRad, -deltaY * 2.0));
    const syntheticRight: Landmark = {
      x: lockData ? lockData.rightAnchor.x : 0.82,
      y: Math.max(0.05, Math.min(0.95, (lockData ? lockData.rightAnchor.y : defaultBaseY) + deltaY)),
      z: landmarks.left[0].z,
    };
    return {
      angleRad,
      leftHand: { ...leftCentroid, z: landmarks.left[0].z },
      rightHand: syntheticRight,
      isSingleHand: true,
    };
  }

  if (landmarks.right && !landmarks.left) {
    const rightCentroid = getPalmCentroid(landmarks.right);
    const refY = lockData ? lockData.rightAnchor.y : defaultBaseY;
    const deltaY = rightCentroid.y - refY;
    // Raising right hand (-deltaY) tilts left
    const angleRad = Math.max(-maxTiltAngleRad, Math.min(maxTiltAngleRad, deltaY * 2.0));
    const syntheticLeft: Landmark = {
      x: lockData ? lockData.leftAnchor.x : 0.18,
      y: Math.max(0.05, Math.min(0.95, (lockData ? lockData.leftAnchor.y : defaultBaseY) - deltaY)),
      z: landmarks.right[0].z,
    };
    return {
      angleRad,
      leftHand: syntheticLeft,
      rightHand: { ...rightCentroid, z: landmarks.right[0].z },
      isSingleHand: true,
    };
  }

  return null;
}

/**
 * Calibration Hand Lock Engine:
 * Samples baseline neutral angles AND locks physical spatial anchors (Left Anchor, Right Anchor, Baseline Y).
 * Calibration requires BOTH hands present to ensure a genuine balanced steering posture is locked.
 */
export class Calibrator {
  private targetFrames: number;
  private sampleCount: number = 0;
  private sumAngleDeg: number = 0;
  private sumLeftX: number = 0;
  private sumLeftY: number = 0;
  private sumRightX: number = 0;
  private sumRightY: number = 0;

  private lockData: CalibrationLockData | null = null;
  private complete: boolean = false;

  constructor(targetFrames: number = 25) {
    this.targetFrames = targetFrames;
  }

  public reset(): void {
    this.sampleCount = 0;
    this.sumAngleDeg = 0;
    this.sumLeftX = 0;
    this.sumLeftY = 0;
    this.sumRightX = 0;
    this.sumRightY = 0;
    this.lockData = null;
    this.complete = false;
  }

  public skip(): void {
    if (this.sampleCount > 0) {
      const avgLX = this.sumLeftX / this.sampleCount;
      const avgLY = this.sumLeftY / this.sampleCount;
      const avgRX = this.sumRightX / this.sampleCount;
      const avgRY = this.sumRightY / this.sampleCount;
      this.lockData = {
        leftAnchor: { x: avgLX, y: avgLY },
        rightAnchor: { x: avgRX, y: avgRY },
        baselineY: (avgLY + avgRY) / 2,
        neutralDistance: Math.hypot(avgRX - avgLX, avgRY - avgLY),
        neutralOffsetDeg: this.sumAngleDeg / this.sampleCount,
      };
    } else {
      this.lockData = {
        leftAnchor: { x: 0.28, y: 0.55 },
        rightAnchor: { x: 0.72, y: 0.55 },
        baselineY: 0.55,
        neutralDistance: 0.44,
        neutralOffsetDeg: 0,
      };
    }
    this.complete = true;
  }

  /**
   * Samples a frame during calibration.
   * Calibration only advances when BOTH hands are detected and separated in steering posture.
   */
  public update(
    leftHand: Landmark | null,
    rightHand: Landmark | null,
    rawAngleDeg: number
  ): boolean {
    if (this.complete) return true;
    if (!leftHand || !rightHand) return false;

    const leftCentroid = getPalmCentroid([leftHand]);
    const rightCentroid = getPalmCentroid([rightHand]);

    // Reject tight clusters during calibration
    if (rightCentroid.x - leftCentroid.x < 0.12) return false;

    this.sumAngleDeg += rawAngleDeg;
    this.sumLeftX += leftCentroid.x;
    this.sumLeftY += leftCentroid.y;
    this.sumRightX += rightCentroid.x;
    this.sumRightY += rightCentroid.y;
    this.sampleCount++;

    if (this.sampleCount >= this.targetFrames) {
      const avgLX = this.sumLeftX / this.sampleCount;
      const avgLY = this.sumLeftY / this.sampleCount;
      const avgRX = this.sumRightX / this.sampleCount;
      const avgRY = this.sumRightY / this.sampleCount;
      this.lockData = {
        leftAnchor: { x: avgLX, y: avgLY },
        rightAnchor: { x: avgRX, y: avgRY },
        baselineY: (avgLY + avgRY) / 2,
        neutralDistance: Math.hypot(avgRX - avgLX, avgRY - avgLY),
        neutralOffsetDeg: this.sumAngleDeg / this.sampleCount,
      };
      this.complete = true;
      return true;
    }
    return false;
  }

  public get progress(): number {
    return Math.min(1, this.sampleCount / this.targetFrames);
  }

  public get isComplete(): boolean {
    return this.complete;
  }

  public get neutralOffset(): number {
    return this.lockData?.neutralOffsetDeg ?? 0;
  }

  public getLockData(): CalibrationLockData | null {
    return this.lockData;
  }
}

/**
 * Exponential Moving Average (EMA) smoother.
 * smoothed = alpha * current + (1 - alpha) * previous
 */
export class EMASmoother {
  private alpha: number;
  private currentSmoothed: number | null = null;

  constructor(alpha: number = 0.18) {
    this.alpha = alpha;
  }

  public reset(): void {
    this.currentSmoothed = null;
  }

  public setAlpha(alpha: number): void {
    this.alpha = Math.max(0.01, Math.min(1, alpha));
  }

  public update(value: number): number {
    if (this.currentSmoothed === null) {
      this.currentSmoothed = value;
    } else {
      this.currentSmoothed = this.alpha * value + (1 - this.alpha) * this.currentSmoothed;
    }
    return this.currentSmoothed;
  }

  public get value(): number {
    return this.currentSmoothed ?? 0;
  }
}

/**
 * Dead zone filter in degrees.
 * Returns 0 if within dead zone threshold.
 * Smoothly transitions outside dead zone to prevent jumps.
 */
export function applyDeadZone(angleDeg: number, thresholdDeg: number = 1.2): number {
  if (Math.abs(angleDeg) <= thresholdDeg) {
    return 0;
  }
  const sign = Math.sign(angleDeg);
  return sign * (Math.abs(angleDeg) - thresholdDeg);
}

/**
 * Manages full tilt processing pipeline:
 * Raw -> Calibrate Hand Lock -> Smooth -> Deadzone -> Slew Rate Guard + Gesture Pause detection
 */
export class TiltPipeline {
  private calibrator: Calibrator;
  private smoother: EMASmoother;
  private deadZoneDeg: number;

  private palmHoldFrames: number = 0;
  private palmCooldown: number = 0; // cooldown in frames
  private lastValidRaw: {
    angleRad: number;
    leftHand: Landmark;
    rightHand: Landmark;
    isSingleHand: boolean;
  } | null = null;
  private graceFramesRemaining: number = 0;

  // Hand Lock dual-hand stability & anti-spike guards:
  private lastDualHandAngleDeg: number = 0;
  private singleHandDropoutCounter: number = 0;
  private prevFinalDeg: number = 0;

  constructor(config: TiltConfig = DEFAULT_TILT_CONFIG) {
    this.calibrator = new Calibrator(config.calibrationFrames);
    this.smoother = new EMASmoother(config.emaAlpha);
    this.deadZoneDeg = config.deadZoneDegrees;
  }

  public resetCalibration(): void {
    this.calibrator.reset();
    this.smoother.reset();
    this.lastValidRaw = null;
    this.graceFramesRemaining = 0;
    this.lastDualHandAngleDeg = 0;
    this.singleHandDropoutCounter = 0;
    this.prevFinalDeg = 0;
  }

  public skipCalibration(): void {
    this.calibrator.skip();
  }

  /**
   * Temporarily locks out palm pause detection (e.g. after starting or resuming game).
   * Prevents accidental pauses while player moves hands from mouse/keyboard to steering posture.
   */
  public lockoutPauseGesture(frames: number = 75): void {
    this.palmCooldown = Math.max(this.palmCooldown, frames);
    this.palmHoldFrames = 0;
  }

  public process(landmarks: HandLandmarks, isOpenPalm: boolean = false): TiltDebugState {
    if (this.palmCooldown > 0) {
      this.palmCooldown--;
    }

    let palmPauseTriggered = false;
    if (isOpenPalm && this.palmCooldown === 0) {
      this.palmHoldFrames++;
      // Require holding open palm for ~14 frames (~0.45s) of deliberate gesture
      if (this.palmHoldFrames >= 14) {
        palmPauseTriggered = true;
        this.palmHoldFrames = 0;
        this.palmCooldown = 60; // 2.0s cooldown
      }
    } else {
      this.palmHoldFrames = Math.max(0, this.palmHoldFrames - 2);
    }

    const lockData = this.calibrator.getLockData();
    let raw = calculateRawTilt(landmarks, lockData);

    // Tracking Grace: if hands dip or momentarily leave frame, hold & gently decay for ~350ms
    if (raw) {
      this.lastValidRaw = raw;
      this.graceFramesRemaining = 18;
    } else if (this.lastValidRaw && this.graceFramesRemaining > 0) {
      this.graceFramesRemaining--;
      raw = {
        angleRad: this.lastValidRaw.angleRad * 0.95,
        leftHand: this.lastValidRaw.leftHand,
        rightHand: this.lastValidRaw.rightHand,
        isSingleHand: this.lastValidRaw.isSingleHand,
      };
      this.lastValidRaw = raw;
    } else {
      this.lastValidRaw = null;
    }

    const isHandLockActive = this.calibrator.isComplete;
    const lockedLeftAnchor = lockData?.leftAnchor ?? null;
    const lockedRightAnchor = lockData?.rightAnchor ?? null;
    const lockedBaselineY = lockData?.baselineY ?? 0.55;

    if (!raw) {
      this.prevFinalDeg *= 0.90;
      return {
        hasBothHands: false,
        leftHand: null,
        rightHand: null,
        rawAngleRad: 0,
        rawAngleDeg: 0,
        calibratedAngleDeg: 0,
        smoothedAngleDeg: 0,
        finalAngleDeg: 0,
        finalAngleRad: 0,
        isCalibrating: !this.calibrator.isComplete,
        calibrationProgress: this.calibrator.progress,
        isCalibrated: this.calibrator.isComplete,
        neutralOffsetDeg: this.calibrator.neutralOffset,
        isOpenPalm,
        palmPauseTriggered,
        leftHandHeight: 0.5,
        rightHandHeight: 0.5,
        isHandTrackingActive: false,
        isSingleHandMode: false,
        isHandLockActive,
        lockedLeftAnchor,
        lockedRightAnchor,
        lockedBaselineY,
        handLockStatus: !this.calibrator.isComplete ? 'LOCKING' : 'SEARCHING',
      };
    }

    const rawAngleDeg = (raw.angleRad * 180) / Math.PI;

    // Calibration phase (only advances when BOTH hands are present)
    if (!this.calibrator.isComplete) {
      this.calibrator.update(raw.leftHand, raw.rightHand, rawAngleDeg);
      return {
        hasBothHands: !raw.isSingleHand,
        leftHand: raw.leftHand,
        rightHand: raw.rightHand,
        rawAngleRad: raw.angleRad,
        rawAngleDeg,
        calibratedAngleDeg: 0,
        smoothedAngleDeg: 0,
        finalAngleDeg: 0,
        finalAngleRad: 0,
        isCalibrating: true,
        calibrationProgress: this.calibrator.progress,
        isCalibrated: false,
        neutralOffsetDeg: this.calibrator.neutralOffset,
        isOpenPalm,
        palmPauseTriggered,
        leftHandHeight: raw.leftHand.y,
        rightHandHeight: raw.rightHand.y,
        isHandTrackingActive: true,
        isSingleHandMode: raw.isSingleHand,
        isHandLockActive: false,
        lockedLeftAnchor: null,
        lockedRightAnchor: null,
        lockedBaselineY: 0.55,
        handLockStatus: 'LOCKING',
      };
    }

    // Hand Lock active: Anti-Spike Protection on single-hand flicker
    let calibratedDeg: number;
    let effectiveSingleHand = raw.isSingleHand;

    if (!raw.isSingleHand) {
      // Both hands present and locked
      calibratedDeg = rawAngleDeg - this.calibrator.neutralOffset;
      this.lastDualHandAngleDeg = calibratedDeg;
      this.singleHandDropoutCounter = 0;
    } else {
      // One hand momentarily dropped out
      this.singleHandDropoutCounter++;
      if (this.singleHandDropoutCounter <= 25) {
        // HOLD DUAL-HAND STANCE with smooth exponential decay (ZERO SUDDEN TILT JUMP!)
        calibratedDeg = this.lastDualHandAngleDeg * Math.pow(0.96, this.singleHandDropoutCounter);
        effectiveSingleHand = false; // Retain dual-hand stability in UI during momentary drop
      } else {
        // Genuine single-hand steering (already safely referenced to calibrated anchor baseline)
        calibratedDeg = rawAngleDeg;
      }
    }

    // EMA smoothing
    const smoothedDeg = this.smoother.update(calibratedDeg);

    // Dead zone
    const deadZonedDeg = applyDeadZone(smoothedDeg, this.deadZoneDeg);

    // Maximum Angular Slew Rate Guard (Anti-Jerk Limiter)
    // Prevents mathematical glitches from ever snapping the bar faster than 3.2 deg/frame (~190 deg/s)
    const maxSlewDegPerFrame = 3.2;
    const delta = deadZonedDeg - this.prevFinalDeg;
    const clampedDelta = Math.max(-maxSlewDegPerFrame, Math.min(maxSlewDegPerFrame, delta));
    const finalDeg = this.prevFinalDeg + clampedDelta;
    this.prevFinalDeg = finalDeg;
    const finalRad = (finalDeg * Math.PI) / 180;

    return {
      hasBothHands: !effectiveSingleHand,
      leftHand: raw.leftHand,
      rightHand: raw.rightHand,
      rawAngleRad: raw.angleRad,
      rawAngleDeg,
      calibratedAngleDeg: calibratedDeg,
      smoothedAngleDeg: smoothedDeg,
      finalAngleDeg: finalDeg,
      finalAngleRad: finalRad,
      isCalibrating: false,
      calibrationProgress: 1,
      isCalibrated: true,
      neutralOffsetDeg: this.calibrator.neutralOffset,
      isOpenPalm,
      palmPauseTriggered,
      leftHandHeight: raw.leftHand.y,
      rightHandHeight: raw.rightHand.y,
      isHandTrackingActive: true,
      isSingleHandMode: effectiveSingleHand,
      isHandLockActive: true,
      lockedLeftAnchor,
      lockedRightAnchor,
      lockedBaselineY,
      handLockStatus: 'LOCKED',
    };
  }
}

