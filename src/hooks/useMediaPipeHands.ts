import { useEffect, useRef, useState, useCallback } from 'react';
import * as mpHands from '@mediapipe/hands';
import type { Hands as HandsInstance, Results } from '@mediapipe/hands';

const MEDIAPIPE_HANDS_VERSION = '0.4.1675469240';
const MEDIAPIPE_FALLBACK_BASES = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}`,
  `https://unpkg.com/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}`,
];

function getSameOriginMediaPipeBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalizedBase}mediapipe/hands`;
  }
  return `${normalizedBase}mediapipe/hands`;
}

function getCandidateBaseUrls(): string[] {
  return [getSameOriginMediaPipeBaseUrl(), ...MEDIAPIPE_FALLBACK_BASES];
}

async function isBaseUrlReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/hands.binarypb`, { method: 'GET' });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) return false;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 100;
  } catch {
    return false;
  }
}

let resolvedBaseUrlPromise: Promise<string> | null = null;

function resolveMediaPipeBaseUrl(): Promise<string> {
  if (!resolvedBaseUrlPromise) {
    resolvedBaseUrlPromise = (async () => {
      const candidates = getCandidateBaseUrls();
      for (const baseUrl of candidates) {
        if (await isBaseUrlReachable(baseUrl)) {
          return baseUrl;
        }
      }
      // If all probes failed (e.g. opaque CORS), reset cache so future mounts can retry
      resolvedBaseUrlPromise = null;
      return candidates[0];
    })();
  }
  return resolvedBaseUrlPromise;
}

type HandsConstructor = new (config?: {
  locateFile?: (file: string, prefix?: string) => string;
}) => HandsInstance;

function resolveHandsConstructor(): HandsConstructor | null {
  const mod = mpHands as unknown as {
    Hands?: HandsConstructor;
    default?: { Hands?: HandsConstructor };
  };
  const globalScope = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
    Hands?: HandsConstructor;
  };
  const ctor = mod?.Hands ?? mod?.default?.Hands ?? globalScope?.Hands;
  return typeof ctor === 'function' ? ctor : null;
}

