import React, { useEffect, useState } from 'react';
import { Webcam } from './Webcam';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';
import type { TiltDebugState } from '../input/tiltController';
import type { GameEngine, GameStats, GameState } from '../game/GameEngine';

interface LandscapeCockpitProps {
  state: TiltDebugState;
  engine: GameEngine;
  onLandmarks: (landmarks: HandLandmarks, isOpenPalm: boolean) => void;
  onResetCalibration: () => void;
  onSkipCalibration: () => void;
  onTogglePause: () => void;
  isKeyboardSteering: boolean;
}

export const LandscapeCockpit: React.FC<LandscapeCockpitProps> = ({
  state,
  engine,
  onLandmarks,
  onResetCalibration,
  onSkipCalibration,
  onTogglePause,
  isKeyboardSteering,
}) => {
  const [engineStats, setEngineStats] = useState<GameStats>(engine.stats);
  const [gameState, setGameState] = useState<GameState>(engine.state);
  const [floorGapMeters, setFloorGapMeters] = useState<number>(Math.floor(engine.floorGap / 50));

  // Sync engine telemetry at 20fps for smooth dashboard gauges
  useEffect(() => {
    let animId: number;
    let lastPoll = 0;

    const pollEngine = (now: number) => {
      if (now - lastPoll > 50) {
        lastPoll = now;
        setEngineStats({ ...engine.stats });
        setGameState(engine.state);
        setFloorGapMeters(Math.floor(engine.floorGap / 50));
      }
      animId = requestAnimationFrame(pollEngine);
    };

    animId = requestAnimationFrame(pollEngine);
    return () => cancelAnimationFrame(animId);
  }, [engine]);

  const {
    hasBothHands,
    leftHand,
    rightHand,
    rawAngleDeg,
    calibratedAngleDeg,
    smoothedAngleDeg,
    finalAngleDeg,
    isCalibrating,
    calibrationProgress,
    isCalibrated,
    neutralOffsetDeg,
    isOpenPalm,
  } = state;

  // Steering direction label
  const isDeadzone = Math.abs(finalAngleDeg) < 0.1;
  const steerLabel = isDeadzone
    ? 'NEUTRAL (DEADZONE)'
    : finalAngleDeg < 0
    ? `◀ STEER LEFT (${Math.abs(finalAngleDeg).toFixed(1)}°)`
    : `STEER RIGHT ▶ (${finalAngleDeg.toFixed(1)}°)`;

  // Floor hazard level
  const isFloorCritical = floorGapMeters < 3;
  const isFloorWarning = floorGapMeters >= 3 && floorGapMeters < 6;
  const floorStatusColor = isFloorCritical ? '#ef4444' : isFloorWarning ? '#f59e0b' : '#10b981';
  const floorStatusText = isFloorCritical
    ? 'CRITICAL PROXIMITY!'
    : isFloorWarning
    ? 'FLOOR SURGING'
    : 'SAFE ELEVATION';

  return (
    <aside
      style={{
        width: '460px',
        height: '660px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        flexShrink: 0,
        fontFamily: 'monospace',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Optical Tracking Feed (Webcam + HUD Bezel) */}
      <div
        style={{
          position: 'relative',
          width: '460px',
          height: '240px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #1e293b',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          background: '#020617',
        }}
      >
        <Webcam onLandmarks={onLandmarks} width={460} height={240} />

        {/* HUD Top Corner Overlays */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '10px',
            right: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(2, 6, 23, 0.75)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.68rem',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#38bdf8',
                boxShadow: '0 0 6px #38bdf8',
              }}
            />
            CAM FEED
          </div>

          <div
            style={{
              background: hasBothHands
                ? 'rgba(16, 185, 129, 0.85)'
                : leftHand || rightHand
                ? 'rgba(245, 158, 11, 0.85)'
                : 'rgba(239, 68, 68, 0.85)',
              color: '#ffffff',
              padding: '3px 9px',
              borderRadius: '12px',
              fontSize: '0.68rem',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              boxShadow: '0 0 10px rgba(0,0,0,0.4)',
            }}
          >
            {hasBothHands
              ? '2 HANDS LOCKED'
              : leftHand || rightHand
              ? '1 HAND DETECTED'
              : 'WAITING FOR HANDS'}
          </div>
        </div>

        {/* HUD Bottom Info Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            left: '10px',
            right: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
            fontSize: '0.68rem',
            color: '#94a3b8',
            background: 'rgba(2, 6, 23, 0.7)',
            padding: '3px 8px',
            borderRadius: '4px',
          }}
        >
          <div>
            {hasBothHands && leftHand && rightHand ? (
              <span>
                L: {leftHand.y.toFixed(2)} | R: {rightHand.y.toFixed(2)} (Δ:{' '}
                {(rightHand.y - leftHand.y).toFixed(2)})
              </span>
            ) : (
              <span>Position both hands in frame</span>
            )}
          </div>
          <div>
            {isOpenPalm ? (
              <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>✋ PALM ACTIVE</span>
            ) : (
              <span>PALM: READY</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Gyro Horizon & Angle Telemetry Console */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header + Calibration Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 'bold' }}>
              GYRO HORIZON
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                color: isKeyboardSteering ? '#a855f7' : '#38bdf8',
                background: 'rgba(56, 189, 248, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              {isKeyboardSteering ? 'KEYBOARD' : 'MOTION'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {!isCalibrated && (
              <button
                onClick={onSkipCalibration}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Skip
              </button>
            )}
            <button
              onClick={onResetCalibration}
              style={{
                background: '#334155',
                color: '#f8fafc',
                border: 'none',
                padding: '3px 8px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Recalibrate
            </button>
          </div>
        </div>

        {/* Calibration Progress Indicator */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              color: '#94a3b8',
              marginBottom: '3px',
            }}
          >
            <span>
              {isCalibrating
                ? 'Hold hands neutral (~1s)...'
                : isCalibrated
                ? `Calibrated (Neutral Offset: ${neutralOffsetDeg.toFixed(1)}°)`
                : 'Needs calibration'}
            </span>
            <span>{Math.round(calibrationProgress * 100)}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '4px',
              background: '#1e293b',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${calibrationProgress * 100}%`,
                height: '100%',
                background: isCalibrated ? '#10b981' : '#f59e0b',
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
        </div>

        {/* Artificial Horizon Level Bar */}
        <div
          style={{
            position: 'relative',
            height: '46px',
            background: '#070b14',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Degree scale ticks */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 20px',
              color: '#334155',
              fontSize: '0.62rem',
              pointerEvents: 'none',
            }}
          >
            <span>-25°</span>
            <span>-15°</span>
            <span style={{ color: '#64748b' }}>0°</span>
            <span>+15°</span>
            <span>+25°</span>
          </div>

          {/* Central crosshair */}
          <div
            style={{
              position: 'absolute',
              width: '1px',
              height: '100%',
              background: 'rgba(56, 189, 248, 0.25)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '1px',
              background: '#1e293b',
            }}
          />

          {/* Neutral deadzone bracket */}
          <div
            style={{
              position: 'absolute',
              width: '28px',
              height: '18px',
              borderLeft: '1px solid rgba(148, 163, 184, 0.25)',
              borderRight: '1px solid rgba(148, 163, 184, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {/* Rotating Horizon Horizon Beam */}
          <div
            style={{
              width: '78%',
              height: '6px',
              background: 'linear-gradient(90deg, #0284c7, #10b981)',
              borderRadius: '3px',
              transform: `rotate(${finalAngleDeg}deg)`,
              transition: 'transform 0.04s linear',
              position: 'relative',
              boxShadow: isDeadzone
                ? 'none'
                : '0 0 10px rgba(56, 189, 248, 0.4)',
            }}
          >
            {/* Spirit bubble */}
            <div
              style={{
                position: 'absolute',
                top: '-5px',
                left: `${50 + (finalAngleDeg / 30) * 45}%`,
                transform: 'translateX(-50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#f59e0b',
                boxShadow: '0 0 8px #f59e0b',
                transition: 'left 0.05s ease-out',
              }}
            />
          </div>
        </div>

        {/* Direction status banner */}
        <div
          style={{
            fontSize: '0.72rem',
            textAlign: 'center',
            color: isDeadzone ? '#64748b' : '#38bdf8',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
          }}
        >
          {steerLabel}
        </div>

        {/* 4-Column Angle Pipeline Telemetry */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            background: '#070b14',
            padding: '6px',
            borderRadius: '6px',
            textAlign: 'center',
            border: '1px solid #1e293b',
          }}
        >
          <div>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>RAW</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#cbd5e1' }}>
              {rawAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>CALIB</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#38bdf8' }}>
              {calibratedAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>SMOOTH</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#a855f7' }}>
              {smoothedAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>STEER</div>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: !isDeadzone ? '#4ade80' : '#475569',
              }}
            >
              {finalAngleDeg.toFixed(1)}°
            </div>
          </div>
        </div>
      </div>

      {/* 3. Flight Radar & Proximity Warning Deck */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* Radar Header & Distance */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#e2e8f0' }}>
            HAZARD RADAR
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 'bold',
              color: floorStatusColor,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: floorStatusColor,
                boxShadow: `0 0 6px ${floorStatusColor}`,
              }}
            />
            {floorStatusText} ({floorGapMeters}m)
          </div>
        </div>

        {/* Segmented LED Danger Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '3px',
            height: '10px',
            padding: '2px',
            background: '#070b14',
            borderRadius: '4px',
            border: '1px solid #1e293b',
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const segmentMeters = (i + 1) * 1;
            const isFilled = floorGapMeters >= segmentMeters;
            const color = i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#10b981';
            return (
              <div
                key={i}
                style={{
                  borderRadius: '2px',
                  background: isFilled ? color : '#1e293b',
                  opacity: isFilled ? 1 : 0.25,
                  boxShadow: isFilled ? `0 0 4px ${color}` : 'none',
                  transition: 'background 0.15s ease',
                }}
              />
            );
          })}
        </div>

        {/* Flight Telemetry Summary Badges */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#070b14',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>ALTITUDE</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#38bdf8' }}>
              {engineStats.altitudeMeters}m
            </div>
          </div>

          <div
            style={{
              background: '#070b14',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>BEST</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#a855f7' }}>
              {engineStats.bestAltitudeMeters}m
            </div>
          </div>

          <div
            style={{
              background: '#070b14',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>WARPS</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#06b6d4' }}>
              {engineStats.portalsUsed}
            </div>
          </div>
        </div>

        {/* Action Button & Hotkeys Guide */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onTogglePause}
            style={{
              flex: 1,
              background: gameState === 'PAUSED' ? '#10b981' : '#1e293b',
              color: '#ffffff',
              border: '1px solid #334155',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background 0.15s ease',
            }}
          >
            <span>{gameState === 'PAUSED' ? '▶ RESUME' : '⏸ PAUSE'}</span>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>[Space / P]</span>
          </button>

          <div
            style={{
              fontSize: '0.68rem',
              color: '#64748b',
              padding: '4px 8px',
              background: '#070b14',
              borderRadius: '6px',
              border: '1px solid #1e293b',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Steer: <kbd style={{ color: '#e2e8f0' }}>←</kbd> <kbd style={{ color: '#e2e8f0' }}>→</kbd>
          </div>
        </div>
      </div>
    </aside>
  );
};
