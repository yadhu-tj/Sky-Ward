import { useState, useRef, useCallback, useEffect } from 'react';
import { useMediaPipeHands } from './hooks/useMediaPipeHands';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import { SingleHandController } from './input/singleHandController';
import { HandAutoStart } from './input/handAutoStart';
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
  const [engine] = useState(() => new GameEngine());
  const engineRef = useRef(engine);
  const singleHandRef = useRef(new SingleHandController());
  const autoStartRef = useRef(new HandAutoStart());
  const liveHandReadyRef = useRef(false);
  const lastHandFrameRef = useRef(-Infinity);
  const uiBlockedRef = useRef(false);
  const [trackingLostPause, setTrackingLostPause] = useState(false);
  const [debugState, setDebugState] = useState<TiltDebugState>(INITIAL_DEBUG_STATE);
  const [keyboardAngleRad, setKeyboardAngleRad] = useState<number | null>(null);
  const [engineState, setEngineState] = useState(engineRef.current.state);
  const [scale, setScale] = useState(1);

  // Mobile device detection and orientation (strictly matches @media max-width: 600px / landscape phone)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    return w <= 600 || (h <= 500 && w > h && window.matchMedia('(pointer: coarse)').matches);
  });

  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const gyro = useDeviceOrientation();

  // Camera motion is the primary experience; touch and phone tilt remain fallbacks.
  const [controlMode, setControlMode] = useState<ControlMode>('HAND_CAM');

  const controlModeRef = useRef(controlMode);
  controlModeRef.current = controlMode;
  const touchDirectionRef = useRef<-1 | 0 | 1>(0);

  const [touchDirection, setTouchDirection] = useState<-1 | 0 | 1>(0);

  const handleTouchTilt = useCallback((dir: -1 | 0 | 1) => {
    touchDirectionRef.current = dir;
    setTouchDirection(dir);
  }, []);

  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState<boolean>(false);

  const handleCloseHowToPlay = useCallback(() => {
    setIsHowToPlayOpen(false);
    try {
      localStorage.setItem('skyward_intro_seen', 'true');
    } catch {}
  }, []);

  const handleOpenHowToPlay = useCallback(() => {
    if (engineRef.current.state === 'PLAYING') engineRef.current.pause();
    setIsHowToPlayOpen(true);
  }, []);

  // Responsive scale and orientation tracking
  useEffect(() => {
    const updateDimensions = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mobile = w <= 600 || (h <= 500 && w > h && window.matchMedia('(pointer: coarse)').matches);
      const portrait = h > w;
      setIsMobile(mobile);
      setIsPortrait(portrait);

      if (mobile) {
        // Mobile layout uses responsive 100dvh flex layout with zero transform distortion
        setScale(1);
        return;
      }

      const targetW = 1260;
      const targetH = 722;
      const padX = 24;
      const padY = 20;
      const availableW = w - padX;
      const availableH = h - padY;
      const scaleW = availableW / targetW;
      const scaleH = availableH / targetH;
      // Scale gracefully down on compact viewports or up to 1.15 on 4K
      const computed = Math.min(Math.max(0.1, Math.min(scaleW, scaleH)), 1.15);
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
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (uiBlockedRef.current || target?.isContentEditable || target?.closest('input, textarea, select')) return;
      if ((e.code === 'Space' || e.key === 'Enter') && target?.closest('button, [role="button"]')) return;
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'a' ||
        e.key === 'A' ||
        e.key === 'd' ||
        e.key === 'D'
      ) {
        e.preventDefault();
        pressedKeysRef.current.add(e.code || e.key.toLowerCase());
        syncKeyboardAngle();

        // If player presses arrow/steering keys on start screen, auto-start immediately!
        if (engineRef.current.state === 'CALIBRATING' || engineRef.current.state === 'READY') {
          handleSkipCalibrationAndStartRef.current?.();
        }
      } else if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (e.repeat) return;
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
      } else if (e.key.toLowerCase() === 'r') {
        if (e.repeat) return;
        handleSkipCalibrationAndStartRef.current?.();
      } else if (e.key.toLowerCase() === 'c') {
        // Quick Re-Lock Hand Anchor posture mid-game without pausing!
        pipelineRef.current.resetCalibration();
        singleHandRef.current.resetCalibration();
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
        pressedKeysRef.current.delete(e.code || e.key.toLowerCase());
        syncKeyboardAngle();
      }
    };

    const clearHeldInput = () => {
      pressedKeysRef.current.clear();
      keyboardAngleRadRef.current = null;
      setKeyboardAngleRad(null);
      touchDirectionRef.current = 0;
      setTouchDirection(0);
      engineRef.current.setTiltAngle(0);
      engineRef.current.pause();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      clearHeldInput();
      if (engineRef.current.state === 'COUNTDOWN') { engineRef.current.countdownTimer = 0; engineRef.current.changeState('READY'); }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearHeldInput);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearHeldInput);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const lastDebugTimeRef = useRef(0);
  const lastDebugStateRef = useRef<TiltDebugState>(debugState);

  const handleLandmarks = useCallback((landmarks: HandLandmarks, isOpenPalm: boolean) => {
    if (controlModeRef.current !== 'HAND_CAM') return;
    const video = videoRef.current;
    const aspect = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const nextState = isMobileRef.current
      ? singleHandRef.current.process(landmarks, performance.now(), aspect)
      : pipelineRef.current.process(landmarks, isOpenPalm);

    liveHandReadyRef.current = nextState.isCalibrated && nextState.isHandTrackingActive &&
      (isMobileRef.current ? !!(landmarks.left || landmarks.right) : !!(landmarks.left && landmarks.right));
    lastHandFrameRef.current = performance.now();

    // Sync tilt directly to engine at full 60fps with zero React overhead
    if (!keyboardAngleRadRef.current && touchDirectionRef.current === 0) {
      engineRef.current.setTiltAngle(nextState.finalAngleRad);
    }

    // Two-way Open Palm gesture: pauses when PLAYING and resumes when PAUSED!
    if (!isMobileRef.current && nextState.palmPauseTriggered) {
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
    bindVideo,
    isReady: isCameraReady,
    cameraActive,
    cameraError,
    startCamera,
    stopCamera,
  } = useMediaPipeHands(handleLandmarks, isMobile);

  useEffect(() => {
    if (isMobile && controlMode === 'HAND_CAM') {
      singleHandRef.current.resetCalibration();
      lastDebugStateRef.current = INITIAL_DEBUG_STATE;
      setDebugState(INITIAL_DEBUG_STATE);
      if (engineRef.current.state === 'PLAYING') {
        setTrackingLostPause(true);
        engineRef.current.pause();
      }
    }
  }, [isMobile, controlMode]);

  useEffect(() => {
    if (controlMode !== 'HAND_CAM' && cameraActive) stopCamera();
  }, [controlMode, cameraActive, stopCamera]);

  useEffect(() => {
    if (controlMode === 'HAND_CAM' && !cameraActive) engineRef.current.pause();
  }, [controlMode, cameraActive]);

  // Also catches stalled camera inference, where no further landmark frames arrive.
  useEffect(() => {
    if (!isMobile || controlMode !== 'HAND_CAM') return;
    const id = window.setInterval(() => {
      if (engineRef.current.state !== 'PLAYING') return;
      const now = performance.now();
      if (singleHandRef.current.trackingAge(now) > 150) {
        engineRef.current.setTiltAngle(singleHandRef.current.heldAngleRad(now));
      }
      if (singleHandRef.current.shouldPause(now)) {
        const lostState = { ...lastDebugStateRef.current, isHandTrackingActive: false, finalAngleDeg: 0, finalAngleRad: 0 };
        lastDebugStateRef.current = lostState;
        setDebugState(lostState);
        setTrackingLostPause(true);
        engineRef.current.pause();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [isMobile, controlMode]);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  uiBlockedRef.current = isSettingsOpen || isHowToPlayOpen || isCameraModalOpen;
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleOpenSettings = useCallback(() => {
    engineRef.current.pause();
    setIsSettingsOpen(true);
  }, []);

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
          if (status.state === 'granted' && controlMode === 'HAND_CAM') {
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
    singleHandRef.current.resetCalibration();
    liveHandReadyRef.current = false;
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

  useEffect(() => {
    if (!isMobile || controlMode !== 'HAND_CAM') return;
    const onRotate = () => {
      handleResetCalibration();
      if (engineRef.current.state === 'PLAYING') {
        setTrackingLostPause(true);
        engineRef.current.pause();
      }
    };
    window.addEventListener('orientationchange', onRotate);
    return () => window.removeEventListener('orientationchange', onRotate);
  }, [isMobile, controlMode, handleResetCalibration]);

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
    setTrackingLostPause(false);
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
    setControlMode(isMobileRef.current ? 'TOUCH' : 'KEYBOARD');
  }, []);

  const handleRestart = useCallback(() => {
    backgroundMusic.start();
    pipelineRef.current.skipCalibration();
    pipelineRef.current.lockoutPauseGesture(130);
    if (controlModeRef.current === 'HAND_CAM') {
      engineRef.current.changeState('READY');
    } else {
      engineRef.current.startGame(true);
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    if (engineRef.current.state === 'PAUSED') {
      if (isMobileRef.current && controlModeRef.current === 'HAND_CAM' &&
          (!lastDebugStateRef.current.isHandTrackingActive || !lastDebugStateRef.current.isCalibrated ||
            singleHandRef.current.trackingAge(performance.now()) > 300)) return;
      setTrackingLostPause(false);
      pipelineRef.current.lockoutPauseGesture(80); // Lockout when resuming
      soundEffects.playResume();
      engineRef.current.resume();
    } else if (engineRef.current.state === 'PLAYING') {
      pipelineRef.current.lockoutPauseGesture(60);
      soundEffects.playPause();
      engineRef.current.pause();
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      const ready = controlMode === 'HAND_CAM' && cameraActive && liveHandReadyRef.current &&
        performance.now() - lastHandFrameRef.current < 400;
      const blocked = isSettingsOpen || isHowToPlayOpen || isCameraModalOpen || document.visibilityState !== 'visible' || !document.hasFocus();
      if (autoStartRef.current.update(engineRef.current, ready, blocked) === 'started') {
        setTrackingLostPause(false);
        pipelineRef.current.lockoutPauseGesture(130);
        backgroundMusic.start();
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [controlMode, cameraActive, isSettingsOpen, isHowToPlayOpen, isCameraModalOpen]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Priority: 1. Active thumb touch -> 2. Keyboard arrow keys -> 3. Hand tracking -> 4. Physical Gyro -> 5. Neutral (0)
  const activeTiltRad =
    touchDirection !== 0
      ? (touchDirection === -1 ? -0.28 : 0.28)
      : keyboardAngleRad !== null && keyboardAngleRad !== 0
      ? keyboardAngleRad
      : cameraActive && (debugState.isHandTrackingActive || (isMobile && debugState.isCalibrated)) && controlMode === 'HAND_CAM'
      ? debugState.finalAngleRad
      : controlMode === 'GYRO' && gyro.isSupported && gyro.isPermissionGranted && gyro.hasReceivedReading
      ? gyro.tiltAngleRad
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
          <div className="brand-section">
            <span className="brand-title"><span className="star-badge">★</span> SKYWARD ROLL <span className="star-badge">★</span></span>
            {!isMobile && <span className="brand-pill">ARCADE ’83</span>}
          </div>
          {!isMobile && <div className="cabinet-status"><span />{engineState === 'PLAYING' ? '1P PLAYING' : engineState === 'PAUSED' ? 'PAUSED' : engineState === 'GAME_OVER' ? 'GAME OVER' : engineState === 'COUNTDOWN' ? 'GET READY' : '1P READY'}</div>}
          <nav className="header-actions" aria-label="Game tools">
            <button className="header-btn utility-btn" onClick={handleOpenHowToPlay}>How to Play</button>
            <button className="header-btn utility-btn" onClick={handleOpenSettings} aria-expanded={isSettingsOpen}>Settings</button>
            {!isMobile && <button className="header-btn utility-btn" onClick={toggleFullscreen}>Fullscreen</button>}
          </nav>
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
            handTrackingReady={isCameraReady}
            cameraVideoRef={bindVideo}
            trackingLostPause={trackingLostPause}
            handCalibrationProgress={debugState.calibrationProgress}
            onResetHandCalibration={handleResetCalibration}
            onPrepareGyro={gyro.prepareForPlay}
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
          ) : null}
        </main>
      </div>

      {/* Settings Bottom Sheet (Opened by Header Gear Button) */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        isMusicMuted={isMusicMuted}
        onToggleMusic={handleToggleMusic}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        controlMode={controlMode}
        onSelectControlMode={setControlMode}
        cameraActive={cameraActive}
        cameraError={cameraError}
        onToggleCamera={() => {
          if (cameraActive) {
            stopCamera();
          } else {
            startCamera().then((active) => {
              if (!active) setIsCameraModalOpen(true);
            });
          }
        }}
        onCalibrateGyro={gyro.calibrateNeutral}
        onOpenHowToPlay={handleOpenHowToPlay}
        gyroAvailable={gyro.isSupported}
        isMobile={isMobile}
        onPrepareGyro={gyro.prepareForPlay}
      />

      {/* Retro Arcade Camera Permission Alert Modal */}
      <CameraPermissionModal
        isOpen={isCameraModalOpen}
        isMobile={isMobile}
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
        isMobile={isMobile}
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