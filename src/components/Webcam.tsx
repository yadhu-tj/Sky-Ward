import React, { useEffect } from 'react';
import { useMediaPipeHands } from '../hooks/useMediaPipeHands';
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

/**
 * Unified Motion Sensor & Live Camera Viewfinder.
 * Always-open retro arcade camera monitor that superimposes hand tracking reticles,
 * lock status, and palm pause cues directly over the live mirrored webcam feed.
 */
export const Webcam = React.memo(function Webcam({
  onLandmarks,
  onError,
  state,
  isKeyboardSteering,
  videoRef: extVideoRef,
  cameraActive: extCameraActive,
  cameraError: extCameraError,
  isReady: extIsReady,
  onStartCamera: extStartCamera,
  onOpenCamModal,
  compact = false,
}: WebcamProps) {
  // If parent didn't supply shared camera hooks, initialize local hook
  const localHook = useMediaPipeHands(extVideoRef ? undefined : onLandmarks);

  const videoRef = extVideoRef || localHook.videoRef;
  const isReady = extIsReady !== undefined ? extIsReady : localHook.isReady;
  const cameraActive = extCameraActive !== undefined ? extCameraActive : localHook.cameraActive;
  const cameraError = extCameraError !== undefined ? extCameraError : localHook.cameraError;
  const startCamera = extStartCamera || localHook.startCamera;
  const stopCamera = localHook.stopCamera;

  // Clean shutdown on unmount if using local hook
  useEffect(() => {
    return () => {
      if (!extVideoRef) {
        stopCamera();
      }
    };
  }, [extVideoRef, stopCamera]);

  // Forward camera error if callback provided
  useEffect(() => {
    onError?.(cameraError);
  }, [cameraError, onError]);

  const handleEnableClick = () => {
    if (onOpenCamModal) {
      onOpenCamModal();
    } else {
      startCamera();
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
        border: '2px solid #3b176d',
        borderRadius: '16px',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 0 16px rgba(168, 85, 247, 0.15)',
      }}
    >
      {/* 1. Header Bar: Title, Tracking Mode Pill & Enable Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.58rem',
              color: '#ffe600',
              letterSpacing: '1px',
              textShadow: '0 0 6px rgba(255, 230, 0, 0.5)',
            }}
          >
            ★ MOTION CAM ★
          </span>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: cameraActive ? '#39ff14' : cameraError ? '#ff007f' : '#ffe600',
              boxShadow: cameraActive ? '0 0 8px #39ff14' : cameraError ? '0 0 8px #ff007f' : 'none',
            }}
            title={
              cameraActive
                ? 'Camera Active'
                : cameraError
                ? 'Camera Blocked'
                : !isReady
                ? 'Model Loading'
                : 'Ready to Start'
            }
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!cameraActive && (
            <button
              onClick={handleEnableClick}
              style={{
                background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '5px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.45rem',
                cursor: 'pointer',
                boxShadow: '0 1px 0 #065f46',
              }}
            >
              ⚡ ENABLE
            </button>
          )}

          <div
            style={{
              background: state.isHandTrackingActive
                ? state.isHandLockActive
                  ? 'rgba(6, 78, 59, 0.95)'
                  : 'rgba(5, 78, 59, 0.9)'
                : isKeyboardSteering
                ? 'rgba(30, 58, 138, 0.9)'
                : 'rgba(59, 23, 109, 0.9)',
              border: `1px solid ${
                state.isHandTrackingActive
                  ? state.isHandLockActive
                    ? '#34d399'
                    : '#10b981'
                  : isKeyboardSteering
                  ? '#3b82f6'
                  : '#7c3aed'
              }`,
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: '5px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.46rem',
              letterSpacing: '0.5px',
              boxShadow: state.isHandTrackingActive ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none',
            }}
          >
            {state.isHandTrackingActive
              ? state.isHandLockActive
                ? '🔒 LOCKED'
                : state.isCalibrating
                ? `LOCK ${Math.round(state.calibrationProgress * 100)}%`
                : state.hasBothHands
                ? '● DUAL'
                : '● 1-HAND'
              : isKeyboardSteering
              ? '⌨️ KEYBOARD'
              : cameraActive
              ? '👐 READY'
              : 'CAM OFF'}
          </div>
        </div>
      </div>

      {/* 2. Unified Live Camera Monitor with Superimposed Motion Sensor HUD */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: compact ? '112px' : '185px',
          overflow: 'hidden',
          borderRadius: '12px',
          border: `2px solid ${state.isHandLockActive ? '#059669' : '#4c1d95'}`,
          background: '#05010d',
          boxShadow: state.isHandLockActive
            ? '0 0 16px rgba(16, 185, 129, 0.3), inset 0 0 14px rgba(0,0,0,0.7)'
            : '0 0 14px rgba(168, 85, 247, 0.25), inset 0 0 14px rgba(0,0,0,0.7)',
        }}
      >
        {/* Mirrored Live Video Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Selfie mirror perspective
            display: 'block',
            filter: 'contrast(1.06) brightness(1.02)',
            opacity: cameraActive ? 0.98 : 0.25,
            transition: 'opacity 0.2s ease',
          }}
        />

        {/* Permission Denied Notice Overlay */}
        {cameraError && (
          <div
            onClick={handleEnableClick}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(20, 2, 14, 0.88)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              textAlign: 'center',
              gap: '6px',
              zIndex: 4,
              cursor: 'pointer',
            }}
            title="Click to request camera permission"
          >
            <span style={{ fontSize: '1.2rem' }}>📷</span>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.48rem', color: '#ff007f' }}>
              WEBCAM ACCESS BLOCKED
            </span>
            <span style={{ fontSize: '0.64rem', color: '#fecdd3', maxWidth: '340px', lineHeight: 1.3 }}>
              Click to grant camera permission or troubleshoot.
            </span>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.44rem',
                color: '#39ff14',
                background: '#064e3b',
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #059669',
                marginTop: '4px',
              }}
            >
              ⚡ UNBLOCK CAMERA
            </span>
          </div>
        )}

        {/* Superimposed Motion Sensor HUD Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 10px',
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.35) 100%)',
          }}
        >
          {/* Top HUD: Status badges (Left and Right transparent glass boxes) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.44rem',
                color: cameraActive ? '#39ff14' : '#94a3b8',
                background: 'rgba(5, 1, 18, 0.35)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 243, 255, 0.35)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {cameraActive ? '● REC 60FPS' : '○ NO SIGNAL'}
            </div>

            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.44rem',
                color: state.isOpenPalm ? '#39ff14' : '#c084fc',
                background: state.isOpenPalm ? 'rgba(5, 78, 59, 0.45)' : 'rgba(5, 1, 18, 0.35)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: `1px solid ${state.isOpenPalm ? '#39ff14' : 'rgba(168, 85, 247, 0.35)'}`,
                boxShadow: state.isOpenPalm ? '0 0 10px #39ff14' : '0 2px 8px rgba(0,0,0,0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              {state.isOpenPalm ? '✋ PALM PAUSE' : 'PALM GESTURE'}
            </div>
          </div>

          {/* Center Target Horizon Hairline */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '1px',
              background: 'rgba(0, 243, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                border: '1px solid #ffe600',
                background: 'rgba(255, 230, 0, 0.4)',
              }}
            />
          </div>

          {/* Bottom HUD: Transparent Glass Hand Nodes + Laser Link */}
          <div
            style={{
              background: 'rgba(7, 2, 18, 0.32)',
              borderRadius: '10px',
              border: `1px solid ${state.isHandLockActive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(124, 58, 237, 0.35)'}`,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            }}
          >
            {/* Left Hand Indicator Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0, 243, 255, 0.14)',
                border: '1px solid rgba(0, 243, 255, 0.35)',
                borderRadius: '6px',
                padding: '2px 8px',
              }}
            >
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: state.leftHand ? '#00f3ff' : '#28114a',
                  boxShadow: state.leftHand ? '0 0 8px #00f3ff' : 'none',
                  border: '1px solid #00f3ff',
                  transition: 'all 0.15s ease',
                }}
              />
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.44rem',
                  color: state.leftHand ? '#00f3ff' : '#94a3b8',
                }}
              >
                LEFT {state.isHandLockActive && state.leftHand ? '🔒' : ''}
              </span>
            </div>

            {/* Connecting Laser Beam */}
            <div
              style={{
                flex: 1,
                height: '2px',
                margin: '0 8px',
                background: state.hasBothHands
                  ? 'linear-gradient(90deg, #00f3ff, #ffe600, #ff007f)'
                  : 'rgba(168, 85, 247, 0.25)',
                boxShadow: state.hasBothHands ? '0 0 6px #ffe600' : 'none',
                transition: 'all 0.15s ease',
              }}
            />

            {/* Right Hand Indicator Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 0, 127, 0.14)',
                border: '1px solid rgba(255, 0, 127, 0.35)',
                borderRadius: '6px',
                padding: '2px 8px',
              }}
            >
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.44rem',
                  color: state.rightHand ? '#ff007f' : '#94a3b8',
                }}
              >
                {state.isHandLockActive && state.rightHand ? '🔒' : ''} RIGHT
              </span>
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: state.rightHand ? '#ff007f' : '#28114a',
                  boxShadow: state.rightHand ? '0 0 8px #ff007f' : 'none',
                  border: '1px solid #ff007f',
                  transition: 'all 0.15s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Footer Tip Line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.64rem',
          color: '#94a3b8',
          padding: '0 2px',
        }}
      >
        <span>
          {state.isHandTrackingActive
            ? state.isHandLockActive
              ? '🔒 Stance locked • Press [C] to re-lock'
              : '✨ Hold hands level in camera view'
            : 'Tip: Hold hands in air or press arrow keys'}
        </span>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.42rem', color: '#64748b' }}>
          STEER
        </span>
      </div>
    </div>
  );
});