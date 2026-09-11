import type { HandLandmarks, Landmark } from '../hooks/useMediaPipeHands';

export interface TiltConfig {
  calibrationFrames: number;
  emaAlpha: number;
  deadZoneDegrees: number;
}

export const DEFAULT_TILT_CONFIG: TiltConfig = {
  calibrationFrames: 30, // ~1s at 30fps
  emaAlpha: 0.18,
  deadZoneDegrees: 1.2,
};

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
}

/**
 * Calculates raw tilt angle from hands.
 * Sign convention: right hand lower (greater Y in screen space) -> positive tilt angle.
 * Positive tilt means bar dips right -> ball accelerates right.
 */
export function calculateRawTilt(landmarks: HandLandmarks): { angleRad: number; leftHand: Landmark; rightHand: Landmark } | null {
  if (!landmarks.left || !landmarks.right) {
    return null;
  }

  // Use wrist landmarks (index 0)
  const leftWrist = landmarks.left[0];
  const rightWrist = landmarks.right[0];

  const deltaY = rightWrist.y - leftWrist.y;
  const deltaX = rightWrist.x - leftWrist.x;

  // Ensure hands have reasonable horizontal separation
  if (Math.abs(deltaX) < 0.05) {
    return null;
  }

  // Tilt Angle = arctan((Y_right - Y_left) / deltaX)
  const angleRad = Math.atan2(deltaY, Math.abs(deltaX));

  return {
    angleRad,
    leftHand: leftWrist,
    rightHand: rightWrist,
  };
}

/**
 * Accumulates baseline neutral angles for a set number of frames.
 */
export class Calibrator {
  private samples: number[] = [];
  private targetFrames: number;
  private offsetDeg: number = 0;
  private complete: boolean = false;

  constructor(targetFrames: number = 30) {
    this.targetFrames = targetFrames;
  }

  public reset(): void {
    this.samples = [];
    this.offsetDeg = 0;
    this.complete = false;
  }

  public skip(): void {
    if (this.samples.length > 0) {
      const sum = this.samples.reduce((a, b) => a + b, 0);
      this.offsetDeg = sum / this.samples.length;
    } else {
      this.offsetDeg = 0;
    }
    this.complete = true;
  }

  public update(rawAngleDeg: number): boolean {
    if (this.complete) return true;

    this.samples.push(rawAngleDeg);
    if (this.samples.length >= this.targetFrames) {
      const sum = this.samples.reduce((a, b) => a + b, 0);
      this.offsetDeg = sum / this.samples.length;
      this.complete = true;
      return true;
    }
    return false;
  }

  public get progress(): number {
    return Math.min(1, this.samples.length / this.targetFrames);
  }

  public get isComplete(): boolean {
    return this.complete;
  }

  public get neutralOffset(): number {
    return this.offsetDeg;
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
 * Raw -> Calibrate -> Smooth -> Deadzone + Gesture Pause detection
 */
export class TiltPipeline {
  private calibrator: Calibrator;
  private smoother: EMASmoother;
  private deadZoneDeg: number;

  private palmHoldFrames: number = 0;
  private palmCooldown: number = 0; // cooldown in frames

  constructor(config: TiltConfig = DEFAULT_TILT_CONFIG) {
    this.calibrator = new Calibrator(config.calibrationFrames);
    this.smoother = new EMASmoother(config.emaAlpha);
    this.deadZoneDeg = config.deadZoneDegrees;
  }

  public resetCalibration(): void {
    this.calibrator.reset();
    this.smoother.reset();
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

    const raw = calculateRawTilt(landmarks);

    if (!raw) {
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
      };
    }

    const rawAngleDeg = (raw.angleRad * 180) / Math.PI;

    // Calibration phase
    if (!this.calibrator.isComplete) {
      this.calibrator.update(rawAngleDeg);
      return {
        hasBothHands: true,
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
      };
    }

    // Calibrated angle = raw - baseline neutral
    const calibratedDeg = rawAngleDeg - this.calibrator.neutralOffset;

    // EMA smoothing
    const smoothedDeg = this.smoother.update(calibratedDeg);

    // Dead zone
    const finalDeg = applyDeadZone(smoothedDeg, this.deadZoneDeg);
    const finalRad = (finalDeg * Math.PI) / 180;

    return {
      hasBothHands: true,
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
    };
  }
}
