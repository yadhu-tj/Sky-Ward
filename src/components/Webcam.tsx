import { useEffect, useRef } from 'react';
import { useMediaPipeHands } from '../hooks/useMediaPipeHands';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';

interface WebcamProps {
  onLandmarks: (landmarks: HandLandmarks) => void;
  width?: number;
  height?: number;
}

export function Webcam({ onLandmarks, width = 480, height = 360 }: WebcamProps) {
  const { videoRef, landmarks, isReady, startCamera, stopCamera } = useMediaPipeHands();
  const startedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    onLandmarks(landmarks);

    // Draw landmarks and connector bar onto canvas
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
      drawHand(landmarks.left, '#3b82f6');
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
  }, [landmarks, onLandmarks]);

  useEffect(() => {
    if (isReady && !startedRef.current) {
      startedRef.current = true;
      startCamera();
    }
    return () => stopCamera();
  }, [isReady, startCamera, stopCamera]);

  return (
    <div style={{ position: 'relative', width, height, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', background: '#020617' }}>
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
    </div>
  );
}