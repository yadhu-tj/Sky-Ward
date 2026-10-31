import { useState, useRef, useCallback, useEffect } from 'react';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import type { TiltDebugState } from './input/tiltController';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './game/GameCanvas';
import { LandscapeCockpit } from './components/LandscapeCockpit';
import { HowToPlayModal } from './components/HowToPlayModal';
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
  leftHandHeight: 0.5,
  rightHandHeight: 0.5,
  isHandTrackingActive: false,
  isSingleHandMode: false,
  isHandLockActive: false,
  lockedLeftAnchor: null,
  lockedRightAnchor: null,
  lockedBaselineY: 0.55,
  handLockStatus: 'LOCKING',
};

function App() {
  const pipelineRef = useRef<TiltPipeline>(new TiltPipeline(DEFAULT_TILT_CONFIG));
  const engineRef = useRef<GameEngine>(new GameEngine());
  const [debugState, setDebugState] = useState<TiltDebugState>(INITIAL_DEBUG_STATE);
  const [keyboardAngleRad, setKeyboardAngleRad] = useState<number | null>(null);
  const [engineState, setEngineState] = useState(engineRef.current.state);
  const [scale, setScale] = useState(1);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('skyward_intro_seen') !== 'true';
    } catch {
      return true;
    }
  });

  const handleCloseHowToPlay = useCallback(() => {
    setIsHowToPlayOpen(false);
    try {
      localStorage.setItem('skyward_intro_seen', 'true');
    } catch {}
  }, []);

  const handleOpenHowToPlay = useCallback(() => {
    setIsHowToPlayOpen(true);
  }, []);

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

  // Hook up event-driven engine state listener (zero polling overhead)
  useEffect(() => {
    engineRef.current.onStateChange = (newState) => {
      setEngineState(newState);
    };
  }, []);

  const keyboardAngleRadRef = useRef<number | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Keyboard controls (Arrow keys for tilt, Space/P for pause, C to quick re-lock stance)
  useEffect(() => {
    const syncKeyboardAngle = () => {
      const left = pressedKeysRef.current.has('ArrowLeft');
      const right = pressedKeysRef.current.has('ArrowRight');
      const nextAngle = left && !right ? -0.28 : right && !left ? 0.28 : 0;
      keyboardAngleRadRef.current = nextAngle;
      setKeyboardAngleRad(nextAngle);
      engineRef.current.setTiltAngle(nextAngle);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        pressedKeysRef.current.add(e.key);
        syncKeyboardAngle();
      } else if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        engineRef.current.togglePause();
      } else if (e.key.toLowerCase() === 'c') {
        // Quick Re-Lock Hand Anchor posture mid-game without pausing!
        pipelineRef.current.resetCalibration();
        setDebugState((prev) => ({
          ...prev,
          isCalibrating: true,
          isCalibrated: false,
          isHandLockActive: false,
          calibrationProgress: 0,
          handLockStatus: 'LOCKING',
        }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        pressedKeysRef.current.delete(e.key);
        syncKeyboardAngle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const lastDebugTimeRef = useRef(0);
  const lastDebugStateRef = useRef<TiltDebugState>(debugState);

  const handleLandmarks = useCallback((landmarks: HandLandmarks, isOpenPalm: boolean) => {
    const nextState = pipelineRef.current.process(landmarks, isOpenPalm);

    // Sync tilt directly to engine at full 60fps with zero React overhead
    if (!keyboardAngleRadRef.current) {
      engineRef.current.setTiltAngle(nextState.finalAngleRad);
    }

    // Two-way Open Palm gesture: pauses when PLAYING and resumes when PAUSED!
    if (nextState.palmPauseTriggered) {
      if (engineRef.current.state === 'PLAYING') {
        pipelineRef.current.lockoutPauseGesture(60);
        engineRef.current.pause();
      } else if (engineRef.current.state === 'PAUSED') {
        pipelineRef.current.lockoutPauseGesture(75);
        engineRef.current.resume();
      }
    }

    // Throttle React state updates to ~20fps (50ms) unless key lifecycle states change
    const now = performance.now();
    const prev = lastDebugStateRef.current;
    const isStateTransition =
      nextState.isCalibrated !== prev.isCalibrated ||
      nextState.isCalibrating !== prev.isCalibrating ||
      nextState.isHandTrackingActive !== prev.isHandTrackingActive ||
      nextState.hasBothHands !== prev.hasBothHands ||
      nextState.isHandLockActive !== prev.isHandLockActive ||
      nextState.isOpenPalm !== prev.isOpenPalm;

    if (isStateTransition || now - lastDebugTimeRef.current >= 50) {
      lastDebugTimeRef.current = now;
      lastDebugStateRef.current = nextState;
      setDebugState(nextState);
    }
  }, []);

  const handleResetCalibration = useCallback(() => {
    pipelineRef.current.resetCalibration();
    const resetState: TiltDebugState = {
      ...lastDebugStateRef.current,
      isCalibrating: true,
      isCalibrated: false,
      isHandLockActive: false,
      calibrationProgress: 0,
      neutralOffsetDeg: 0,
      rawAngleDeg: 0,
      calibratedAngleDeg: 0,
      smoothedAngleDeg: 0,
      finalAngleDeg: 0,
      finalAngleRad: 0,
      lockedLeftAnchor: null,
      lockedRightAnchor: null,
      handLockStatus: 'LOCKING',
    };
    lastDebugStateRef.current = resetState;
    setDebugState(resetState);
  }, []);

  const handleSkipCalibration = useCallback(() => {
    pipelineRef.current.skipCalibration();
    const skipState: TiltDebugState = {
      ...lastDebugStateRef.current,
      isCalibrated: true,
      isCalibrating: false,
      isHandLockActive: true,
      calibrationProgress: 1,
      neutralOffsetDeg: 0,
      handLockStatus: 'LOCKED',
    };
    lastDebugStateRef.current = skipState;
    setDebugState(skipState);
  }, []);

  const handleStartGame = useCallback(() => {
    pipelineRef.current.resetCalibration(); // Calibrate fresh during 3-second countdown!
    pipelineRef.current.lockoutPauseGesture(130); // ~4.3s lockout covering countdown + early climb
    engineRef.current.startGame();
  }, []);

  const handleSkipCalibrationAndStart = useCallback(() => {
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(130);
    const skipState: TiltDebugState = {
      ...lastDebugStateRef.current,
      isCalibrated: true,
      isCalibrating: false,
      isHandLockActive: true,
      calibrationProgress: 1,
      neutralOffsetDeg: 0,
      handLockStatus: 'LOCKED',
    };
    lastDebugStateRef.current = skipState;
    setDebugState(skipState);
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

  const pointerAngleRef = useRef<number>(0);
  const [isPointerSteering, setIsPointerSteering] = useState(false);

  // High-performance full-screen mouse pointer steering (stable listener, zero React thrashing)
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent) => {
      // If hands are actively steering, hands have priority
      if (lastDebugStateRef.current.isHandTrackingActive) {
        pointerAngleRef.current = 0;
        return;
      }

      // Map clientX across window width: -1 (left) to +1 (right)
      const relX = (e.clientX / window.innerWidth) * 2 - 1;
      const deadZone = 0.06;
      let angle = 0;
      if (Math.abs(relX) > deadZone) {
        const sign = Math.sign(relX);
        const intensity = (Math.abs(relX) - deadZone) / (1 - deadZone);
        angle = sign * intensity * 0.32; // ~18 degrees max tilt
      }
      pointerAngleRef.current = angle;

      // Update steering state boolean only if changed
      const isSteeringNow = Math.abs(angle) > 0.01;
      setIsPointerSteering((prev) => (prev !== isSteeringNow ? isSteeringNow : prev));

      // Push directly to engine without triggering React Virtual DOM diffing
      engineRef.current.setTiltAngle(angle);
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('mousemove', handlePointerMove);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Use keyboard tilt if active, otherwise hands, otherwise mouse pointer
  const activeTiltRad =
    keyboardAngleRad !== null && keyboardAngleRad !== 0
      ? keyboardAngleRad
      : debugState.isHandTrackingActive
      ? debugState.finalAngleRad
      : pointerAngleRef.current;

  return (
    <div className="arcade-app">
      <div
        className="arcade-viewport"
        style={scale < 0.99 || scale > 1.01 ? { transform: `scale(${scale})` } : undefined}
      >
        {/* Retro Arcade Marquee Header */}
        <header className="arcade-header">
          <div className="brand-section">
            <span className="brand-title">
              <span className="star-badge">★</span> SKYWARD ROLL <span className="star-badge">★</span>
            </span>
            <span className="brand-pill">ARCADE '83</span>
          </div>

          <div className="status-section">
            <span
              className="status-dot"
              style={{
                background:
                  engineState === 'PLAYING'
                    ? '#39ff14'
                    : engineState === 'COUNTDOWN'
                    ? '#00f3ff'
                    : engineState === 'PAUSED'
                    ? '#ffe600'
                    : engineState === 'GAME_OVER'
                    ? '#ff007f'
                    : '#a855f7',
                boxShadow:
                  engineState === 'PLAYING'
                    ? '0 0 10px #39ff14'
                    : engineState === 'COUNTDOWN'
                    ? '0 0 10px #00f3ff'
                    : 'none',
              }}
            />
            <span
              className="status-text"
              style={{
                color:
                  engineState === 'PLAYING'
                    ? '#39ff14'
                    : engineState === 'COUNTDOWN'
                    ? '#00f3ff'
                    : engineState === 'PAUSED'
                    ? '#ffe600'
                    : engineState === 'GAME_OVER'
                    ? '#ff007f'
                    : '#cbd5e1',
                textShadow:
                  engineState === 'PLAYING'
                    ? '0 0 8px rgba(57, 255, 20, 0.6)'
                    : engineState === 'COUNTDOWN'
                    ? '0 0 8px rgba(0, 243, 255, 0.6)'
                    : 'none',
              }}
            >
              {engineState === 'PLAYING'
                ? 'ROLLING!'
                : engineState === 'COUNTDOWN'
                ? 'GET READY!'
                : engineState === 'PAUSED'
                ? 'PAUSED'
                : engineState === 'GAME_OVER'
                ? 'GAME OVER'
                : '1P READY'}
            </span>
          </div>

          <div className="header-actions">
            <button
              className="header-btn header-btn-manual"
              onClick={handleOpenHowToPlay}
              title="Open How to Play Manual"
            >
              HOW TO PLAY
            </button>
            <button
              className="header-btn header-btn-fullscreen"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
            >
              FULLSCREEN
            </button>
          </div>
        </header>

        {/* Main Stage: Playfield Canvas + Landscape Cockpit side-by-side */}
        <main className="arcade-stage">
          <GameCanvas
            engine={engineRef.current}
            tiltAngleRad={activeTiltRad}
            isCalibrated={debugState.isCalibrated}
            isHandLockActive={debugState.isHandLockActive}
            onStartGame={handleStartGame}
            onSkipCalibrationAndStart={handleSkipCalibrationAndStart}
            onRestart={handleRestart}
            onTogglePause={handleTogglePause}
            isHandTrackingActive={debugState.isHandTrackingActive}
            onOpenHowToPlay={handleOpenHowToPlay}
          />

          <LandscapeCockpit
            state={debugState}
            engine={engineRef.current}
            onLandmarks={handleLandmarks}
            onResetCalibration={handleResetCalibration}
            onSkipCalibration={handleSkipCalibration}
            onTogglePause={handleTogglePause}
            isKeyboardSteering={keyboardAngleRad !== null && keyboardAngleRad !== 0}
            isPointerSteering={isPointerSteering}
          />
        </main>
      </div>

      {/* Retro Arcade Intro & How-To-Play Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={handleCloseHowToPlay}
        onStartGame={handleStartGame}
        onQuickPlay={handleSkipCalibrationAndStart}
        debugState={debugState}
        isKeyboardSteering={keyboardAngleRad !== null && keyboardAngleRad !== 0}
        isPointerSteering={isPointerSteering}
      />
    </div>
  );
}

export default App;