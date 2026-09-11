import { useState, useRef, useCallback, useEffect } from 'react';
import { Webcam } from './components/Webcam';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import type { TiltDebugState } from './input/tiltController';
import { TiltDebugView } from './components/TiltDebugView';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './game/GameCanvas';
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
    pipelineRef.current.lockoutPauseGesture(80); // 2.7s lockout so reaching for keyboard/mouse won't pause
    engineRef.current.startGame();
  }, []);

  const handleSkipCalibrationAndStart = useCallback(() => {
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(80);
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
    pipelineRef.current.lockoutPauseGesture(80);
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

  // Use keyboard tilt if active, otherwise use hand tilt pipeline
  const activeTiltRad =
    keyboardAngleRad !== null && keyboardAngleRad !== 0
      ? keyboardAngleRad
      : debugState.finalAngleRad;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1.25rem 2rem',
        minHeight: '100vh',
        background: '#070b14',
        color: '#f8fafc',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <h1
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '2.2rem',
            letterSpacing: '1.5px',
            color: '#38bdf8',
          }}
        >
          SKYWARD ROLL
        </h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
          Motion-Controlled Arcade Platformer · Hand Tilt & Gravity Projection
        </p>
      </header>

      {/* Main Container: Game on left, Camera & Debug on right */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '1.5rem',
          alignItems: 'flex-start',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '1240px',
          width: '100%',
        }}
      >
        {/* Playfield Canvas */}
        <GameCanvas
          engine={engineRef.current}
          tiltAngleRad={activeTiltRad}
          isCalibrated={debugState.isCalibrated}
          onStartGame={handleStartGame}
          onSkipCalibrationAndStart={handleSkipCalibrationAndStart}
          onRestart={handleRestart}
          onTogglePause={handleTogglePause}
        />

        {/* Right Panel: Camera & Tilt Debugger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '480px' }}>
          <Webcam onLandmarks={handleLandmarks} width={480} height={320} />
          <TiltDebugView
            state={debugState}
            onResetCalibration={handleResetCalibration}
            onSkipCalibration={handleSkipCalibration}
          />

          <div
            style={{
              padding: '10px 14px',
              background: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              fontSize: '0.8rem',
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            <div>
              Controls: Tilt hands or hold <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>←</kbd> / <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>→</kbd> to steer.
            </div>
            <div style={{ marginTop: '4px' }}>
              Pause: Hold open palm ✋ in front of camera, or press <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>Space</kbd>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;