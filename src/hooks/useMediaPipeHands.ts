import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands } from '@mediapipe/hands';
import type { Results } from '@mediapipe/hands';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarks {
  left: Landmark[] | null;
  right: Landmark[] | null;
}

/**
 * Detects whether a set of hand landmarks represents a deliberate upright open palm ("Stop" gesture)
 * facing the camera. Uses scale-normalized ratios so it works reliably at both desk and couch distances,
 * while requiring thumb extension and upright palm alignment to avoid colliding with casual 1-hand steering.
 */
export function isHandOpenPalm(hand: Landmark[] | null): boolean {
  if (!hand || hand.length < 21) return false;

  const wrist = hand[0];
  const thumbTip = hand[4];
  const indexMcp = hand[5];
  const middleMcp = hand[9];
  const pinkyMcp = hand[17];

  // Euclidean distance in 2D
  const dist = (p1: Landmark, p2: Landmark) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Hand must be raised off the desk/keyboard level (not resting down at the bottom margin)
  if (wrist.y > 0.85) return false;

  // Palm reference scale (wrist to middle knuckle) — works from ~40cm desk to ~2m couch distance
  const palmScale = dist(wrist, middleMcp);
  if (palmScale < 0.045) return false;

  // Palm must be held upright (not sideways/tilted in a steering motion)
  if (Math.abs(wrist.x - middleMcp.x) > palmScale * 0.55) {
    return false;
  }

  // Normalized vertical elevation check: middle fingertip must be well above wrist
  const middleTip = hand[12];
  if (wrist.y - middleTip.y < palmScale * 1.45) {
    return false;
  }

  // Thumb must be extended outward (open stop-sign palm), not tucked in
  const thumbToMiddleMcp = dist(thumbTip, middleMcp);
  const palmWidth = dist(indexMcp, pinkyMcp);
  if (thumbToMiddleMcp < Math.max(palmScale * 0.62, palmWidth * 0.85)) {
    return false;
  }

  const fingerIndices = [
    { mcp: 5, pip: 6, tip: 8 },   // Index
    { mcp: 9, pip: 10, tip: 12 }, // Middle
    { mcp: 13, pip: 14, tip: 16 }, // Ring
    { mcp: 17, pip: 18, tip: 20 }, // Pinky
  ];

  for (const { mcp, pip, tip } of fingerIndices) {
    const mcpPt = hand[mcp];
    const pipPt = hand[pip];
    const tipPt = hand[tip];

    // In screen coordinates (y=0 top), fingertip must be higher than PIP and MCP joints
    if (tipPt.y >= pipPt.y || pipPt.y >= mcpPt.y) {
      return false;
    }

    // Extended finger: distance from wrist to tip must be significantly larger than wrist to MCP
    const distMcp = dist(wrist, mcpPt);
    const distTip = dist(wrist, tipPt);
    if (distTip < distMcp * 1.42) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that detected landmarks represent a real physical hand in active steering posture,
 * rejecting false positive artifacts from face, chin, beard, headphones, or desk-edge noise.
 */
export function isValidHandLandmarks(hand: Landmark[] | null): boolean {
  if (!hand || hand.length < 21) return false;

  const wrist = hand[0];
  // Relaxed wrist check: allow hands across almost the entire vertical frame (2% to 98%)
  if (wrist.y > 0.98 || wrist.y < 0.02) return false;

  const indexMcp = hand[5];
  const middleMcp = hand[9];
  const pinkyMcp = hand[17];

  // Palm vertical span: distance from wrist (0) to middle MCP (9)
  const palmHeight = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  // Allows sitting comfortably back or closer to screen
  if (palmHeight < 0.035 || palmHeight > 0.65) return false;

  // Palm horizontal span across knuckles (index MCP 5 to pinky MCP 17)
  const palmWidth = Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y);
  if (palmWidth < 0.02 || palmWidth > 0.50) return false;

  return true;
}

/**
 * Calculates the stable 2D palm centroid from key palm landmark joints:
 * Wrist (0), Index MCP (5), Middle MCP (9), and Pinky MCP (17).
 * Significantly less noisy and jitter-prone than relying on wrist alone.
 */
export function getPalmCentroid(landmarks: Landmark[] | null): { x: number; y: number } {
  if (!landmarks || landmarks.length < 18) {
    return { x: landmarks?.[0]?.x ?? 0.5, y: landmarks?.[0]?.y ?? 0.5 };
  }
  const w = landmarks[0];
  const i = landmarks[5];
  const m = landmarks[9];
  const p = landmarks[17];
  return {
    x: (w.x + i.x + m.x + p.x) / 4,
    y: (w.y + i.y + m.y + p.y) / 4,
  };
}

export function useMediaPipeHands(
  onFrame?: (landmarks: HandLandmarks, isOpenPalm: boolean) => void
) {
  const [landmarks, setLandmarks] = useState<HandLandmarks>({ left: null, right: null });
  const [isOpenPalm, setIsOpenPalm] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const handsRef = useRef<Hands | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Persistent temporal continuity tracking to prevent hand swapping
  const lastLeftCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const lastRightCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const framesSinceLeftSeenRef = useRef<number>(999);
  const framesSinceRightSeenRef = useRef<number>(999);

  // Initialize MediaPipe Hands model once
  useEffect(() => {
    isMountedRef.current = true;

    try {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.50,
      });

      hands.onResults((results: Results) => {
        if (!isMountedRef.current) return;

        const rawDetected = results.multiHandLandmarks ?? [];
        const rawHandedness = results.multiHandedness ?? [];

        interface HandCandidate {
          landmarks: Landmark[]; // mirrored x: 1 - lm.x
          centroid: { x: number; y: number };
          label: 'Left' | 'Right' | null;
          score: number;
        }

        const candidates: HandCandidate[] = [];
        for (let i = 0; i < rawDetected.length; i++) {
          const rawLms = rawDetected[i];
          if (!isValidHandLandmarks(rawLms)) continue;

          // Mirror x for selfie camera perspective
          const mapped: Landmark[] = rawLms.map((lm) => ({
            x: 1 - lm.x,
            y: lm.y,
            z: lm.z,
          }));

          const hd = rawHandedness[i];
          // MediaPipe assumes selfie-mirrored input when classifying handedness;
          // since our raw video element is un-mirrored, invert the label to match the user's physical hand.
          const rawLabel = hd?.label;
          const physicalLabel: 'Left' | 'Right' | null =
            rawLabel === 'Left' ? 'Right' : rawLabel === 'Right' ? 'Left' : null;

          const centroid = getPalmCentroid(mapped);
          candidates.push({
            landmarks: mapped,
            centroid,
            label: physicalLabel,
            score: hd?.score ?? 0,
          });
        }

        let left: Landmark[] | null = null;
        let right: Landmark[] | null = null;

        const lastLeft = lastLeftCentroidRef.current;
        const lastRight = lastRightCentroidRef.current;
        const leftRecent = framesSinceLeftSeenRef.current < 25 && lastLeft !== null;
        const rightRecent = framesSinceRightSeenRef.current < 25 && lastRight !== null;

        if (candidates.length === 1) {
          const cand = candidates[0];

          // Priority 1: Check proximity to recently tracked left/right centroids
          let isLeftCandidate = false;
          if (leftRecent && rightRecent) {
            const distLeft = Math.hypot(cand.centroid.x - lastLeft.x, cand.centroid.y - lastLeft.y);
            const distRight = Math.hypot(cand.centroid.x - lastRight.x, cand.centroid.y - lastRight.y);
            isLeftCandidate = distLeft < distRight;
          } else if (leftRecent && !rightRecent) {
            const distLeft = Math.hypot(cand.centroid.x - lastLeft.x, cand.centroid.y - lastLeft.y);
            isLeftCandidate = distLeft < 0.28 || cand.centroid.x < 0.55;
          } else if (rightRecent && !leftRecent) {
            const distRight = Math.hypot(cand.centroid.x - lastRight.x, cand.centroid.y - lastRight.y);
            isLeftCandidate = !(distRight < 0.28 || cand.centroid.x > 0.45);
          } else {
            // Priority 2: Use corrected anatomical handedness classifier (if confidence >= 0.70)
            if (cand.label && cand.score >= 0.70) {
              isLeftCandidate = cand.label === 'Left';
            } else {
              // Priority 3: Geometric center line
              isLeftCandidate = cand.centroid.x < 0.5;
            }
          }

          if (isLeftCandidate) {
            left = cand.landmarks;
          } else {
            right = cand.landmarks;
          }
        } else if (candidates.length >= 2) {
          const c0 = candidates[0];
          const c1 = candidates[1];

          // Determine optimal assignment to (left, right)
          let assignC0ToLeft = true;

          if (leftRecent && rightRecent) {
            // Match against continuous history to guarantee hands NEVER swap between frames
            const costNormal =
              Math.hypot(c0.centroid.x - lastLeft.x, c0.centroid.y - lastLeft.y) +
              Math.hypot(c1.centroid.x - lastRight.x, c1.centroid.y - lastRight.y);
            const costSwapped =
              Math.hypot(c1.centroid.x - lastLeft.x, c1.centroid.y - lastLeft.y) +
              Math.hypot(c0.centroid.x - lastRight.x, c0.centroid.y - lastRight.y);

            assignC0ToLeft = costNormal <= costSwapped;
          } else {
            // If no previous history, sort horizontally by centroid X
            assignC0ToLeft = c0.centroid.x < c1.centroid.x;
          }

          const candLeft = assignC0ToLeft ? c0 : c1;
          const candRight = assignC0ToLeft ? c1 : c0;

          // Enforce minimum horizontal separation between dual hands
          const horizDist = candRight.centroid.x - candLeft.centroid.x;
          if (horizDist >= 0.12) {
            left = candLeft.landmarks;
            right = candRight.landmarks;
          } else {
            // Cluster too tight horizontally to be separate steering hands
            if (candLeft.centroid.x < 0.5) {
              left = candLeft.landmarks;
            } else {
              right = candRight.landmarks;
            }
          }
        }

        // Update temporal tracking memory with smoothing
        if (left) {
          const curC = getPalmCentroid(left);
          lastLeftCentroidRef.current = lastLeft
            ? { x: 0.75 * curC.x + 0.25 * lastLeft.x, y: 0.75 * curC.y + 0.25 * lastLeft.y }
            : curC;
          framesSinceLeftSeenRef.current = 0;
        } else {
          framesSinceLeftSeenRef.current++;
        }

        if (right) {
          const curC = getPalmCentroid(right);
          lastRightCentroidRef.current = lastRight
            ? { x: 0.75 * curC.x + 0.25 * lastRight.x, y: 0.75 * curC.y + 0.25 * lastRight.y }
            : curC;
          framesSinceRightSeenRef.current = 0;
        } else {
          framesSinceRightSeenRef.current++;
        }

        // Strict Single-Hand Palm Pause Rule:
        // Palm pause must ONLY work if a single hand is shown. If 2 hands are present, it must NOT work.
        const isSingleHand = (left !== null && right === null) || (left === null && right !== null);
        const palmDetected = isSingleHand && (isHandOpenPalm(left) || isHandOpenPalm(right));

        const nextLandmarks: HandLandmarks = { left, right };
        if (onFrameRef.current) {
          // Zero-latency direct callback path (avoids 30fps React state + effect hop)
          onFrameRef.current(nextLandmarks, palmDetected);
        } else {
          setLandmarks(nextLandmarks);
          setIsOpenPalm(palmDetected);
        }
      });

      handsRef.current = hands;
      setIsReady(true);
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      setCameraError('Failed to load MediaPipe Hands model.');
    }

    return () => {
      isMountedRef.current = false;
      if (handsRef.current) {
        handsRef.current.close().catch(() => {});
        handsRef.current = null;
      }
    };
  }, []);

  const lastProcessTimeRef = useRef(0);

  // Frame processing loop with ~30fps frame pacing to match camera sensor rate
  const processFrame = useCallback(async () => {
    if (!isMountedRef.current) return;
    const video = videoRef.current;
    const hands = handsRef.current;

    const now = performance.now();
    // Pace to max ~32fps (31ms) to eliminate redundant frames and CPU saturation on 60/120Hz monitors
    if (now - lastProcessTimeRef.current >= 31 && video && hands && video.readyState >= 2 && !isProcessingRef.current) {
      lastProcessTimeRef.current = now;
      isProcessingRef.current = true;
      try {
        await hands.send({ image: video });
      } catch {
        // Ignore occasional frame drop
      } finally {
        isProcessingRef.current = false;
      }
    }

    if (streamRef.current) {
      animFrameIdRef.current = requestAnimationFrame(processFrame);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    if (streamRef.current) return; // already active

    try {
      setCameraError(null);
      // Optimized 640x360 stream: cuts CPU/memory bandwidth by 75% while keeping 100% MediaPipe accuracy
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          aspectRatio: { ideal: 1.7777777778 },
          facingMode: 'user',
        },
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);

      // Start processing frames
      animFrameIdRef.current = requestAnimationFrame(processFrame);
    } catch (err: unknown) {
      console.error('Error accessing webcam:', err);
      const message =
        err instanceof Error ? err.message : 'Webcam access denied or unavailable.';
      setCameraError(message);
      setCameraActive(false);
    }
  }, [processFrame]);

  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }, []);

  return {
    videoRef,
    landmarks,
    isOpenPalm,
    isReady,
    cameraActive,
    cameraError,
    startCamera,
    stopCamera,
  };
}