import { useEffect, useRef, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import type { Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarks {
  left: Landmark[] | null;
  right: Landmark[] | null;
}

export function useMediaPipeHands() {
  const [landmarks, setLandmarks] = useState<HandLandmarks>({ left: null, right: null });
  const [isReady, setIsReady] = useState(false);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results: Results) => {
      const detected = results.multiHandLandmarks ?? [];
      
      let left: Landmark[] | null = null;
      let right: Landmark[] | null = null;

      if (detected.length === 1) {
        // If single hand, map coordinates mirroring x (for selfie perspective)
        const mapped = detected[0].map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
        const wristX = mapped[0].x;
        if (wristX < 0.5) {
          left = mapped;
        } else {
          right = mapped;
        }
      } else if (detected.length >= 2) {
        // Mirror x for selfie view so user's left hand is on screen-left (x < 0.5)
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

      setLandmarks({ left, right });

      console.log('MediaPipe Results:', {
        left: left ? left[0] : null,
        right: right ? right[0] : null,
        numHands: results.multiHandLandmarks?.length ?? 0,
      });
    });

    handsRef.current = hands;
    setIsReady(true);

    return () => {
      hands.close();
    };
  }, []);

  const startCamera = () => {
    if (!videoRef.current || !handsRef.current) return;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        await handsRef.current?.send({ image: videoRef.current! });
      },
      width: 640,
      height: 480,
    });

    cameraRef.current = camera;
    camera.start();
  };

  const stopCamera = () => {
    cameraRef.current?.stop();
  };

  return {
    videoRef,
    landmarks,
    isReady,
    startCamera,
    stopCamera,
  };
}