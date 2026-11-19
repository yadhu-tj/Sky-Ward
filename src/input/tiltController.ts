import type { HandLandmarks, Landmark } from '../hooks/useMediaPipeHands';
import { getPalmCentroid } from '../hooks/useMediaPipeHands';

export interface TiltConfig {
  calibrationFrames: number;
  emaAlpha: number;
  deadZoneDegrees: number;
}

export const DEFAULT_TILT_CONFIG: TiltConfig = {
  calibrationFrames: 15, // ~0.5s at 30fps
  emaAlpha: 0.22,
  deadZoneDegrees: 1.0,
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

  // Case 2: Single-hand steering using anatomical palm roll angle (smooth & consistent on desktop)
  const singlePalm = calculateMobilePalmTilt(landmarks);
  if (singlePalm) {
    const isLeft = Boolean(landmarks.left && !landmarks.right);
    const primaryHand = singlePalm.palmPoint;
    const synthLeft: Landmark = {
      x: lockData ? lockData.leftAnchor.x : 0.28,
      y: lockData ? lockData.leftAnchor.y : defaultBaseY,
      z: primaryHand.z,
    };
    const synthRight: Landmark = {
      x: lockData ? lockData.rightAnchor.x : 0.72,
      y: lockData ? lockData.rightAnchor.y : defaultBaseY,
      z: primaryHand.z,
    };

    return {
      angleRad: singlePalm.angleRad,
      leftHand: isLeft ? primaryHand : synthLeft,
      rightHand: isLeft ? synthRight : primaryHand,
      isSingleHand: true,
    };
  }

  return null;
}

/**
 * Calculates single-hand open-palm roll/tilt angle exclusively for Mobile View.
 * The user holds one hand in front of the screen like an open palm and tilts it left or right.
 * Uses the anatomical palm axis from Wrist (0) through the MCP knuckle center (5, 9, 13, 17)
 * blended with the middle finger tip (12) so rotating the hand left/right smoothly tilts the bar.
 */
export function calculateMobilePalmTilt(
  landmarks: HandLandmarks
): {
  angleRad: number;
  palmPoint: Landmark;
} | null {
  // If both hands are detected, pick the one closer to screen center or larger palm
  let hand: Landmark[] | null = null;
  if (landmarks.right && landmarks.left) {
    const rightDist = Math.hypot(landmarks.right[0].x - 0.5, landmarks.right[0].y - 0.5);
    const leftDist = Math.hypot(landmarks.left[0].x - 0.5, landmarks.left[0].y - 0.5);
    hand = rightDist <= leftDist ? landmarks.right : landmarks.left;
  } else {
    hand = landmarks.right || landmarks.left;
  }

  if (!hand || hand.length < 21) return null;

  const wrist = hand[0];
  const indexMcp = hand[5];
  const middleMcp = hand[9];
  const ringMcp = hand[13];
  const pinkyMcp = hand[17];
  const middleTip = hand[12];

  // Weighted center of the MCP knuckle ridge (anchored on index/middle/ring knuckles)
  const knuckleX = (indexMcp.x + middleMcp.x * 2 + ringMcp.x * 1.5 + pinkyMcp.x * 0.5) / 5;
  const knuckleY = (indexMcp.y + middleMcp.y * 2 + ringMcp.y * 1.5 + pinkyMcp.y * 0.5) / 5;

  // Blend 75% rigid palm axis (wrist -> knuckle ridge) + 25% middle finger axis (wrist -> middle tip)
  const targetX = knuckleX * 0.75 + middleTip.x * 0.25;
  const targetY = knuckleY * 0.75 + middleTip.y * 0.25;

  const dx = targetX - wrist.x;
  const dy = targetY - wrist.y;

  // Guard against degenerate/edge-on hand postures where palm vector length collapses
  const axisLen = Math.hypot(dx, dy);
  if (axisLen < 0.02) return null;

  // In screen space, Y grows downward, so upright palm (12 o'clock) has dx = 0, -dy > 0 -> atan2(0, +) = 0 rad.
  // Tilting top of palm left (dx < 0) -> negative angle (tilts bar left).
  // Tilting top of palm right (dx > 0) -> positive angle (tilts bar right).
  const rawRollRad = Math.atan2(dx, -dy);

  // Apply 1.25x ergonomic gain so a natural ±24° wrist tilt reaches full ±30°+ bar tilt comfortably
  const maxTiltAngleRad = (35 * Math.PI) / 180;
  const clampedAngleRad = Math.max(-maxTiltAngleRad, Math.min(maxTiltAngleRad, rawRollRad * 1.25));

  const centroid = getPalmCentroid(hand);
  return {
    angleRad: clampedAngleRad,
    palmPoint: { ...centroid, z: wrist.z },
  };
}

