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

const RADAR_SEGMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const LandscapeCockpit: React.FC<LandscapeCockpitProps> = React.memo(({
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

  // Throttled engine telemetry sync (120ms)
  useEffect(() => {
    const interval = setInterval(() => {
      const curFloor = Math.floor(engine.floorGap / 50);
      setFloorGapMeters((prev) => (prev !== curFloor ? curFloor : prev));
      setGameState((prev) => (prev !== engine.state ? engine.state : prev));
      setEngineStats((prev) => {
        if (
          prev.altitudeMeters === engine.stats.altitudeMeters &&
          prev.bestAltitudeMeters === engine.stats.bestAltitudeMeters &&
          prev.portalsUsed === engine.stats.portalsUsed &&
          prev.isShieldActive === engine.stats.isShieldActive
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
    ? 'STANCE ZEROED · DEADZONE'
    : finalAngleDeg < 0
    ? `◀ TILT LEFT  ${Math.abs(finalAngleDeg).toFixed(1)}°`
    : `TILT RIGHT ▶  ${finalAngleDeg.toFixed(1)}°`;

  // Floor hazard status
  const isFloorCritical = floorGapMeters < 3;
  const isFloorWarning = floorGapMeters >= 3 && floorGapMeters < 6;
  const floorStatusColor = isFloorCritical ? '#ef4444' : isFloorWarning ? '#f59e0b' : '#10b981';
  const floorStatusText = isFloorCritical
    ? 'CRITICAL PROXIMITY'
    : isFloorWarning
    ? 'ELEVATION SURGING'
    : 'SAFE CLEARANCE';

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
      {/* 1. Optical Deck (Webcam + Beveled Gunmetal Bezel) */}
      <div
        style={{
          position: 'relative',
          width: '460px',
          height: '240px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #1e293b',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          background: '#090d16',
        }}
      >
        <Webcam onLandmarks={onLandmarks} width={460} height={240} />

        {/* Minimalist Top Status Bar */}
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
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.65rem',
              color: '#94a3b8',
              letterSpacing: '0.8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#38bdf8',
              }}
            />
            OPTICAL SENSOR
          </div>

          <div
            style={{
              background: hasBothHands
                ? '#064e3b'
                : leftHand || rightHand
                ? '#78350f'
                : '#7f1d1d',
              border: `1px solid ${
                hasBothHands ? '#059669' : leftHand || rightHand ? '#d97706' : '#dc2626'
              }`,
              color: '#ffffff',
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.8px',
            }}
          >
            {hasBothHands
              ? '● DUAL TRACKING LOCKED'
              : leftHand || rightHand
              ? '1 HAND ACQUIRED'
              : 'AWAITING OPERATOR HANDS'}
          </div>
        </div>

        {/* Minimalist Bottom Info Bar */}
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
            fontSize: '0.65rem',
            color: '#64748b',
            background: 'rgba(9, 13, 22, 0.85)',
            padding: '3px 10px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div>
            {hasBothHands && leftHand && rightHand ? (
              <span>
                L: {leftHand.y.toFixed(2)} · R: {rightHand.y.toFixed(2)} (Δ{' '}
                {(rightHand.y - leftHand.y).toFixed(2)})
              </span>
            ) : (
              <span>Hold both hands in camera view</span>
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

      {/* 2. Precision Inclinometer & Horizon Gauge Deck */}
      <div
        style={{
          background: '#0d111a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header + Tactile Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                color: '#e2e8f0',
                fontSize: '0.78rem',
                fontWeight: 'bold',
                letterSpacing: '1px',
              }}
            >
              INCLINOMETER // HORIZON
            </span>
            <span
              style={{
                fontSize: '0.62rem',
                color: '#94a3b8',
                background: '#1e293b',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #334155',
                letterSpacing: '0.5px',
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
                  border: '1px solid #38bdf8',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  fontSize: '0.68rem',
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
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '3px 9px',
                borderRadius: '5px',
                fontSize: '0.68rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Zero Posture
            </button>
          </div>
        </div>

        {/* Minimalist Calibration Gauge */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.68rem',
              color: '#64748b',
              marginBottom: '3px',
            }}
          >
            <span>
              {isCalibrating
                ? 'Neutralizing posture stance...'
                : isCalibrated
                ? `Zeroed (Offset: ${neutralOffsetDeg.toFixed(1)}°)`
                : 'Calibration recommended'}
            </span>
            <span>{Math.round(calibrationProgress * 100)}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '3px',
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

        {/* Realistic Aviation Attitude & Spirit Gauge */}
        <div
          style={{
            position: 'relative',
            height: '46px',
            background: '#070a12',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Engraved degree markings */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 24px',
              color: '#475569',
              fontSize: '0.62rem',
              pointerEvents: 'none',
              fontWeight: 500,
            }}
          >
            <span>-25°</span>
            <span>-15°</span>
            <span style={{ color: '#94a3b8' }}>0°</span>
            <span>+15°</span>
            <span>+25°</span>
          </div>

          {/* Central datum crosshairs */}
          <div
            style={{
              position: 'absolute',
              width: '1px',
              height: '100%',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '1px',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          />

          {/* Neutral deadzone guides */}
          <div
            style={{
              position: 'absolute',
              width: '26px',
              height: '16px',
              borderLeft: '1px solid rgba(148, 163, 184, 0.25)',
              borderRight: '1px solid rgba(148, 163, 184, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {/* Rotating Titanium Horizon Needle */}
          <div
            style={{
              width: '78%',
              height: '4px',
              background: 'linear-gradient(90deg, #475569, #cbd5e1, #475569)',
              borderRadius: '2px',
              transform: `rotate(${finalAngleDeg}deg)`,
              transition: 'transform 0.04s linear',
              position: 'relative',
              boxShadow: isDeadzone ? 'none' : '0 0 6px rgba(203, 213, 225, 0.3)',
            }}
          >
            {/* Fluid spirit bubble in warm amber brass */}
            <div
              style={{
                position: 'absolute',
                top: '-4px',
                left: `${50 + (finalAngleDeg / 30) * 45}%`,
                transform: 'translateX(-50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#d97706',
                border: '1px solid #fef3c7',
                transition: 'left 0.05s ease-out',
              }}
            />
          </div>
        </div>

        {/* Direction status banner */}
        <div
          style={{
            fontSize: '0.7rem',
            textAlign: 'center',
            color: isDeadzone ? '#64748b' : '#38bdf8',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {steerLabel}
        </div>

        {/* 4-Stage Chronograph Telemetry Dials */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            background: '#070a12',
            padding: '6px 4px',
            borderRadius: '6px',
            textAlign: 'center',
            border: '1px solid #1e293b',
          }}
        >
          <div>
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>RAW</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>
              {rawAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>ZEROED</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1' }}>
              {calibratedAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>FILTERED</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#38bdf8' }}>
              {smoothedAngleDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>EFFECTIVE</div>
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: !isDeadzone ? '#10b981' : '#475569',
              }}
            >
              {finalAngleDeg.toFixed(1)}°
            </div>
          </div>
        </div>
      </div>

      {/* 3. Barometric Telemetry & Hazard Deck */}
      <div
        style={{
          background: '#0d111a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}
      >
        {/* Radar Header & Distance */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 'bold',
              color: '#cbd5e1',
              letterSpacing: '0.8px',
            }}
          >
            HAZARD CLEARANCE
          </div>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: floorStatusColor,
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
                background: floorStatusColor,
              }}
            />
            {floorStatusText} ({floorGapMeters}m)
          </div>
        </div>

        {/* Segmented Danger Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '3px',
            height: '8px',
            padding: '2px',
            background: '#070a12',
            borderRadius: '4px',
            border: '1px solid #1e293b',
          }}
        >
          {RADAR_SEGMENTS.map((segmentMeters) => {
            const isFilled = floorGapMeters >= segmentMeters;
            const color =
              segmentMeters <= 3 ? '#ef4444' : segmentMeters <= 6 ? '#f59e0b' : '#10b981';
            return (
              <div
                key={segmentMeters}
                style={{
                  borderRadius: '1.5px',
                  background: isFilled ? color : '#1e293b',
                  opacity: isFilled ? 0.9 : 0.2,
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
              background: '#070a12',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#64748b', letterSpacing: '0.5px' }}>
              ALTITUDE
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#f8fafc' }}>
              {engineStats.altitudeMeters}m
            </div>
          </div>

          <div
            style={{
              background: '#070a12',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#64748b', letterSpacing: '0.5px' }}>
              RECORD
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#d97706' }}>
              {engineStats.bestAltitudeMeters}m
            </div>
          </div>

          <div
            style={{
              background: '#070a12',
              padding: '6px 4px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#64748b', letterSpacing: '0.5px' }}>
              WARPS
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#38bdf8' }}>
              {engineStats.portalsUsed}
            </div>
          </div>
        </div>

        {/* Tactile Action Switch & Keycaps Guide */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onTogglePause}
            style={{
              flex: 1,
              background: gameState === 'PAUSED' ? '#059669' : '#1e293b',
              color: '#ffffff',
              border: '1px solid #334155',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              letterSpacing: '0.5px',
            }}
          >
            <span>{gameState === 'PAUSED' ? '▶ RESUME CLIMB' : '⏸ SUSPEND'}</span>
            <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>[Space / P]</span>
          </button>

          <div
            style={{
              fontSize: '0.65rem',
              color: '#64748b',
              padding: '4px 8px',
              background: '#070a12',
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
});
