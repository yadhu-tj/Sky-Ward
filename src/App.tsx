import { useState, useRef, useCallback, useEffect } from 'react';
import { useMediaPipeHands } from './hooks/useMediaPipeHands';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import type { TiltDebugState } from './input/tiltController';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './game/GameCanvas';
import { LandscapeCockpit } from './components/LandscapeCockpit';
import type { ControlMode } from './components/LandscapeCockpit';
import { HowToPlayModal } from './components/HowToPlayModal';
import { CameraPermissionModal } from './components/CameraPermissionModal';
import { SettingsSheet } from './components/SettingsSheet';
import { soundEffects } from './game/soundEffects';
import { backgroundMusic } from './game/backgroundMusic';
import { useDeviceOrientation } from './hooks/useDeviceOrientation';
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

  // Mobile device detection and orientation (strictly matches @media max-width: 600px / landscape phone)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isPhoneUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return w <= 600 || (h <= 500 && w > h && isPhoneUA);
  });

  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  const gyro = useDeviceOrientation();

  // On physical mobile devices, default to GYRO for ergonomic handheld play; on desktop default to HAND_CAM
  const [controlMode, setControlMode] = useState<ControlMode>(() => {
    if (typeof window !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
      return 'GYRO';
    }
    return 'HAND_CAM';
  });

  const [touchDirection, setTouchDirection] = useState<-1 | 0 | 1>(0);

  const handleTouchTilt = useCallback((dir: -1 | 0 | 1) => {
    setTouchDirection(dir);
    const angle = dir === -1 ? -0.28 : dir === 1 ? 0.28 : 0;
    engineRef.current.setTiltAngle(angle);
  }, []);

  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState<boolean>(false);

  const handleCloseHowToPlay = useCallback(() => {
    setIsHowToPlayOpen(false);
    try {
      localStorage.setItem('skyward_intro_seen', 'true');
    } catch {}
  }, []);

  const handleOpenHowToPlay = useCallback(() => {
    setIsHowToPlayOpen(true);
  }, []);

  // Responsive scale and orientation tracking
  useEffect(() => {
    const updateDimensions = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isPhoneUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const mobile = w <= 600 || (h <= 500 && w > h && isPhoneUA);
      const portrait = h > w;
      setIsMobile(mobile);
      setIsPortrait(portrait);

      if (mobile) {
        // Mobile layout uses responsive 100dvh flex layout with zero transform distortion
        setScale(1);
        return;
      }

      const targetW = 1260;
      const targetH = 716;
      const padX = 24;
      const padY = 20;
      const availableW = w - padX;
      const availableH = h - padY;
      const scaleW = availableW / targetW;
      const scaleH = availableH / targetH;
      // Scale gracefully down on compact viewports or up to 1.15 on 4K
      const computed = Math.min(Math.max(0.46, Math.min(scaleW, scaleH)), 1.15);
      setScale(computed);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, []);

  // Hook up event-driven engine state listener (zero polling overhead)
  useEffect(() => {
    engineRef.current.onStateChange = (newState) => {
      if (newState === 'PLAYING' && !lastDebugStateRef.current.isCalibrated) {
        pipelineRef.current.skipCalibration();
        const lockedState: TiltDebugState = {
          ...lastDebugStateRef.current,
          isCalibrated: true,
          isCalibrating: false,
          isHandLockActive: true,
          calibrationProgress: 1,
          handLockStatus: 'LOCKED',
        };
        lastDebugStateRef.current = lockedState;
        setDebugState(lockedState);
      }
      setEngineState(newState);
    };
  }, []);

  const keyboardAngleRadRef = useRef<number | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const handleSkipCalibrationAndStartRef = useRef<(() => void) | null>(null);

  // Keyboard controls (Arrow keys & A/D for tilt, Space/P for pause, C to quick re-lock stance, Arrow/Space/Enter to start)
  useEffect(() => {
    const syncKeyboardAngle = () => {
      const left =
        pressedKeysRef.current.has('ArrowLeft') ||
        pressedKeysRef.current.has('KeyA') ||
        pressedKeysRef.current.has('a') ||
        pressedKeysRef.current.has('A');
      const right =
        pressedKeysRef.current.has('ArrowRight') ||
        pressedKeysRef.current.has('KeyD') ||
        pressedKeysRef.current.has('d') ||
        pressedKeysRef.current.has('D');
      const nextAngle = left && !right ? -0.28 : right && !left ? 0.28 : 0;
      keyboardAngleRadRef.current = nextAngle;
      setKeyboardAngleRad(nextAngle);
      engineRef.current.setTiltAngle(nextAngle);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'a' ||
        e.key === 'A' ||
        e.key === 'd' ||
        e.key === 'D'
      ) {
        e.preventDefault();
        pressedKeysRef.current.add(e.key);
        syncKeyboardAngle();

        // If player presses arrow/steering keys on start screen, auto-start immediately!
        if (engineRef.current.state === 'CALIBRATING' || engineRef.current.state === 'READY') {
          handleSkipCalibrationAndStartRef.current?.();
        }
      } else if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (engineRef.current.state === 'CALIBRATING' || engineRef.current.state === 'READY') {
          handleSkipCalibrationAndStartRef.current?.();
        } else {
          engineRef.current.togglePause();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (
          engineRef.current.state === 'CALIBRATING' ||
          engineRef.current.state === 'READY' ||
          engineRef.current.state === 'GAME_OVER'
        ) {
          handleSkipCalibrationAndStartRef.current?.();
        }
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
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'a' ||
        e.key === 'A' ||
        e.key === 'd' ||
        e.key === 'D'
      ) {
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
        soundEffects.playPause();
        engineRef.current.pause();
      } else if (engineRef.current.state === 'PAUSED') {
        pipelineRef.current.lockoutPauseGesture(75);
        soundEffects.playResume();
        engineRef.current.resume();
      }
    }

    // Play cyber lock chime when stance successfully locks
    if (nextState.isHandLockActive && !lastDebugStateRef.current.isHandLockActive) {
      soundEffects.playHandLock();
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

  const {
    videoRef,
    isReady: isCameraReady,
    cameraActive,
    cameraError,
    startCamera,
  } = useMediaPipeHands(handleLandmarks);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(() => !isMobile);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('skyward_sfx_muted');
      if (saved !== null) {
        const muted = saved === 'true';
        if (muted !== soundEffects.isMuted()) {
          soundEffects.toggleMute();
        }
        return muted;
      }
    } catch {}
    return soundEffects.isMuted();
  });

  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('skyward_bgm_muted');
      if (saved !== null) {
        const muted = saved === 'true';
        if (muted !== backgroundMusic.isMuted()) {
          backgroundMusic.toggleMute();
        }
        return muted;
      }
    } catch {}
    return backgroundMusic.isMuted();
  });

  // Push physical phone tilt angle directly into engine when Gyro Mode is active
  useEffect(() => {
    if (controlMode === 'GYRO' && gyro.isSupported && gyro.isPermissionGranted) {
      engineRef.current.setTiltAngle(gyro.tiltAngleRad);
    }
  }, [controlMode, gyro.isSupported, gyro.isPermissionGranted, gyro.tiltAngleRad]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
    try {
      localStorage.setItem('skyward_sfx_muted', String(nextMuted));
    } catch {}
  }, []);

  const handleToggleMusic = useCallback(() => {
    const nextMusicMuted = backgroundMusic.toggleMute();
    setIsMusicMuted(nextMusicMuted);
    try {
      localStorage.setItem('skyward_bgm_muted', String(nextMusicMuted));
    } catch {}
  }, []);

  // Unlock audio & start background music on first user interaction anywhere
  useEffect(() => {
    const handleFirstInteraction = () => {
      backgroundMusic.start();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Keep background music mode synced with engine state
  useEffect(() => {
    if (engineState === 'PLAYING' || engineState === 'COUNTDOWN') {
      backgroundMusic.setMode('PLAYING');
    } else if (engineState === 'PAUSED') {
      backgroundMusic.setMode('PAUSED');
    } else if (engineState === 'GAME_OVER') {
      backgroundMusic.setMode('GAME_OVER');
    } else {
      backgroundMusic.setMode('MENU');
    }
  }, [engineState]);

  // Monitor lava gap during gameplay to trigger high-adrenaline music urgency
  useEffect(() => {
    const urgencyInterval = setInterval(() => {
      if (engineRef.current.state === 'PLAYING') {
        const gapMeters = engineRef.current.floorGap / 50;
        backgroundMusic.setLavaUrgency(gapMeters < 3.5);
      } else {
        backgroundMusic.setLavaUrgency(false);
      }
    }, 200);

    return () => clearInterval(urgencyInterval);
  }, []);

  const handleCloseCameraModal = useCallback(() => {
    backgroundMusic.start();
    setIsCameraModalOpen(false);
  }, []);

  // Auto-start camera if permission was already granted previously in this browser
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((status) => {
          if (status.state === 'granted' && (!isMobile || controlMode === 'HAND_CAM')) {
            startCamera().then((active) => {
              if (active) {
                setIsCameraModalOpen(false);
              }
            });
          }
        })
        .catch(() => {});
    }
  }, [startCamera, isMobile, controlMode]);

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
    soundEffects.playHandLock();
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

  const handleStartGame = useCallback((skipCountdown: boolean = false) => {
    backgroundMusic.start();
    if (!lastDebugStateRef.current.isCalibrated) {
      pipelineRef.current.resetCalibration();
    }
    pipelineRef.current.lockoutPauseGesture(130);
    engineRef.current.startGame(skipCountdown);
  }, []);

  const handleSkipCalibrationAndStart = useCallback(() => {
    backgroundMusic.start();
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(130);
    soundEffects.playHandLock();
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
    engineRef.current.startGame(true); // Start climbing right away!
  }, []);

  // Keep ref up to date so keyboard listeners can trigger fast start
  useEffect(() => {
    handleSkipCalibrationAndStartRef.current = handleSkipCalibrationAndStart;
  }, [handleSkipCalibrationAndStart]);

  const handleContinueKeyboard = useCallback(() => {
    backgroundMusic.start();
    setIsCameraModalOpen(false);
    handleSkipCalibrationAndStart();
  }, [handleSkipCalibrationAndStart]);

  const handleRestart = useCallback(() => {
    backgroundMusic.start();
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(130);
    engineRef.current.startGame(true);
  }, []);

  const handleTogglePause = useCallback(() => {
    if (engineRef.current.state === 'PAUSED') {
      pipelineRef.current.lockoutPauseGesture(80); // Lockout when resuming
      soundEffects.playResume();
      engineRef.current.resume();
    } else if (engineRef.current.state === 'PLAYING') {
      pipelineRef.current.lockoutPauseGesture(60);
      soundEffects.playPause();
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

  // Priority: 1. Active thumb touch -> 2. Keyboard arrow keys -> 3. Hand tracking -> 4. Physical Gyro -> 5. Neutral (0)
  const activeTiltRad =
    touchDirection !== 0
      ? (touchDirection === -1 ? -0.28 : 0.28)
      : keyboardAngleRad !== null && keyboardAngleRad !== 0
      ? keyboardAngleRad
      : debugState.isHandTrackingActive && (!isMobile || controlMode === 'HAND_CAM')
      ? debugState.finalAngleRad
      : controlMode === 'GYRO' && gyro.isSupported && gyro.isPermissionGranted && gyro.hasReceivedReading
      ? gyro.tiltAngleRad
      : debugState.isHandTrackingActive
      ? debugState.finalAngleRad
      : 0;

  useEffect(() => {
    engineRef.current.setTiltAngle(activeTiltRad);
  }, [activeTiltRad]);

  return (
    <div
      className={`arcade-app ${
        isMobile ? (isPortrait ? 'is-mobile-portrait' : 'is-mobile-landscape') : ''
      } ${engineState === 'PLAYING' || engineState === 'COUNTDOWN' ? 'is-playing' : 'is-menu'}`}
    >
      <div
        className="arcade-viewport"
        style={
          isMobile && isPortrait
            ? undefined
            : scale < 0.99 || scale > 1.01
            ? { transform: `scale(${scale})` }
            : undefined
        }
      >
        {/* Retro Arcade Marquee Header */}
        <header className="arcade-header">
          {isMobile ? (
            <>
              <div className="brand-section">
                <span className="brand-title">SKYWARD ROLL</span>
              </div>
              <button
                className="header-gear-btn"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Settings"
                aria-expanded={isSettingsOpen}
              >
                ⚙️
              </button>
            </>
          ) : (
            <>
              <div className="brand-section">
                <span className="brand-title">
                  <span className="star-badge">★</span>
                  SKYWARD ROLL
                  <span className="star-badge">★</span>
                </span>
                <span className="arcade-badge">ARCADE '83</span>
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
                  className={`header-btn ${
                    cameraActive
                      ? 'header-btn-cam-active'
                      : cameraError
                      ? 'header-btn-cam-error'
                      : 'header-btn-cam-prompt'
                  }`}
                  onClick={() => setIsCameraModalOpen(true)}
                  aria-label={
                    cameraActive
                      ? 'Camera Active'
                      : cameraError
                      ? 'Camera Permission Blocked'
                      : 'Enable Camera'
                  }
                  title={
                    cameraActive
                      ? 'Camera Active & Streaming'
                      : cameraError
                      ? 'Camera Permission Blocked - Click to fix'
                      : 'Click to Enable Camera'
                  }
                >
                  {cameraActive
                    ? '📹 CAM ACTIVE'
                    : cameraError
                    ? '⚠️ CAM BLOCKED'
                    : '📷 ENABLE CAMERA'}
                </button>
                <button
                  className={`header-btn ${
                    isMusicMuted ? 'header-btn-cam-error' : 'header-btn-music'
                  }`}
                  onClick={handleToggleMusic}
                  aria-label={isMusicMuted ? 'Unmute Background Music' : 'Mute Background Music'}
                  title={isMusicMuted ? 'Unmute Background Music' : 'Mute Background Music'}
                >
                  {isMusicMuted ? '🔇 BGM OFF' : '🎵 BGM ON'}
                </button>
                <button
                  className={`header-btn ${
                    isMuted ? 'header-btn-cam-error' : 'header-btn-audio'
                  }`}
                  onClick={handleToggleMute}
                  aria-label={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                  title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                >
                  {isMuted ? '🔇 SFX OFF' : '🔊 SFX ON'}
                </button>
                <button
                  className="header-btn header-btn-manual"
                  onClick={handleOpenHowToPlay}
                  aria-label="How to Play Manual"
                  title="Open How to Play Manual"
                >
                  HOW TO PLAY
                </button>
                <button
                  className="header-btn header-btn-fullscreen"
                  onClick={toggleFullscreen}
                  aria-label="Toggle Fullscreen"
                  title="Toggle Fullscreen"
                >
                  FULLSCREEN
                </button>
              </div>
            </>
          )}
        </header>

        {/* Main Stage: Playfield Canvas (fills full screen on mobile) + Landscape Cockpit on desktop */}
        <main className={`arcade-stage ${engineState === 'PLAYING' || engineState === 'COUNTDOWN' ? 'is-playing' : 'is-menu'}`}>
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
            isMobile={isMobile}
            controlMode={controlMode}
            onSelectControlMode={setControlMode}
            onCalibrateGyro={gyro.calibrateNeutral}
            onTouchTilt={handleTouchTilt}
            gyroAvailable={gyro.isSupported}
            gyroPermissionRequired={gyro.isPermissionRequired && !gyro.isPermissionGranted}
            onRequestGyroPermission={gyro.requestPermission}
            cameraActive={cameraActive}
            cameraError={cameraError}
            onStartCamera={startCamera}
            onOpenCamModal={() => setIsCameraModalOpen(true)}
          />

          {!isMobile ? (
            <LandscapeCockpit
              state={debugState}
              engine={engineRef.current}
              onLandmarks={handleLandmarks}
              onResetCalibration={handleResetCalibration}
              onSkipCalibration={handleSkipCalibration}
              onTogglePause={handleTogglePause}
              isKeyboardSteering={keyboardAngleRad !== null && keyboardAngleRad !== 0}
              videoRef={videoRef}
              cameraActive={cameraActive}
              cameraError={cameraError}
              isCameraReady={isCameraReady}
              onStartCamera={startCamera}
              onOpenCamModal={() => setIsCameraModalOpen(true)}
              isMobile={isMobile}
              controlMode={controlMode}
              gyroAvailable={gyro.isSupported}
              gyroPermissionRequired={gyro.isPermissionRequired && !gyro.isPermissionGranted}
              onRequestGyroPermission={gyro.requestPermission}
              onCalibrateGyro={gyro.calibrateNeutral}
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={
                controlMode === 'HAND_CAM' && cameraActive
                  ? {
                      position: 'fixed',
                      bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                      right: '12px',
                      width: '84px',
                      height: '52px',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                      borderRadius: '8px',
                      border: '2px solid #39ff14',
                      boxShadow: '0 0 12px rgba(57, 255, 20, 0.5)',
                      zIndex: 40,
                      pointerEvents: 'none',
                    }
                  : {
                      position: 'fixed',
                      width: '1px',
                      height: '1px',
                      opacity: 0,
                      pointerEvents: 'none',
                      bottom: 0,
                      right: 0,
                    }
              }
            />
          )}
        </main>
      </div>

      {/* Settings Bottom Sheet (Opened by Header Gear Button) */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isMusicMuted={isMusicMuted}
        onToggleMusic={handleToggleMusic}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        controlMode={controlMode}
        onSelectControlMode={setControlMode}
        cameraActive={cameraActive}
        cameraError={cameraError}
        onToggleCamera={() => {
          if (!cameraActive) {
            startCamera().then((active) => {
              if (!active) setIsCameraModalOpen(true);
            });
          }
        }}
        onCalibrateGyro={gyro.calibrateNeutral}
        onOpenHowToPlay={handleOpenHowToPlay}
        gyroAvailable={gyro.isSupported}
      />

      {/* Retro Arcade Camera Permission Alert Modal */}
      <CameraPermissionModal
        isOpen={isCameraModalOpen}
        isReady={isCameraReady}
        cameraActive={cameraActive}
        cameraError={cameraError}
        onRequestCamera={startCamera}
        onClose={handleCloseCameraModal}
        onContinueKeyboard={handleContinueKeyboard}
      />

      {/* Retro Arcade Intro & How-To-Play Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen && !isCameraModalOpen}
        onClose={handleCloseHowToPlay}
        onStartGame={handleStartGame}
        onQuickPlay={handleSkipCalibrationAndStart}
        debugState={debugState}
        isKeyboardSteering={keyboardAngleRad !== null && keyboardAngleRad !== 0}
      />
    </div>
  );
}

export default App;