/**
 * Calibration Hand Lock Engine:
 * Samples baseline neutral angles AND locks physical spatial anchors (Left Anchor, Right Anchor, Baseline Y).
 * Calibration requires BOTH real hands present, held reasonably level and steady.
 */
export class Calibrator {
  private targetFrames: number;
  private sampleCount: number = 0;
  private sumAngleDeg: number = 0;
  private sumLeftX: number = 0;
  private sumLeftY: number = 0;
  private sumRightX: number = 0;
  private sumRightY: number = 0;
  private consecutiveOutliers: number = 0;

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
    this.consecutiveOutliers = 0;
    this.lockData = null;
    this.complete = false;
  }

  public skip(): void {
    if (this.sampleCount >= 8) {
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
   * Samples a live dual-hand frame during calibration.
   * Rejects single-hand fallbacks, extreme tilts (>14 deg), or rapid hand motion (>3.5 deg/frame).
   */
  public update(
    leftHand: Landmark | null,
    rightHand: Landmark | null,
    rawAngleDeg: number
  ): boolean {
    if (this.complete) return true;
    if (!leftHand && !rightHand) return false;

    // Outlier guard: ignore brief 1-2 frame spikes, but re-anchor after 3 consecutive frames
    // so calibration can never deadlock on a tilted first frame.
    if (this.sampleCount > 0) {
      const runningAvg = this.sumAngleDeg / this.sampleCount;
      if (Math.abs(rawAngleDeg - runningAvg) > 16.0) {
        this.consecutiveOutliers++;
        if (this.consecutiveOutliers < 3) {
          return false;
        }
        this.sampleCount = 0;
        this.sumAngleDeg = 0;
        this.sumLeftX = 0;
        this.sumLeftY = 0;
        this.sumRightX = 0;
        this.sumRightY = 0;
        this.consecutiveOutliers = 0;
      } else {
        this.consecutiveOutliers = 0;
      }
    } else if (Math.abs(rawAngleDeg) > 28.0) {
      return false; // Don't start calibration on an extreme tilt
    }

    this.sumAngleDeg += rawAngleDeg;
    const lx = leftHand ? leftHand.x : 0.28;
    const ly = leftHand ? leftHand.y : 0.55;
    const rx = rightHand ? rightHand.x : 0.72;
    const ry = rightHand ? rightHand.y : 0.55;
    this.sumLeftX += lx;
    this.sumLeftY += ly;
    this.sumRightX += rx;
    this.sumRightY += ry;
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

  // Mobile Single-Palm Tilt state (strictly isolated from desktop/landscape):
  private mobilePalmNeutralOffsetDeg: number = 0;
  private lastMobilePalmRawDeg: number = 0;
  private lastMobilePalmPoint: Landmark | null = null;
  private mobileGraceFrames: number = 0;
  private mobilePalmCalibrating: boolean = true;
  private mobilePalmCalibrated: boolean = false;
  private mobilePalmSampleCount: number = 0;
  private mobilePalmSumDeg: number = 0;
  private mobilePalmOutlierCount: number = 0;
  private readonly mobilePalmTargetFrames: number = 10; // ~0.33s at 30fps

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
    this.mobilePalmNeutralOffsetDeg = 0;
    this.mobilePalmCalibrating = true;
    this.mobilePalmCalibrated = false;
    this.mobilePalmSampleCount = 0;
    this.mobilePalmSumDeg = 0;
    this.mobilePalmOutlierCount = 0;
  }

  public skipCalibration(): void {
    this.calibrator.skip();
    this.mobilePalmCalibrating = false;
    this.mobilePalmCalibrated = true;
  }

  /**
   * Captures the user's current single-palm angle as the 0° neutral reference on mobile,
   * or resets to 0° if no hand is currently in view.
   */
  public calibrateMobilePalmZero(): void {
    if (this.mobileGraceFrames > 0 || this.lastMobilePalmPoint !== null) {
      this.mobilePalmNeutralOffsetDeg = Math.max(-25, Math.min(25, this.lastMobilePalmRawDeg));
    } else {
      this.mobilePalmNeutralOffsetDeg = 0;
    }
    this.mobilePalmCalibrating = false;
    this.mobilePalmCalibrated = true;
    this.smoother.reset();
  }

  /**
   * Temporarily locks out palm pause detection (e.g. after starting or resuming game).
   * Prevents accidental pauses while player moves hands from mouse/keyboard to steering posture.
   */
  public lockoutPauseGesture(frames: number = 75): void {
    this.palmCooldown = Math.max(this.palmCooldown, frames);
    this.palmHoldFrames = 0;
  }

  public process(
    landmarks: HandLandmarks,
    isOpenPalm: boolean = false,
    isMobileSinglePalm: boolean = false
  ): TiltDebugState {
    // =========================================================================
    // MOBILE SINGLE-HAND OPEN-PALM TILT MODE (Does not affect Desktop/Landscape)
    // =========================================================================
    if (isMobileSinglePalm) {
      const mobileSample = calculateMobilePalmTilt(landmarks);
      let activeAngleRad: number | null = null;
      let activePalmPoint: Landmark | null = null;

      if (mobileSample) {
        activeAngleRad = mobileSample.angleRad;
        activePalmPoint = mobileSample.palmPoint;
        this.lastMobilePalmRawDeg = (activeAngleRad * 180) / Math.PI;
        this.lastMobilePalmPoint = activePalmPoint;
        this.mobileGraceFrames = 14;
      } else if (this.mobileGraceFrames > 0 && this.lastMobilePalmPoint) {
        this.mobileGraceFrames--;
        this.lastMobilePalmRawDeg *= 0.92;
        activeAngleRad = (this.lastMobilePalmRawDeg * Math.PI) / 180;
        activePalmPoint = this.lastMobilePalmPoint;
      } else {
        this.mobileGraceFrames = 0;
        this.lastMobilePalmPoint = null;
      }

      const rawAngleDeg = activeAngleRad !== null ? (activeAngleRad * 180) / Math.PI : 0;

      // Active Mobile Palm Calibration logic (provides live steering preview while locking neutral!)
      if (this.mobilePalmCalibrating) {
        if (activePalmPoint !== null) {
          let acceptSample = true;
          if (this.mobilePalmSampleCount > 0) {
            const currentAvg = this.mobilePalmSumDeg / this.mobilePalmSampleCount;
            if (Math.abs(rawAngleDeg - currentAvg) > 18.0) {
              this.mobilePalmOutlierCount++;
              if (this.mobilePalmOutlierCount < 3) {
                acceptSample = false;
              } else {
                // User repositioned palm to a new angle — re-anchor cleanly instead of deadlocking
                this.mobilePalmSampleCount = 0;
                this.mobilePalmSumDeg = 0;
                this.mobilePalmOutlierCount = 0;
              }
            } else {
              this.mobilePalmOutlierCount = 0;
            }
          }

          if (acceptSample) {
            this.mobilePalmSumDeg += rawAngleDeg;
            this.mobilePalmSampleCount++;
          }

          if (this.mobilePalmSampleCount >= this.mobilePalmTargetFrames) {
            this.mobilePalmNeutralOffsetDeg = Math.max(
              -25,
              Math.min(25, this.mobilePalmSumDeg / this.mobilePalmSampleCount)
            );
            this.mobilePalmCalibrating = false;
            this.mobilePalmCalibrated = true;
            this.mobilePalmOutlierCount = 0;
          }
        }

        const calibProgress = Math.min(1, this.mobilePalmSampleCount / this.mobilePalmTargetFrames);

        // Provide immediate live steering feedback in the background during the ~0.33s calibration
        let liveSmoothedDeg = 0;
        let liveFinalDeg = 0;
        if (activePalmPoint !== null) {
          liveSmoothedDeg = this.smoother.update(rawAngleDeg);
          const liveDeadZonedDeg = applyDeadZone(liveSmoothedDeg, this.deadZoneDeg);
          const maxSlew = 3.6;
          const liveDelta = liveDeadZonedDeg - this.prevFinalDeg;
          liveFinalDeg = this.prevFinalDeg + Math.max(-maxSlew, Math.min(maxSlew, liveDelta));
          this.prevFinalDeg = liveFinalDeg;
        } else {
          this.prevFinalDeg *= 0.88;
          liveFinalDeg = Math.abs(this.prevFinalDeg) < 0.2 ? 0 : this.prevFinalDeg;
          this.prevFinalDeg = liveFinalDeg;
          liveSmoothedDeg = liveFinalDeg;
        }
        const liveFinalRad = (liveFinalDeg * Math.PI) / 180;

        return {
          hasBothHands: Boolean(activePalmPoint),
          leftHand: landmarks.left ? activePalmPoint : null,
          rightHand: landmarks.right ? activePalmPoint : activePalmPoint,
          rawAngleRad: activeAngleRad ?? 0,
          rawAngleDeg,
          calibratedAngleDeg: rawAngleDeg,
          smoothedAngleDeg: liveSmoothedDeg,
          finalAngleDeg: liveFinalDeg,
          finalAngleRad: liveFinalRad,
          isCalibrating: this.mobilePalmCalibrating,
          calibrationProgress: calibProgress,
          isCalibrated: this.mobilePalmCalibrated,
          neutralOffsetDeg: this.mobilePalmNeutralOffsetDeg,
          isOpenPalm: Boolean(activePalmPoint),
          palmPauseTriggered: false,
          leftHandHeight: activePalmPoint?.y ?? 0.5,
          rightHandHeight: activePalmPoint?.y ?? 0.5,
          isHandTrackingActive: Boolean(activePalmPoint),
          isSingleHandMode: true,
          isHandLockActive: this.mobilePalmCalibrated,
          lockedLeftAnchor: null,
          lockedRightAnchor: null,
          lockedBaselineY: 0.55,
          handLockStatus: this.mobilePalmCalibrated ? 'LOCKED' : activePalmPoint ? 'LOCKING' : 'SEARCHING',
        };
      }

      // Normal active steering mode
      if (activeAngleRad === null || !activePalmPoint) {
        this.prevFinalDeg *= 0.88;
        const decayedDeg = Math.abs(this.prevFinalDeg) < 0.2 ? 0 : this.prevFinalDeg;
        this.prevFinalDeg = decayedDeg;
        const decayedRad = (decayedDeg * Math.PI) / 180;
        return {
          hasBothHands: false,
          leftHand: null,
          rightHand: null,
          rawAngleRad: 0,
          rawAngleDeg: 0,
          calibratedAngleDeg: 0,
          smoothedAngleDeg: decayedDeg,
          finalAngleDeg: decayedDeg,
          finalAngleRad: decayedRad,
          isCalibrating: false,
          calibrationProgress: 1,
          isCalibrated: this.mobilePalmCalibrated,
          neutralOffsetDeg: this.mobilePalmNeutralOffsetDeg,
          isOpenPalm: false,
          palmPauseTriggered: false, // Mobile uses on-screen pause button only
          leftHandHeight: 0.5,
          rightHandHeight: 0.5,
          isHandTrackingActive: false,
          isSingleHandMode: true,
          isHandLockActive: this.mobilePalmCalibrated,
          lockedLeftAnchor: null,
          lockedRightAnchor: null,
          lockedBaselineY: 0.55,
          handLockStatus: 'SEARCHING',
        };
      }

      const calibratedDeg = Math.max(-35, Math.min(35, rawAngleDeg - this.mobilePalmNeutralOffsetDeg));
      const smoothedDeg = this.smoother.update(calibratedDeg);
      const deadZonedDeg = applyDeadZone(smoothedDeg, this.deadZoneDeg);

      const maxSlewDegPerFrame = 3.6;
      const delta = deadZonedDeg - this.prevFinalDeg;
      const finalDeg = this.prevFinalDeg + Math.max(-maxSlewDegPerFrame, Math.min(maxSlewDegPerFrame, delta));
      this.prevFinalDeg = finalDeg;
      const finalRad = (finalDeg * Math.PI) / 180;

      return {
        hasBothHands: true,
        leftHand: landmarks.left ? activePalmPoint : null,
        rightHand: landmarks.right ? activePalmPoint : activePalmPoint,
        rawAngleRad: activeAngleRad,
        rawAngleDeg,
        calibratedAngleDeg: calibratedDeg,
        smoothedAngleDeg: smoothedDeg,
        finalAngleDeg: finalDeg,
        finalAngleRad: finalRad,
        isCalibrating: false,
        calibrationProgress: 1,
        isCalibrated: this.mobilePalmCalibrated,
        neutralOffsetDeg: this.mobilePalmNeutralOffsetDeg,
        isOpenPalm: true,
        palmPauseTriggered: false, // Mobile uses on-screen pause button only
        leftHandHeight: activePalmPoint.y,
        rightHandHeight: activePalmPoint.y,
        isHandTrackingActive: true,
        isSingleHandMode: true,
        isHandLockActive: true,
        lockedLeftAnchor: null,
        lockedRightAnchor: null,
        lockedBaselineY: 0.55,
        handLockStatus: 'LOCKED',
      };
    }

    // =========================================================================
    // DESKTOP / LANDSCAPE DUAL-HAND PIPELINE (100% Unchanged)
    // =========================================================================
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
    const liveRaw = calculateRawTilt(landmarks, lockData);
    // True ONLY when both physical hands are actively detected in the current live frame
    const isLiveDualHand = Boolean(liveRaw && !liveRaw.isSingleHand);

    let raw = liveRaw;

    // Tracking Grace: if hands dip or momentarily leave frame AFTER calibration, hold & gently decay for ~350ms
    if (raw) {
      this.lastValidRaw = raw;
      this.graceFramesRemaining = 18;
    } else if (this.calibrator.isComplete && this.lastValidRaw && this.graceFramesRemaining > 0) {
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
      this.graceFramesRemaining = 0;
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

    // Calibration phase: advances when BOTH real hands are present, while still providing live steering!
    if (!this.calibrator.isComplete) {
      if (isLiveDualHand) {
        this.calibrator.update(raw.leftHand, raw.rightHand, rawAngleDeg);
      }
      const liveSmoothedDeg = this.smoother.update(rawAngleDeg);
      const liveDeadZonedDeg = applyDeadZone(liveSmoothedDeg, this.deadZoneDeg);
      const maxSlew = 3.2;
      const liveDelta = liveDeadZonedDeg - this.prevFinalDeg;
      const liveFinalDeg = this.prevFinalDeg + Math.max(-maxSlew, Math.min(maxSlew, liveDelta));
      this.prevFinalDeg = liveFinalDeg;
      const liveFinalRad = (liveFinalDeg * Math.PI) / 180;

      return {
        hasBothHands: isLiveDualHand,
        leftHand: landmarks.left ? raw.leftHand : null,
        rightHand: landmarks.right ? raw.rightHand : null,
        rawAngleRad: raw.angleRad,
        rawAngleDeg,
        calibratedAngleDeg: rawAngleDeg,
        smoothedAngleDeg: liveSmoothedDeg,
        finalAngleDeg: liveFinalDeg,
        finalAngleRad: liveFinalRad,
        isCalibrating: !this.calibrator.isComplete,
        calibrationProgress: this.calibrator.progress,
        isCalibrated: this.calibrator.isComplete,
        neutralOffsetDeg: this.calibrator.neutralOffset,
        isOpenPalm,
        palmPauseTriggered,
        leftHandHeight: landmarks.left ? raw.leftHand.y : 0.5,
        rightHandHeight: landmarks.right ? raw.rightHand.y : 0.5,
        isHandTrackingActive: true,
        isSingleHandMode: raw.isSingleHand,
        isHandLockActive: this.calibrator.isComplete,
        lockedLeftAnchor: this.calibrator.getLockData()?.leftAnchor ?? null,
        lockedRightAnchor: this.calibrator.getLockData()?.rightAnchor ?? null,
        lockedBaselineY: this.calibrator.getLockData()?.baselineY ?? 0.55,
        handLockStatus: this.calibrator.isComplete ? 'LOCKED' : 'LOCKING',
      };
    }

    // Hand Lock active: Anti-Spike Protection on single-hand flicker & Open-Palm Pause freeze
    let calibratedDeg: number;
    let effectiveSingleHand = raw.isSingleHand;

    if (!raw.isSingleHand) {
      // Both hands present and locked
      calibratedDeg = rawAngleDeg - this.calibrator.neutralOffset;
      this.lastDualHandAngleDeg = calibratedDeg;
      this.singleHandDropoutCounter = 0;
    } else if (isOpenPalm) {
      // User is holding up a single open palm to pause/resume: freeze steering angle so ball doesn't swerve!
      calibratedDeg = this.prevFinalDeg;
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
