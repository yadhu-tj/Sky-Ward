import { useState, useEffect, useRef, useCallback } from 'react';
import { screenTiltDegrees } from '../input/orientation';

export interface DeviceOrientationState {
  isSupported: boolean;
  isPermissionRequired: boolean;
  isPermissionGranted: boolean;
  tiltAngleRad: number;
  tiltAngleDeg: number;
  rawGamma: number | null;
  rawBeta: number | null;
  error: string | null;
}

/**
 * Mobile Device Orientation & Gyroscope hook.
 * Maps physical smartphone tilt into responsive arcade bar tilt angle.
 * Supports iOS Safari permission handshake (DeviceOrientationEvent.requestPermission)
 * and Android sensors with zero-calibration offset, EMA smoothing, and deadzone filtering.
 */
export function useDeviceOrientation() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isPermissionRequired, setIsPermissionRequired] = useState<boolean>(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [tiltAngleRad, setTiltAngleRad] = useState<number>(0);
  const [tiltAngleDeg, setTiltAngleDeg] = useState<number>(0);
  const [hasReceivedReading, setHasReceivedReading] = useState<boolean>(false);

  const neutralOffsetDegRef = useRef<number>(0);
  const smoothedAngleDegRef = useRef<number>(0);
  const rawGammaRef = useRef<number | null>(null);
  const rawBetaRef = useRef<number | null>(null);
  const hasReceivedReadingRef = useRef<boolean>(false);
  const pendingCalibrationRef = useRef(true);
  const previousScreenAngleRef = useRef<number | null>(null);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      setIsSupported(true);

      const DeviceOrientationEventAny = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };

      if (typeof DeviceOrientationEventAny.requestPermission === 'function') {
        setIsPermissionRequired(true);
        // On iOS, permission must be requested via user gesture
        setIsPermissionGranted(false);
      } else {
        // Android / non-iOS standard browsers do not require prompt
        setIsPermissionRequired(false);
        setIsPermissionGranted(true);
      }
    } else {
      setIsSupported(false);
    }
  }, []);

  // Calibrate current holding angle as level (0 degrees)
  const calibrateNeutral = useCallback(() => {
    const isLandscape = window.innerWidth > window.innerHeight;
    const currentAngle = screenTiltDegrees(
      rawGammaRef.current, rawBetaRef.current, isLandscape,
      window.screen?.orientation?.angle ?? window.orientation ?? 0,
    );
    pendingCalibrationRef.current = !hasReceivedReadingRef.current;
    neutralOffsetDegRef.current = currentAngle;
    smoothedAngleDegRef.current = 0;
    setTiltAngleRad(0);
    setTiltAngleDeg(0);
  }, []);

  // Request permission (Required for iOS Safari 13+)
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const DeviceOrientationEventAny = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationEventAny?.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEventAny.requestPermission();
        if (response === 'granted') {
          setIsPermissionGranted(true);
          setError(null);
          calibrateNeutral();
          return true;
        } else {
          setIsPermissionGranted(false);
          setError('Motion permission denied. Enable motion sensors in iOS Safari settings.');
          return false;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to request motion permission';
        setError(msg);
        return false;
      }
    } else {
      setIsPermissionGranted(true);
      return true;
    }
  }, [calibrateNeutral]);

  // Main motion sensor listener
  useEffect(() => {
    if (!isSupported || !isPermissionGranted) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma; // Left-to-right tilt in portrait [-90, 90]
      const beta = e.beta;   // Front-to-back tilt in portrait [-180, 180]

      rawGammaRef.current = gamma;
      rawBetaRef.current = beta;

      if (gamma === null && beta === null) return;

      if (!hasReceivedReadingRef.current) {
        hasReceivedReadingRef.current = true;
        setHasReceivedReading(true);
      }

      const isLandscape = window.innerWidth > window.innerHeight;
      const orientation = window.screen?.orientation?.angle ?? window.orientation ?? 0;
      const rawTiltDeg = screenTiltDegrees(gamma, beta, isLandscape, orientation);
      // A rotation changes the sensor axis; establish a new neutral on its first reading.
      const screenAngle = isLandscape ? orientation : -1;
      if (pendingCalibrationRef.current || previousScreenAngleRef.current !== screenAngle) {
        neutralOffsetDegRef.current = rawTiltDeg;
        smoothedAngleDegRef.current = 0;
        pendingCalibrationRef.current = false;
        previousScreenAngleRef.current = screenAngle;
      }

      // Offset by user's neutral calibrated angle
      const calibratedDeg = rawTiltDeg - neutralOffsetDegRef.current;

      // Deadzone filter (±1.5 degrees to avoid micro-jitter while resting hands)
      const deadzoneDeg = 1.5;
      let deadzonedDeg = 0;
      if (Math.abs(calibratedDeg) > deadzoneDeg) {
        const sign = Math.sign(calibratedDeg);
        deadzonedDeg = sign * (Math.abs(calibratedDeg) - deadzoneDeg);
      }

      // Clamp max tilt angle to ±25 degrees (matches game physics limit)
      const maxAngleDeg = 25;
      const clampedDeg = Math.max(-maxAngleDeg, Math.min(maxAngleDeg, deadzonedDeg));

      // Responsive EMA smoother (alpha = 0.28 for rapid crisp response)
      const alpha = 0.28;
      const smoothed = alpha * clampedDeg + (1 - alpha) * smoothedAngleDegRef.current;
      smoothedAngleDegRef.current = smoothed;

      const rad = (smoothed * Math.PI) / 180;
      setTiltAngleDeg(smoothed);
      setTiltAngleRad(rad);
    };

    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isSupported, isPermissionGranted]);

  return {
    isSupported,
    isPermissionRequired,
    isPermissionGranted,
    hasReceivedReading,
    tiltAngleRad,
    tiltAngleDeg,
    rawGamma: rawGammaRef.current,
    rawBeta: rawBetaRef.current,
    error,
    requestPermission,
    calibrateNeutral,
  };
}
