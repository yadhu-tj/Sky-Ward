import React from 'react';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';
import type { TiltDebugState } from '../input/tiltController';

interface WebcamProps {
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  onError?: (error: string | null) => void;
  state: TiltDebugState;
  isKeyboardSteering: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  cameraActive?: boolean;
  cameraError?: string | null;
  isReady?: boolean;
  onStartCamera?: () => Promise<boolean>;
  onOpenCamModal?: () => void;
  compact?: boolean;
}

export const Webcam = React.memo(function Webcam({ state, videoRef, cameraActive = false, cameraError, onStartCamera, compact = false }: WebcamProps) {
  const status = cameraError ? 'Camera unavailable'
    : !cameraActive ? 'Camera off'
    : !state.isHandTrackingActive ? 'Camera on · Waiting for hands'
    : !state.isCalibrated ? 'Hands detected · Hold level'
    : 'Hands detected · Calibrated';
  return (
    <section className={`camera-card sidebar-card ${compact ? 'compact' : ''}`} aria-label="Camera setup">
      <div className="panel-heading"><h2>★ MOTION CAM ★</h2><span className="panel-caption">LIVE</span></div>
      <div className="camera-preview">
        <video ref={videoRef} autoPlay playsInline muted style={{ opacity: cameraActive ? 1 : 0 }} />
        {!cameraActive && <div className="camera-placeholder"><span aria-hidden="true">◎</span><p>Play with your hands</p><small>Your camera is used for steering.</small></div>}
        {cameraActive && <><div className="camera-guide" aria-hidden="true" /><div className="camera-anchors" aria-hidden="true"><span>◉ LEFT</span><span>RIGHT ◉</span></div></>}
      </div>
      <p className={`setup-status ${cameraError ? 'status-warning' : ''}`} role="status">{status}</p>
      {cameraError && <p className="panel-description">{cameraError}</p>}
      {!cameraActive && <button className="secondary-action" onClick={() => void onStartCamera?.()}>{cameraError ? 'Retry camera' : 'Enable camera'}</button>}
    </section>
  );
});
