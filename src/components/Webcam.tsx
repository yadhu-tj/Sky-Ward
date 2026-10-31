import React, { useEffect, useState } from 'react';
import { useMediaPipeHands } from '../hooks/useMediaPipeHands';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';

interface WebcamProps {
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  onError?: (error: string | null) => void;
}

/**
 * Hand Tracker component with optional retro live camera preview monitor.
 * Provides user-gesture camera initialization, permission status cues,
 * and live mirrored camera feed so players can see their hands in the frame.
 */
export const Webcam = React.memo(function Webcam({ onLandmarks, onError }: WebcamProps) {
  const [showPreview, setShowPreview] = useState(false);

  const {
    videoRef,
    isReady,
    cameraActive,
    cameraError,
    startCamera,
    stopCamera,
  } = useMediaPipeHands(onLandmarks);

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

  // Forward camera error if callback provided
  useEffect(() => {
    onError?.(cameraError);
  }, [cameraError, onError]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Camera Bar / Quick Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#090314',
          border: '1px solid #3b176d',
          borderRadius: '8px',
          padding: '4px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: cameraActive ? '#39ff14' : cameraError ? '#ff007f' : '#ffe600',
              boxShadow: cameraActive ? '0 0 8px #39ff14' : cameraError ? '0 0 8px #ff007f' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.45rem',
              color: cameraActive ? '#39ff14' : cameraError ? '#ff007f' : '#ffe600',
            }}
          >
            {cameraActive ? 'WEBCAM LIVE' : cameraError ? 'WEBCAM BLOCKED' : isReady ? 'STARTING CAM...' : 'LOADING AI...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {!cameraActive && (
            <button
              onClick={() => startCamera()}
              style={{
                background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '3px 8px',
                borderRadius: '4px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.44rem',
                cursor: 'pointer',
                boxShadow: '0 1px 0 #065f46',
              }}
            >
              ⚡ ENABLE
            </button>
          )}

          <button
            onClick={() => setShowPreview((prev) => !prev)}
            title="Toggle live camera viewfinder"
            style={{
              background: showPreview ? '#4c1d95' : '#1e1136',
              color: showPreview ? '#00f3ff' : '#cbd5e1',
              border: `1px solid ${showPreview ? '#00f3ff' : '#4c1d95'}`,
              padding: '3px 8px',
              borderRadius: '4px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.44rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {showPreview ? 'HIDE CAM ▲' : 'VIEW CAM ▼'}
          </button>
        </div>
      </div>

      {/* Permission error banner if user blocked or browser denied */}
      {cameraError && (
        <div
          style={{
            background: 'rgba(255, 0, 127, 0.15)',
            border: '1px solid #ff007f',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.62rem',
            color: '#fecdd3',
            lineHeight: 1.4,
          }}
        >
          <strong>⚠️ Camera Notice:</strong> {cameraError}
          <div style={{ marginTop: '3px', color: '#ffe600' }}>
            Tip: Open this app in a direct tab to grant camera access, or click "⚡ ENABLE".
          </div>
        </div>
      )}

      {/* Retro Live Camera Monitor (Viewfinder) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: showPreview ? '140px' : '0px',
          overflow: 'hidden',
          borderRadius: '10px',
          border: showPreview ? '2px solid #00f3ff' : 'none',
          background: '#04010a',
          boxShadow: showPreview ? '0 0 14px rgba(0, 243, 255, 0.35)' : 'none',
          transition: 'height 0.25s ease-out',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '140px',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirror video for natural selfie steering perspective
            display: 'block',
            filter: 'contrast(1.08) brightness(1.02)',
          }}
        />

        {/* Viewfinder crosshairs & guides */}
        {showPreview && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              border: '1px dashed rgba(0, 243, 255, 0.3)',
              margin: '6px',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.40rem', color: '#00f3ff' }}>
                [REC] 60FPS
              </span>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.40rem', color: '#ffe600' }}>
                KEEP HANDS IN FRAME
              </span>
            </div>

            {/* Center target horizon */}
            <div
              style={{
                width: '100%',
                height: '1px',
                background: 'rgba(0, 243, 255, 0.25)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '-4px',
                  width: '8px',
                  height: '8px',
                  transform: 'translateX(-50%)',
                  border: '1px solid #ffe600',
                  borderRadius: '50%',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.40rem', color: '#00f3ff' }}>
                ◀ L-HAND
              </span>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.40rem', color: '#ff007f' }}>
                R-HAND ▶
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});