import { useState, useRef, useCallback, useEffect } from 'react';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import type { TiltDebugState } from './input/tiltController';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './game/GameCanvas';
import { LandscapeCockpit } from './components/LandscapeCockpit';
import './App.css';

const INITIAL_DEBUG_STATE: TiltDebugState = {
  hasBothHands: false,
  leftHand: null,
  rightHand: null,
  rawAngleRad: 0,
  rawAngleDeg: 0,
  calibratedAngleDeg: 0,
  smoothedAngleDeg: 0,
  finalAngleDeg: 0,
  finalAngleRad: 0,
  isCalibrating: true,
  calibrationProgress: 0,
  isCalibrated: false,
  neutralOffsetDeg: 0,
  isOpenPalm: false,
  palmPauseTriggered: false,
};

function App() {
  const pipelineRef = useRef<TiltPipeline>(new TiltPipeline(DEFAULT_TILT_CONFIG));
  const engineRef = useRef<GameEngine>(new GameEngine());
  const [debugState, setDebugState] = useState<TiltDebugState>(INITIAL_DEBUG_STATE);
  const [keyboardAngleRad, setKeyboardAngleRad] = useState<number | null>(null);
  const [engineState, setEngineState] = useState(engineRef.current.state);
  const [scale, setScale] = useState(1);

  // Responsive scale calculation to guarantee zero vertical scrolling on any landscape display
  useEffect(() => {
    const updateScale = () => {
      const targetW = 1260;
      const targetH = 716;
      const padX = 24;
      const padY = 20;
      const availableW = window.innerWidth - padX;
      const availableH = window.innerHeight - padY;
      const scaleW = availableW / targetW;
      const scaleH = availableH / targetH;
      // Scale gracefully down on compact 768p laptop viewports or up to 1.15 on 4K
      const computed = Math.min(Math.max(0.55, Math.min(scaleW, scaleH)), 1.15);
      setScale(computed);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Poll engine state for header status badge
  useEffect(() => {
    const interval = setInterval(() => {
      setEngineState(engineRef.current.state);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Keyboard controls (Arrow keys for tilt, Space/P for pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setKeyboardAngleRad(-0.28); // ~-16 deg
      } else if (e.key === 'ArrowRight') {
        setKeyboardAngleRad(0.28); // ~+16 deg
      } else if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        engineRef.current.togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setKeyboardAngleRad(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleLandmarks = useCallback((landmarks: HandLandmarks, isOpenPalm: boolean) => {
    const nextState = pipelineRef.current.process(landmarks, isOpenPalm);
    setDebugState(nextState);

    // Palm pause ONLY triggers if the game is actively PLAYING!
    // Never while already paused, game over, or starting up.
    if (nextState.palmPauseTriggered && engineRef.current.state === 'PLAYING') {
      pipelineRef.current.lockoutPauseGesture(60);
      engineRef.current.pause();
    }
  }, []);

  const handleResetCalibration = useCallback(() => {
    pipelineRef.current.resetCalibration();
    setDebugState((prev) => ({
      ...prev,
      isCalibrating: true,
      isCalibrated: false,
      calibrationProgress: 0,
      neutralOffsetDeg: 0,
      rawAngleDeg: 0,
      calibratedAngleDeg: 0,
      smoothedAngleDeg: 0,
      finalAngleDeg: 0,
      finalAngleRad: 0,
    }));
  }, []);

  const handleSkipCalibration = useCallback(() => {
    pipelineRef.current.skipCalibration();
    setDebugState((prev) => ({
      ...prev,
      isCalibrated: true,
      isCalibrating: false,
      calibrationProgress: 1,
      neutralOffsetDeg: 0,
    }));
  }, []);

  const handleStartGame = useCallback(() => {
    pipelineRef.current.resetCalibration(); // Calibrate fresh during 3-second countdown!
    pipelineRef.current.lockoutPauseGesture(130); // ~4.3s lockout covering countdown + early climb
    engineRef.current.startGame();
  }, []);

  const handleSkipCalibrationAndStart = useCallback(() => {
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(130);
    setDebugState((prev) => ({
      ...prev,
      isCalibrated: true,
      isCalibrating: false,
      calibrationProgress: 1,
      neutralOffsetDeg: 0,
    }));
    engineRef.current.startGame();
  }, []);

  const handleRestart = useCallback(() => {
    pipelineRef.current.resetCalibration(); // Calibrate fresh during 3-second countdown!
    pipelineRef.current.lockoutPauseGesture(130);
    engineRef.current.startGame();
  }, []);

  const handleTogglePause = useCallback(() => {
    if (engineRef.current.state === 'PAUSED') {
      pipelineRef.current.lockoutPauseGesture(80); // Lockout when resuming
      engineRef.current.resume();
    } else if (engineRef.current.state === 'PLAYING') {
      pipelineRef.current.lockoutPauseGesture(60);
      engineRef.current.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Use keyboard tilt if active, otherwise use hand tilt pipeline
  const activeTiltRad =
    keyboardAngleRad !== null && keyboardAngleRad !== 0
      ? keyboardAngleRad
      : debugState.finalAngleRad;

  return (
    <div className="arcade-app">
      <div className="arcade-viewport" style={{ transform: `scale(${scale})` }}>
        {/* Sleek Top Marquee */}
        <header className="arcade-header">
          <div className="brand-section">
            <span className="brand-title">SKYWARD ROLL</span>
            <span className="brand-pill">ARCADE COCKPIT</span>
          </div>

          <div className="status-section">
            <span
              className="status-dot"
              style={{
                background:
                  engineState === 'PLAYING'
                    ? '#10b981'
                    : engineState === 'COUNTDOWN'
                    ? '#38bdf8'
                    : engineState === 'PAUSED'
                    ? '#f59e0b'
                    : engineState === 'GAME_OVER'
                    ? '#ef4444'
                    : '#a855f7',
                boxShadow:
                  engineState === 'PLAYING'
                    ? '0 0 8px #10b981'
                    : engineState === 'COUNTDOWN'
                    ? '0 0 8px #38bdf8'
                    : engineState === 'PAUSED'
                    ? '0 0 8px #f59e0b'
                    : 'none',
              }}
            />
            <span style={{ color: '#cbd5e1' }}>
              {engineState === 'PLAYING'
                ? 'ACTIVE CLIMB'
                : engineState === 'COUNTDOWN'
                ? 'CALIBRATING & READY'
                : engineState === 'PAUSED'
                ? 'PAUSED'
                : engineState === 'GAME_OVER'
                ? 'GAME OVER'
                : 'SYSTEM READY'}
            </span>
          </div>

          <div className="header-actions">
            <span>
              Steer: <kbd>←</kbd> <kbd>→</kbd> / Hands
            </span>
            <span>
              Pause: <kbd>Space</kbd> / <kbd>P</kbd> / ✋
            </span>
            <button className="header-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
              ⛶ Fullscreen
            </button>
          </div>
        </header>

        {/* Main Stage: Playfield Canvas + Landscape Cockpit side-by-side */}
        <main className="arcade-stage">
          <GameCanvas
            engine={engineRef.current}
            tiltAngleRad={activeTiltRad}
            isCalibrated={debugState.isCalibrated}
            onStartGame={handleStartGame}
            onSkipCalibrationAndStart={handleSkipCalibrationAndStart}
            onRestart={handleRestart}
            onTogglePause={handleTogglePause}
          />

          <LandscapeCockpit
            state={debugState}
            engine={engineRef.current}
            onLandmarks={handleLandmarks}
            onResetCalibration={handleResetCalibration}
            onSkipCalibration={handleSkipCalibration}
            onTogglePause={handleTogglePause}
            isKeyboardSteering={keyboardAngleRad !== null && keyboardAngleRad !== 0}
          />
        </main>
      </div>
    </div>
  );
}

export default App;