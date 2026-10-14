import React, { useEffect } from 'react';
import { useMediaPipeHands } from '../hooks/useMediaPipeHands';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';

interface WebcamProps {
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  onError?: (error: string | null) => void;
}

/**
 * Headless Hand Tracker component.
 * Runs MediaPipe Hands invisibly in the background without any camera preview box.
 */
export const Webcam = React.memo(function Webcam({ onLandmarks, onError }: WebcamProps) {
  const {
    videoRef,
    landmarks,
    isOpenPalm,
    isReady,
    cameraActive,
    cameraError,
    startCamera,
    stopCamera,
  } = useMediaPipeHands();

  // Auto-start camera when MediaPipe is ready
  useEffect(() => {
    if (isReady && !cameraActive && !cameraError) {
      startCamera();
    }
  }, [isReady, cameraActive, cameraError, startCamera]);

  // Clean shutdown on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Forward landmarks and palm gesture to parent
  useEffect(() => {
    onLandmarks(landmarks, isOpenPalm);
  }, [landmarks, isOpenPalm, onLandmarks]);

  // Forward camera error if callback provided
  useEffect(() => {
    onError?.(cameraError);
  }, [cameraError, onError]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  );
});