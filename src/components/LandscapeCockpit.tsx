import React, { useEffect, useState } from 'react';
import { Webcam } from './Webcam';
import type { HandLandmarks } from '../hooks/useMediaPipeHands';
import type { TiltDebugState } from '../input/tiltController';
import type { GameEngine, GameStats, GameState } from '../game/GameEngine';

export type ControlMode = 'GYRO' | 'HAND_CAM' | 'TOUCH' | 'KEYBOARD';

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

export const LandscapeCockpit = React.memo(function LandscapeCockpit({
  state, engine, onLandmarks, onResetCalibration, onTogglePause, isKeyboardSteering,
  videoRef, cameraActive, cameraError, isCameraReady, onStartCamera,
  controlMode = 'HAND_CAM',
}: LandscapeCockpitProps) {
  const [stats, setStats] = useState<GameStats>(engine.stats);
  const [gameState, setGameState] = useState<GameState>(engine.state);
  const [tilt, setTilt] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStats(engine.stats);
      setGameState(engine.state);
      setTilt(engine.bar.angleRad * 180 / Math.PI);
    }, 100);
    return () => clearInterval(id);
  }, [engine]);
  const hasRun = ['PLAYING', 'COUNTDOWN', 'PAUSED', 'GAME_OVER'].includes(gameState);
  const canPause = gameState === 'PLAYING' || gameState === 'PAUSED';
  const cameraMode = controlMode === 'HAND_CAM';
  const score = stats.altitudeMeters * 10 + stats.portalsUsed * 50;
  return (
    <aside className="arcade-cockpit" aria-label={hasRun ? 'Flight instruments' : 'Control setup'}>
      {cameraMode ? <>
        <Webcam onLandmarks={onLandmarks} state={state} isKeyboardSteering={isKeyboardSteering}
          videoRef={videoRef} cameraActive={cameraActive} cameraError={cameraError}
          isReady={isCameraReady} onStartCamera={onStartCamera} />

      </> : <>
        <video ref={videoRef} autoPlay playsInline muted hidden />
        {!hasRun && <section className="sidebar-card keyboard-guide">
          <span className="guide-icon" aria-hidden="true">⌨</span>
          <h2>KEYBOARD READY</h2>
          <p className="panel-description">No camera needed. Keep a light touch on the keys and let the ball roll.</p>
          <dl className="shortcut-list">
            <div><dt>Steer</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd></div>
            <div><dt>Pause</dt><dd><kbd>Space</kbd></dd></div>
            <div><dt>Restart</dt><dd><kbd>R</kbd></dd></div>
          </dl>
        </section>}
      </>}
      {(hasRun || cameraMode) && <>
        <section className="sidebar-card live-balance">
          <div className="panel-heading"><h2>★ TILT-O-METER ★</h2><span className="panel-caption">{isKeyboardSteering || controlMode === 'KEYBOARD' ? 'KEYBOARD' : 'CAMERA'}</span></div>
          <div className="balance-track" aria-hidden="true"><span style={{ transform: `rotate(${Math.max(-25, Math.min(25, tilt))}deg)` }}><i /></span></div>
          <p className="balance-caption">{Math.abs(tilt) < 1 ? 'LEVEL & BALANCED' : tilt < 0 ? 'ROLLING LEFT' : 'ROLLING RIGHT'}</p>
        {cameraMode && cameraActive && <div className="balance-calibration calibration-card">
          <div className="panel-heading"><h2>{state.isCalibrated ? 'Calibrated ✓' : 'Find your balance'}</h2>
            <button className="text-action" onClick={onResetCalibration}>Recalibrate</button></div>
          {!state.isCalibrated && <>
            <p className="panel-description">{state.hasBothHands ? 'Keep both hands level for a moment.' : 'Raise both hands into the camera view.'}</p>
            <progress aria-label="Hand calibration" value={state.calibrationProgress} max={1} />
          </>}
        </div>}
        </section>
        {hasRun && <section className="sidebar-card flight-stats">
          <div className="panel-heading"><h2>Stage {String(stats.sectorLevel).padStart(2, '0')}</h2><span className="panel-caption">{stats.metersToNextGate > 0 ? `${stats.metersToNextGate}m to gate` : 'Orbital apex'}</span></div>
          <p className="sector-name">{stats.sectorName}</p>
          <progress aria-label="Stage progress" value={stats.sectorProgress} max={1} />
          <dl className="score-grid">
            <div><dt>Score</dt><dd>{String(score).padStart(6, '0')}</dd></div>
            <div><dt>HI-SCORE</dt><dd>{String(Math.max(score, stats.bestAltitudeMeters * 10)).padStart(6, '0')}</dd></div>
            <div><dt>Warps</dt><dd>{stats.portalsUsed}</dd></div>
          </dl>
          {canPause && <button className="secondary-action" onClick={onTogglePause}>{gameState === 'PAUSED' ? 'Resume game' : 'Pause game'}<kbd>Space</kbd></button>}
        </section>}
      </>}
      {!hasRun && <p className="sidebar-note">★ KEEP YOUR BALANCE ★<br />CHASE YOUR NEXT HIGH SCORE</p>}
    </aside>
  );
});
