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
  isPointerSteering?: boolean;
}

const LAVA_SEGMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const LandscapeCockpit: React.FC<LandscapeCockpitProps> = React.memo(({
  state,
  engine,
  onLandmarks,
  onResetCalibration,
  onSkipCalibration,
  onTogglePause,
  isKeyboardSteering,
  isPointerSteering = false,
}) => {
  const [engineStats, setEngineStats] = useState<GameStats>(engine.stats);
  const [gameState, setGameState] = useState<GameState>(engine.state);
  const [floorGapMeters, setFloorGapMeters] = useState<number>(Math.floor(engine.floorGap / 50));

  // Sync engine telemetry (120ms throttle)
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

  // Floor / Lava hazard status
  const isLavaCritical = floorGapMeters < 3;
  const isLavaWarning = floorGapMeters >= 3 && floorGapMeters < 6;
  const lavaColor = isLavaCritical ? '#ff007f' : isLavaWarning ? '#ffaa00' : '#39ff14';
  const lavaText = isLavaCritical
    ? '🔥 DANGER! LAVA IS CLOSE! 🔥'
    : isLavaWarning
    ? '⚠️ LAVA IS RISING!'
    : '✨ SAFE CLEARANCE';

  // Arcade Score calculation
  const currentScore = engineStats.altitudeMeters * 10 + engineStats.portalsUsed * 50;
  const bestScore = Math.max(currentScore, engineStats.bestAltitudeMeters * 10);
  const padScore = (n: number) => n.toString().padStart(6, '0');

  return (
    <aside
      style={{
        width: '460px',
        height: '660px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Headless Hand Tracker Background Hook (No camera video box on screen!) */}
      <Webcam onLandmarks={onLandmarks} />

      {/* 1. Retro Arcade Motion Deck (Zero Camera Window) */}
      <div
        style={{
          background: 'linear-gradient(180deg, #160a2c 0%, #0d041c 100%)',
          border: '2px solid #3b176d',
          borderRadius: '16px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 0 16px rgba(168, 85, 247, 0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.60rem',
              color: '#ffe600',
              letterSpacing: '1px',
              textShadow: '0 0 6px rgba(255, 230, 0, 0.5)',
            }}
          >
            ★ MOTION SENSOR ★
          </span>

          <div
            style={{
              background: state.isHandTrackingActive
                ? state.isHandLockActive
                  ? 'rgba(6, 78, 59, 0.95)'
                  : 'rgba(5, 78, 59, 0.9)'
                : isKeyboardSteering || isPointerSteering
                ? 'rgba(30, 58, 138, 0.9)'
                : 'rgba(59, 23, 109, 0.9)',
              border: `1px solid ${
                state.isHandTrackingActive
                  ? state.isHandLockActive
                    ? '#34d399'
                    : '#10b981'
                  : isKeyboardSteering || isPointerSteering
                  ? '#3b82f6'
                  : '#7c3aed'
              }`,
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: '6px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.48rem',
              letterSpacing: '0.5px',
              boxShadow: state.isHandTrackingActive ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none',
            }}
          >
            {state.isHandTrackingActive
              ? state.isHandLockActive
                ? '🔒 HAND LOCK: ACTIVE'
                : state.isCalibrating
                ? `🔒 LOCKING: ${Math.round(state.calibrationProgress * 100)}%`
                : state.hasBothHands
                ? '● DUAL STEERING'
                : '● 1-HAND STEERING'
              : isKeyboardSteering
              ? '⌨️ KEYBOARD'
              : isPointerSteering
              ? '🖱️ MOUSE'
              : '👐 READY'}
          </div>
        </div>

        {/* Dual Hand Node Indicators with Calibration Lock Reticles */}
        <div
          style={{
            background: '#070210',
            borderRadius: '10px',
            border: `1px solid ${state.isHandLockActive ? '#059669' : '#3b176d'}`,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: state.isHandLockActive ? 'inset 0 0 12px rgba(16, 185, 129, 0.15)' : 'none',
          }}
        >
          {/* Left Hand Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: state.leftHand ? '#00f3ff' : '#28114a',
                boxShadow: state.leftHand ? '0 0 10px #00f3ff' : 'none',
                border: '1px solid #00f3ff',
                transition: 'all 0.15s ease',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.50rem',
                  color: state.leftHand ? '#00f3ff' : '#64748b',
                }}
              >
                LEFT HAND
              </span>
              {state.isHandLockActive && state.leftHand && (
                <span style={{ fontSize: '0.45rem', color: '#34d399', fontWeight: 600 }}>
                  [🔒 LOCKED]
                </span>
              )}
            </div>
          </div>

          {/* Center laser connection line */}
          <div
            style={{
              flex: 1,
              height: '2px',
              margin: '0 12px',
              background: state.hasBothHands
                ? 'linear-gradient(90deg, #00f3ff, #ffe600, #ff007f)'
                : '#28114a',
              boxShadow: state.hasBothHands ? '0 0 8px #ffe600' : 'none',
              transition: 'all 0.15s ease',
            }}
          />

          {/* Right Hand Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'right' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.50rem',
                  color: state.rightHand ? '#ff007f' : '#64748b',
                }}
              >
                RIGHT HAND
              </span>
              {state.isHandLockActive && state.rightHand && (
                <span style={{ fontSize: '0.45rem', color: '#34d399', fontWeight: 600 }}>
                  [🔒 LOCKED]
                </span>
              )}
            </div>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: state.rightHand ? '#ff007f' : '#28114a',
                boxShadow: state.rightHand ? '0 0 10px #ff007f' : 'none',
                border: '1px solid #ff007f',
                transition: 'all 0.15s ease',
              }}
            />
          </div>
        </div>

        {/* Hand Status Cue */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.68rem',
            color: '#94a3b8',
            padding: '0 4px',
          }}
        >
          <span>
            {state.isHandTrackingActive
              ? state.isHandLockActive
                ? '🔒 Stance locked • Press [C] to re-lock'
                : '✨ Tilt freely in front of screen'
              : 'Tip: Hold hands in air or move mouse'}
          </span>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.45rem',
              color: state.isOpenPalm ? '#39ff14' : '#64748b',
            }}
          >
            {state.isOpenPalm ? '✋ PALM PAUSE' : 'PALM GESTURE'}
          </span>
        </div>
      </div>

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

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isCalibrated && (
              <button
                onClick={onSkipCalibration}
                style={{
                  background: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.52rem',
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
                padding: '5px 12px',
                borderRadius: '6px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.52rem',
                cursor: 'pointer',
                boxShadow: isCalibrating ? '0 2px 0 #9d174d' : '0 2px 0 #5b21b6',
                transition: 'all 0.1s ease',
              }}
            >
              {isCalibrating ? (hasBothHands ? 'LOCKING...' : 'WAITING...') : 'RE-LOCK [C]'}
            </button>
          </div>
        </div>

        {/* Calibration Progress Bar */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: '4px',
            }}
          >
            <span style={{ color: isCalibrating && !hasBothHands ? '#f59e0b' : '#e2e8f0' }}>
              {isCalibrating
                ? hasBothHands
                  ? 'Hold hands level to lock stance...'
                  : 'Raise hands in camera to lock...'
                : isCalibrated
                ? 'Stance locked! Press [C] anytime to re-lock'
                : 'Click Re-Lock if needed'}
            </span>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.55rem' }}>
              {Math.round(calibrationProgress * 100)}%
            </span>
          </div>
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

        {/* Lava / Floor Danger Meter */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.52rem',
                color: lavaColor,
                textShadow: `0 0 8px ${lavaColor}`,
              }}
            >
              {lavaText}
            </span>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.52rem',
                color: '#ffffff',
              }}
            >
              {floorGapMeters}m
            </span>
          </div>

          {/* Segmented Retro Lava Meter */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: '4px',
              height: '10px',
              padding: '2px',
              background: '#070210',
              borderRadius: '4px',
              border: '1px solid #3b176d',
            }}
          >
            {LAVA_SEGMENTS.map((seg) => {
              const isFilled = floorGapMeters >= seg;
              const color = seg <= 3 ? '#ff007f' : seg <= 6 ? '#ffaa00' : '#39ff14';
              return (
                <div
                  key={seg}
                  style={{
                    borderRadius: '2px',
                    background: isFilled ? color : '#1c0e36',
                    boxShadow: isFilled ? `0 0 6px ${color}` : 'none',
                    transition: 'all 0.12s ease',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Big Retro Action Buttons */}
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
      </div>
    </aside>
  );
});
