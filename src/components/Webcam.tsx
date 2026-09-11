import React, { useEffect, useRef } from 'react';
import { useMediaPipeHands } from '../hooks/useMediaPipeHands';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';

interface WebcamProps {
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  width?: number;
  height?: number;
}

export const Webcam = React.memo(function Webcam({ onLandmarks, width = 480, height = 320 }: WebcamProps) {
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

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-start camera when MediaPipe is ready
  useEffect(() => {
    if (isReady && !cameraActive && !cameraError) {
      startCamera();
    }
  }, [isReady, cameraActive, cameraError, startCamera]);

  // Clean shutdown on actual unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Forward landmarks and palm gesture to parent
  useEffect(() => {
    onLandmarks(landmarks, isOpenPalm);

    // Draw visual feedback overlay on canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawHand = (points: Array<{ x: number; y: number }>, color: string) => {
      ctx.fillStyle = color;
      points.forEach((pt, index) => {
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        ctx.beginPath();
        ctx.arc(px, py, index === 0 ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    if (landmarks.left) {
      drawHand(landmarks.left, '#38bdf8');
    }
    if (landmarks.right) {
      drawHand(landmarks.right, '#10b981');
    }

    // If both wrists detected, draw tilt bridge line
    if (landmarks.left && landmarks.right) {
      const p1 = { x: landmarks.left[0].x * canvas.width, y: landmarks.left[0].y * canvas.height };
      const p2 = { x: landmarks.right[0].x * canvas.width, y: landmarks.right[0].y * canvas.height };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Open Palm Pause Indicator badge on video
    if (isOpenPalm) {
      ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 80, 12, 160, 32, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✋ PAUSE GESTURE', canvas.width / 2, 32);
    } else if (!landmarks.left || !landmarks.right) {
      // Gentle helper
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 110, canvas.height - 36, 220, 26, 6);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show both hands in frame to steer', canvas.width / 2, canvas.height - 19);
    }
  }, [landmarks, isOpenPalm, onLandmarks]);

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        background: '#020617',
        border: '1px solid #1e293b',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          transform: 'scaleX(-1)',
          objectFit: 'cover',
          display: cameraActive ? 'block' : 'none',
        }}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Camera loading state */}
      {!cameraActive && !cameraError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: '0.9rem',
            gap: '8px',
            background: '#0b0f19',
          }}
        >
          <div style={{ fontSize: '1.8rem' }}>📷</div>
          <div>Starting Camera...</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Please allow browser camera permission</div>
        </div>
      )}

      {/* Camera Error state */}
      {cameraError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fca5a5',
            padding: '16px',
            textAlign: 'center',
            fontSize: '0.85rem',
            gap: '10px',
            background: 'rgba(15, 23, 42, 0.95)',
          }}
        >
          <div style={{ fontSize: '1.8rem' }}>⚠️</div>
          <div>{cameraError}</div>
          <button
            onClick={startCamera}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Retry Camera
          </button>
        </div>
      )}
    </div>
  );
});