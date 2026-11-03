import React, { useEffect, useState } from 'react';
import { Webcam } from './Webcam';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';
import type { TiltDebugState } from '../input/tiltController';
import type { GameEngine, GameStats, GameState } from '../game/GameEngine';

export type ControlMode = 'GYRO' | 'HAND_CAM' | 'TOUCH';

interface LandscapeCockpitProps {
  state: TiltDebugState;
  engine: GameEngine;
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  onResetCalibration: () => void;
  onSkipCalibration: () => void;
  onTogglePause: () => void;
  isKeyboardSteering: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  cameraActive?: boolean;
  cameraError?: string | null;
  isCameraReady?: boolean;
  onStartCamera?: () => Promise<boolean>;
  onOpenCamModal?: () => void;
  isMobile?: boolean;
  controlMode?: ControlMode;
  gyroAvailable?: boolean;
  gyroPermissionRequired?: boolean;
  onRequestGyroPermission?: () => Promise<boolean>;
  onCalibrateGyro?: () => void;
}

export const LandscapeCockpit: React.FC<LandscapeCockpitProps> = React.memo(({
  state,
  engine,
  onLandmarks,
  onResetCalibration,
  onSkipCalibration,
  onTogglePause,
  isKeyboardSteering,
  videoRef,
  cameraActive,
  cameraError,
  isCameraReady,
  onStartCamera,
  onOpenCamModal,
  isMobile = false,
  controlMode = 'HAND_CAM',
  gyroAvailable = false,
  gyroPermissionRequired = false,
  onRequestGyroPermission,
  onCalibrateGyro,
}) => {
  const [engineStats, setEngineStats] = useState<GameStats>(engine.stats);
  const [gameState, setGameState] = useState<GameState>(engine.state);

  // Sync engine telemetry (120ms throttle)
  useEffect(() => {
    const interval = setInterval(() => {
      setGameState((prev) => (prev !== engine.state ? engine.state : prev));
      setEngineStats((prev) => {
        if (
          prev.altitudeMeters === engine.stats.altitudeMeters &&
          prev.bestAltitudeMeters === engine.stats.bestAltitudeMeters &&
          prev.portalsUsed === engine.stats.portalsUsed &&
          prev.isShieldActive === engine.stats.isShieldActive &&
          prev.sectorLevel === engine.stats.sectorLevel &&
          prev.sectorProgress === engine.stats.sectorProgress &&
          prev.shieldTimer === engine.stats.shieldTimer
        ) {
          return prev;
        }
        return { ...engine.stats };
      });
    }, 120);

    return () => clearInterval(interval);
  }, [engine]);

  const {
    hasBothHands,
    finalAngleDeg,
    isCalibrating,
    calibrationProgress,
    isCalibrated,
  } = state;

  // Friendly steering cue
  const isNeutral = Math.abs(finalAngleDeg) < 0.8;
  const steerText = isNeutral
    ? 'LEVEL & BALANCED'
    : finalAngleDeg < 0
    ? '◀◀ ROLLING LEFT'
    : 'ROLLING RIGHT ▶▶';

  // Arcade Score calculation
  const currentScore = engineStats.altitudeMeters * 10 + engineStats.portalsUsed * 50;
  const bestScore = Math.max(currentScore, engineStats.bestAltitudeMeters * 10);
  const padScore = (n: number) => n.toString().padStart(6, '0');

  // Section 1: When playing on phone, the canvas is the full screen and cockpit is hidden
  if (isMobile && (gameState === 'PLAYING' || gameState === 'COUNTDOWN')) {
    return null;
  }

  return (
    <aside
      className="arcade-cockpit"
      style={{
        width: isMobile ? '100%' : '460px',
        maxWidth: isMobile ? '780px' : undefined,
        height: isMobile ? 'auto' : '660px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: 0,
        boxSizing: 'border-box',
        overflowY: isMobile ? 'visible' : 'auto',
      }}
    >
      {/* 1. Camera Viewfinder: Active when desktop OR when mobile user chooses HAND_CAM */}
      {(!isMobile || controlMode === 'HAND_CAM') && (
        <Webcam
          onLandmarks={onLandmarks}
          state={state}
          isKeyboardSteering={isKeyboardSteering}
          videoRef={videoRef}
          cameraActive={cameraActive}
          cameraError={cameraError}
          isReady={isCameraReady}
          onStartCamera={onStartCamera}
          onOpenCamModal={onOpenCamModal}
          compact={isMobile}
        />
      )}

      {/* Section 6: Gyroscope Quick-Calibration Box (When Gyro Mode active on mobile) */}
      {isMobile && controlMode === 'GYRO' && (
        <div
          style={{
            background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
            border: '2px solid #059669',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: gyroAvailable ? '#39ff14' : '#f59e0b',
                boxShadow: gyroAvailable ? '0 0 8px #39ff14' : 'none',
              }}
            />
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '11px',
                color: gyroAvailable ? '#39ff14' : '#f59e0b',
              }}
            >
              📱 {gyroAvailable ? 'GYRO SENSOR ACTIVE' : 'GYRO NOT DETECTED'}
            </span>
          </div>

          <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.3 }}>
            Tilt phone left / right to balance the bar
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gyroPermissionRequired ? '1fr 1fr' : '1fr',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {gyroPermissionRequired && onRequestGyroPermission && (
              <button
                onClick={onRequestGyroPermission}
                style={{
                  height: '44px',
                  background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '11px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 0 #065f46',
                }}
              >
                ⚡ PERMISSION
              </button>
            )}
            {onCalibrateGyro && (
              <button
                onClick={onCalibrateGyro}
                style={{
                  height: '44px',
                  background: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 0 #075985',
                }}
                title="Hold phone at your natural resting angle and tap to zero"
              >
                ⚖️ ZERO LEVEL
              </button>
            )}
          </div>
        </div>
      )}

      {/* Section 6: Touch Mode Status Card (When Touch Mode active on mobile) */}
      {isMobile && controlMode === 'TOUCH' && (
        <div
          style={{
            background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
            border: '2px solid #3b176d',
            borderRadius: '12px',
            padding: '12px 14px',
            boxShadow: '0 0 12px rgba(168, 85, 247, 0.15)',
          }}
        >
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '11px', color: '#ffe600', marginBottom: '4px' }}>
            👆 TOUCH MODE ACTIVE
          </div>
          <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.3 }}>
            Touch left and right zones on screen to steer.
          </div>
        </div>
      )}

      {/* 2. Retro Animated Tilt-O-Meter */}
      <div
        style={{
          background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
          border: '2px solid #3b176d',
          borderRadius: '16px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: '0 0 16px rgba(168, 85, 247, 0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                color: '#ffe600',
                fontSize: '0.65rem',
                textShadow: '0 0 8px rgba(255, 230, 0, 0.5)',
              }}
            >
              ★ TILT-O-METER ★
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                color: '#cbd5e1',
                background: '#28114a',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #4c1d95',
                fontWeight: 600,
              }}
            >
              {isKeyboardSteering ? 'KEYBOARD' : 'MOTION'}
            </span>
          </div>

          {/* Only show Skip and Re-lock in Cam mode */}
          {(!isMobile || controlMode === 'HAND_CAM') && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {!isCalibrated && (
                <button
                  onClick={onSkipCalibration}
                  style={{
                    background: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: isMobile ? '8px 12px' : '5px 10px',
                    minHeight: isMobile ? '44px' : undefined,
                    borderRadius: '6px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: isMobile ? '11px' : '0.52rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 0 #075985',
                  }}
                >
                  SKIP
                </button>
              )}
              <button
                onClick={onResetCalibration}
                title="Hold hands level and click or press [C] to lock posture"
                style={{
                  background: isCalibrating
                    ? 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)'
                    : 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: isMobile ? '8px 14px' : '5px 12px',
                  minHeight: isMobile ? '44px' : undefined,
                  borderRadius: '6px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: isMobile ? '11px' : '0.52rem',
                  cursor: 'pointer',
                  boxShadow: isCalibrating ? '0 2px 0 #9d174d' : '0 2px 0 #5b21b6',
                  transition: 'all 0.1s ease',
                }}
              >
                {isCalibrating ? (hasBothHands ? 'LOCKING...' : 'WAITING...') : 'RE-LOCK [C]'}
              </button>
            </div>
          )}
        </div>

        {/* Section 7: Mode-Aware Status Label & Stance Calibration (Cam only) */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: isMobile ? '13px' : '0.72rem',
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: '4px',
            }}
          >
            <span style={{ color: controlMode === 'HAND_CAM' && isCalibrating && !hasBothHands ? '#f59e0b' : '#e2e8f0' }}>
              {controlMode === 'GYRO'
                ? 'Tilt your phone to balance'
                : controlMode === 'TOUCH'
                ? 'Touch left or right to steer'
                : isCalibrating
                ? hasBothHands
                  ? 'Hold hands level to lock stance...'
                  : 'Raise hands in camera to lock...'
                : isCalibrated
                ? 'Stance locked! Press [C] anytime to re-lock'
                : 'Click Re-Lock if needed'}
            </span>
            {(!isMobile || controlMode === 'HAND_CAM') && (
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.55rem' }}>
                {Math.round(calibrationProgress * 100)}%
              </span>
            )}
          </div>

          {(!isMobile || controlMode === 'HAND_CAM') && (
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#28114a',
                borderRadius: '3px',
                overflow: 'hidden',
                border: '1px solid #4c1d95',
              }}
            >
              <div
                style={{
                  width: `${calibrationProgress * 100}%`,
                  height: '100%',
                  background: isCalibrated
                    ? 'linear-gradient(90deg, #39ff14, #00f3ff)'
                    : 'linear-gradient(90deg, #ffaa00, #ff007f)',
                  boxShadow: '0 0 8px rgba(0, 243, 255, 0.5)',
                  transition: 'width 0.12s ease-out',
                }}
              />
            </div>
          )}
        </div>

        {/* Animated Retro Balance Meter */}
        <div
          style={{
            position: 'relative',
            height: '46px',
            background: '#070210',
            borderRadius: '10px',
            border: '2px solid #3b176d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Retro balance track grid */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 20px',
              color: 'rgba(255, 255, 255, 0.15)',
              fontSize: '0.65rem',
              pointerEvents: 'none',
              fontFamily: "'Press Start 2P', monospace",
            }}
          >
            <span>◄◄</span>
            <span>◄</span>
            <span style={{ color: '#00f3ff' }}>●</span>
            <span>►</span>
            <span>►►</span>
          </div>

          {/* Animated Tilting Bar Indicator */}
          <div
            style={{
              width: '82%',
              height: '6px',
              background: isNeutral
                ? 'linear-gradient(90deg, #00f3ff, #39ff14, #00f3ff)'
                : finalAngleDeg < 0
                ? 'linear-gradient(90deg, #ff007f, #00f3ff)'
                : 'linear-gradient(90deg, #00f3ff, #ff007f)',
              borderRadius: '3px',
              transform: `rotate(${Math.max(-25, Math.min(25, finalAngleDeg))}deg)`,
              transition: 'transform 0.05s ease-out',
              position: 'relative',
              boxShadow: '0 0 10px rgba(0, 243, 255, 0.5)',
            }}
          >
            {/* Sliding Arcade Pinball on the meter */}
            <div
              style={{
                position: 'absolute',
                top: '-6px',
                left: `${50 + Math.max(-42, Math.min(42, (finalAngleDeg / 20) * 42))}%`,
                transform: 'translateX(-50%)',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #ffe600 50%, #d97706 100%)',
                boxShadow: '0 0 8px #ffe600, 0 2px 4px rgba(0,0,0,0.6)',
                transition: 'left 0.06s ease-out',
              }}
            />
          </div>
        </div>

        {/* Dynamic Steering Cue Banner */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '0.58rem',
            textAlign: 'center',
            color: isNeutral ? '#39ff14' : '#00f3ff',
            letterSpacing: '1px',
            textShadow: isNeutral ? '0 0 6px rgba(57, 255, 20, 0.6)' : '0 0 6px rgba(0, 243, 255, 0.6)',
          }}
        >
          {steerText}
        </div>
      </div>

      {/* 3. Big Retro Arcade Scoreboard */}
      <div
        style={{
          background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
          border: '2px solid #3b176d',
          borderRadius: '16px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: '0 0 16px rgba(168, 85, 247, 0.15)',
        }}
      >
        {/* Active Stage & Progress Banner */}
        <div
          style={{
            background: '#070210',
            borderRadius: '10px',
            border: '1px solid #3b176d',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.52rem',
                  color: '#ffe600',
                  letterSpacing: '1px',
                }}
              >
                STAGE 0{engineStats.sectorLevel}
              </span>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.45rem',
                  color: '#00f3ff',
                }}
              >
                {engineStats.sectorName}
              </span>
            </div>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.45rem',
                color: '#94a3b8',
              }}
            >
              {engineStats.metersToNextGate > 0
                ? `GATE: ${engineStats.metersToNextGate}m`
                : 'MAX APEX'}
            </span>
          </div>

          {/* Retro Progress Track */}
          <div
            style={{
              width: '100%',
              height: '6px',
              background: '#1a0d33',
              borderRadius: '3px',
              overflow: 'hidden',
              border: '1px solid #4c1d95',
            }}
          >
            <div
              style={{
                width: `${Math.round(engineStats.sectorProgress * 100)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #ffe600, #ff007f)',
                boxShadow: '0 0 8px #ffe600',
                transition: 'width 0.2s ease-out',
              }}
            />
          </div>
        </div>

        {/* Score Counters Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#070210',
              padding: '8px 4px',
              borderRadius: '8px',
              border: '1px solid #3b176d',
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.48rem',
                color: '#00f3ff',
                marginBottom: '4px',
              }}
            >
              SCORE
            </div>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.78rem',
                fontWeight: 'bold',
                color: '#ffffff',
                textShadow: '0 0 6px rgba(255, 255, 255, 0.5)',
              }}
            >
              {padScore(currentScore)}
            </div>
          </div>

          <div
            style={{
              background: '#070210',
              padding: '8px 4px',
              borderRadius: '8px',
              border: '1px solid #3b176d',
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.48rem',
                color: '#ffe600',
                marginBottom: '4px',
              }}
            >
              HI-SCORE
            </div>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.78rem',
                fontWeight: 'bold',
                color: '#ffe600',
                textShadow: '0 0 6px rgba(255, 230, 0, 0.6)',
              }}
            >
              {padScore(bestScore)}
            </div>
          </div>

          <div
            style={{
              background: '#070210',
              padding: '8px 4px',
              borderRadius: '8px',
              border: '1px solid #3b176d',
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.48rem',
                color: '#ff007f',
                marginBottom: '4px',
              }}
            >
              WARPS
            </div>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.78rem',
                fontWeight: 'bold',
                color: '#ff007f',
                textShadow: '0 0 6px rgba(255, 0, 127, 0.6)',
              }}
            >
              ⭐ {engineStats.portalsUsed}
            </div>
          </div>
        </div>


        {/* Big Retro Action Buttons (Desktop only - mobile has top HUD pause button during play) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
            <button
              onClick={onTogglePause}
              style={{
                flex: 1,
                background: gameState === 'PAUSED'
                  ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)'
                  : 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '8px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.58rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: gameState === 'PAUSED' ? '0 3px 0 #065f46' : '0 3px 0 #9d174d',
                transition: 'all 0.08s ease',
              }}
            >
              <span>{gameState === 'PAUSED' ? '▶ RESUME' : '⏸ PAUSE'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
});
