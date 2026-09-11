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
 * Detects whether a set of hand landmarks represents an upright open palm facing the camera.
 */
export function isHandOpenPalm(hand: Landmark[] | null): boolean {
  if (!hand || hand.length < 21) return false;

  const wrist = hand[0];
  const middleMcp = hand[9];

  // Euclidean distance in 2D
  const dist = (p1: Landmark, p2: Landmark) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Hand must be raised off the desk/keyboard level (not resting down at the bottom margin)
  if (wrist.y > 0.82) return false;

  // Hand must have significant scale in the frame (prominently shown to camera)
  const palmScale = dist(wrist, middleMcp);
  if (palmScale < 0.10) return false;

  // Vertical elevation check: middle fingertip must be significantly higher than the wrist
  const middleTip = hand[12];
  if (wrist.y - middleTip.y < 0.14) {
    return false; // Hand is tilted flat, horizontal, or pointing down towards keyboard
  }

  const fingerIndices = [
    { mcp: 5, tip: 8 },   // Index
    { mcp: 9, tip: 12 },  // Middle
    { mcp: 13, tip: 16 }, // Ring
    { mcp: 17, tip: 20 }, // Pinky
  ];

  for (const { mcp, tip } of fingerIndices) {
    const mcpPt = hand[mcp];
    const tipPt = hand[tip];

    // In screen coordinates (y=0 top), fingertip must be higher than MCP joint
    if (tipPt.y >= mcpPt.y) {
      return false;
    }

    // Extended finger: distance from wrist to tip must be significantly larger than wrist to MCP
    const distMcp = dist(wrist, mcpPt);
    const distTip = dist(wrist, tipPt);
    if (distTip < distMcp * 1.35) {
      return false;
    }
  }

  return true;
}

export function useMediaPipeHands() {
  const [landmarks, setLandmarks] = useState<HandLandmarks>({ left: null, right: null });
  const [isOpenPalm, setIsOpenPalm] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handsRef = useRef<Hands | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

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
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });

      hands.onResults((results: Results) => {
        if (!isMountedRef.current) return;

        const rawDetected = results.multiHandLandmarks ?? [];

        // Filter out false positive ghost detections (e.g. neck/chin edge noise)
        const detected = rawDetected.filter((hand) => {
          if (!hand || hand.length < 21) return false;
          // Valid hand should have reasonable distance between wrist (0) and middle MCP (9)
          const wrist = hand[0];
          const middleMcp = hand[9];
          const span = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
          return span >= 0.08;
        });

        let left: Landmark[] | null = null;
        let right: Landmark[] | null = null;

        if (detected.length === 1) {
          // Mirror x for selfie camera perspective
          const mapped = detected[0].map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
          if (mapped[0].x < 0.5) {
            left = mapped;
          } else {
            right = mapped;
          }
        } else if (detected.length >= 2) {
          const handA = detected[0].map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
          const handB = detected[1].map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));

          if (handA[0].x < handB[0].x) {
            left = handA;
            right = handB;
          } else {
            left = handB;
            right = handA;
          }
        }

        // Strict Single-Hand Palm Pause Rule:
        // Palm pause must ONLY work if a single hand is shown. If 2 hands are present, it must NOT work.
        const isSingleHand = detected.length === 1;
        const palmDetected = isSingleHand && (isHandOpenPalm(left) || isHandOpenPalm(right));

        setLandmarks({ left, right });
        setIsOpenPalm(palmDetected);
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

  // Frame processing loop using requestAnimationFrame
  const processFrame = useCallback(async () => {
    if (!isMountedRef.current) return;
    const video = videoRef.current;
    const hands = handsRef.current;

    if (video && hands && video.readyState >= 2 && !isProcessingRef.current) {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
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