function loadScriptFromUrl(scriptSrc: string): Promise<HandsConstructor | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
    if (existing) {
      const already = resolveHandsConstructor();
      if (already) {
        resolve(already);
        return;
      }
      existing.addEventListener('load', () => resolve(resolveHandsConstructor()), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => resolve(resolveHandsConstructor());
    script.onerror = () => {
      script.remove();
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

let handsScriptPromise: Promise<HandsConstructor | null> | null = null;

function loadHandsConstructor(preferredBaseUrl: string): Promise<HandsConstructor | null> {
  const immediate = resolveHandsConstructor();
  if (immediate) return Promise.resolve(immediate);
  if (typeof document === 'undefined') return Promise.resolve(null);

  if (!handsScriptPromise) {
    const orderedBases = Array.from(new Set([preferredBaseUrl, ...getCandidateBaseUrls()]));
    handsScriptPromise = (async () => {
      for (const baseUrl of orderedBases) {
        const ctor = await loadScriptFromUrl(`${baseUrl}/hands.js`);
        if (ctor) return ctor;
      }
      handsScriptPromise = null;
      return null;
    })();
  }
  return handsScriptPromise;
}

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
  // Valid coordinates check: allow hands entering from bottom (wrist.y > 1.0) or edges
  if (isNaN(wrist.x) || isNaN(wrist.y)) return false;
  if (wrist.y > 1.25 || wrist.y < -0.25 || wrist.x > 1.25 || wrist.x < -0.25) return false;

  const indexMcp = hand[5];
  const middleMcp = hand[9];
  const pinkyMcp = hand[17];

  // Palm vertical span: distance from wrist (0) to middle MCP (9)
  const palmHeight = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  // Allows sitting comfortably back on desktop or holding palm closer to a phone screen
  if (palmHeight < 0.02 || palmHeight > 0.95) return false;

  // Palm horizontal span across knuckles (index MCP 5 to pinky MCP 17)
  const palmWidth = Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y);
  if (palmWidth < 0.015 || palmWidth > 0.85) return false;

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
  const [modelError, setModelError] = useState<string | null>(null);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const handsRef = useRef<HandsInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  const consecutiveSendErrorsRef = useRef(0);

  // Persistent temporal continuity tracking to prevent hand swapping
  const lastLeftCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const lastRightCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const framesSinceLeftSeenRef = useRef<number>(999);
  const framesSinceRightSeenRef = useRef<number>(999);

  // Initialize MediaPipe Hands model once
  useEffect(() => {
    isMountedRef.current = true;
    isProcessingRef.current = false;
    let cancelled = false;

    const initHands = async () => {
      try {
        const handsBaseUrl = await resolveMediaPipeBaseUrl();
        if (cancelled || !isMountedRef.current) return;

        const HandsCtor = await loadHandsConstructor(handsBaseUrl);
        if (cancelled || !isMountedRef.current) return;
        if (!HandsCtor) {
          throw new Error('MediaPipe Hands constructor unavailable');
        }

        const hands = new HandsCtor({
          locateFile: (file) => `${handsBaseUrl}/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.48,
          minTrackingConfidence: 0.45,
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

          let isLeftCandidate: boolean;
          if (leftRecent && !rightRecent) {
            // Strong hysteresis: keep as left unless it moves decidedly to the right half (> 0.68)
            isLeftCandidate = cand.centroid.x < 0.68;
          } else if (rightRecent && !leftRecent) {
            // Strong hysteresis: keep as right unless it moves decidedly to the left half (< 0.32)
            isLeftCandidate = cand.centroid.x < 0.32;
          } else if (leftRecent && rightRecent) {
            // If both were recently seen, pick the closer centroid to preserve continuity
            const distLeft = Math.hypot(cand.centroid.x - lastLeft.x, cand.centroid.y - lastLeft.y);
            const distRight = Math.hypot(cand.centroid.x - lastRight.x, cand.centroid.y - lastRight.y);
            isLeftCandidate = distLeft <= distRight;
          } else {
            // First detection: prefer anatomical handedness classifier if confidence is good
            if (cand.label && cand.score >= 0.65) {
              isLeftCandidate = cand.label === 'Left';
            } else {
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
        setModelError(null);
        setIsReady(true);
        if (streamRef.current && !animFrameIdRef.current) {
          animFrameIdRef.current = requestAnimationFrame(processFrameRef.current);
        }
      } catch (err) {
        console.error('Failed to initialize MediaPipe Hands:', err);
        if (!cancelled && isMountedRef.current) {
          setModelError('Failed to load hand-tracking model.');
        }
      }
    };

    void initHands();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      isProcessingRef.current = false;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (handsRef.current) {
        handsRef.current.close().catch(() => {});
        handsRef.current = null;
      }
    };
  }, []);

  const lastProcessTimeRef = useRef(0);

  // Frame processing loop with ~30fps frame pacing to match camera sensor rate
  const processFrame = useCallback(async () => {
    animFrameIdRef.current = null;
    if (!isMountedRef.current) return;
    const video = videoRef.current;
    const hands = handsRef.current;

    const now = performance.now();
    // Pace to max ~32fps (31ms) to eliminate redundant frames and CPU saturation on 60/120Hz monitors
    if (
      now - lastProcessTimeRef.current >= 31 &&
      video &&
      hands &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      !isProcessingRef.current
    ) {
      lastProcessTimeRef.current = now;
      isProcessingRef.current = true;
      try {
        await hands.send({ image: video });
        if (consecutiveSendErrorsRef.current > 0) {
          consecutiveSendErrorsRef.current = 0;
          setModelError(null);
        }
      } catch (err) {
        consecutiveSendErrorsRef.current++;
        if (consecutiveSendErrorsRef.current === 10) {
          console.error('MediaPipe Hands frame processing failed repeatedly:', err);
          setModelError('Hand tracking encountered a runtime error. Try reloading the page.');
        }
      } finally {
        isProcessingRef.current = false;
      }
    }

    if (streamRef.current && isMountedRef.current && animFrameIdRef.current === null) {
      animFrameIdRef.current = requestAnimationFrame(processFrame);
    }
  }, []);

  const processFrameRef = useRef(processFrame);
  processFrameRef.current = processFrame;

  const attachStreamToVideo = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('autoplay', 'true');
    }

    if (video.paused || video.readyState < 2) {
      try {
        await video.play();
      } catch {
        // play may be aborted while transitioning visibility or if unmounted
      }
    }
  }, []);

  // Ensure stream stays attached and playing after responsive layout or visibility switches
  useEffect(() => {
    if (cameraActive && streamRef.current) {
      void attachStreamToVideo();
    }
  }); // A responsive layout switch or mobile preview reveal can update the video element without changing cameraActive.

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) {
      setCameraActive(true);
      await attachStreamToVideo();
      if (!animFrameIdRef.current) {
        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }
      return true;
    }

    try {
      setCameraError(null);
      // Adaptive mobile vs desktop camera constraints
      const isMobileDevice = typeof window !== 'undefined' && window.innerWidth <= 600;
      const videoConstraints: MediaTrackConstraints = isMobileDevice
        ? {
            width: { ideal: 480 },
            height: { ideal: 640 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          }
        : {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      streamRef.current = stream;
      setCameraActive(true);
      setCameraError(null);
      await attachStreamToVideo();

      // Start processing frames
      if (!animFrameIdRef.current) {
        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }
      return true;
    } catch (err: unknown) {
      console.error('Error accessing webcam:', err);
      let message = 'Webcam access denied or unavailable.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message = 'Camera permission denied. Please allow camera access in your browser.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          message = 'No camera device detected on this computer.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          message = 'Camera is already in use by another application.';
        } else {
          message = err.message || message;
        }
      }
      setCameraError(message);
      setCameraActive(false);
      return false;
    }
  }, [attachStreamToVideo, processFrame]);

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
    cameraError: cameraError ?? modelError,
    startCamera,
    stopCamera,
  };
}