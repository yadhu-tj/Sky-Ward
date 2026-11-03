import React, { useEffect, useRef, useState } from 'react';
import type { ControlMode } from './LandscapeCockpit';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isMusicMuted: boolean;
  onToggleMusic: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  controlMode: ControlMode;
  onSelectControlMode: (mode: ControlMode) => void;
  cameraActive: boolean;
  cameraError: string | null;
  onToggleCamera: () => void;
  onCalibrateGyro: () => void;
  onOpenHowToPlay: () => void;
  gyroAvailable?: boolean;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  isOpen,
  onClose,
  isMusicMuted,
  onToggleMusic,
  isMuted,
  onToggleMute,
  controlMode,
  onSelectControlMode,
  cameraActive,
  cameraError,
  onToggleCamera,
  onCalibrateGyro,
  onOpenHowToPlay,
  gyroAvailable = true,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [zeroedToast, setZeroedToast] = useState(false);

  // Detect iOS Safari where requestFullscreen is not supported on documentElement
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Focus management and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const prevActiveElement = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      prevActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  const handleZeroClick = () => {
    onCalibrateGyro();
    setZeroedToast(true);
    setTimeout(() => setZeroedToast(false), 1500);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Settings"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Sheet Content */}
      <div
        ref={sheetRef}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '82dvh',
          background: 'linear-gradient(180deg, #1b0a36 0%, #0c041c 100%)',
          borderTop: '2px solid #5b21b6',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.75), 0 -2px 10px rgba(168, 85, 247, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '12px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px',
          color: '#ffffff',
          animation: 'slideUpSheet 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            alignSelf: 'center',
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: '#6d28d9',
            marginBottom: '10px',
          }}
        />

        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '10px',
            borderBottom: '1px solid #3b176d',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚙️</span>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.8rem',
                color: '#ffe600',
                letterSpacing: '1px',
              }}
            >
              SETTINGS
            </span>
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close Settings"
            style={{
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '8px',
              background: '#28114a',
              border: '1px solid #5b21b6',
              color: '#ffffff',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Setting Rows (each row at least 52px tall, label left, control right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Row 1: Music (BGM) */}
          <div className="settings-row">
            <span className="settings-label">🎵 MUSIC (BGM)</span>
            <button
              onClick={onToggleMusic}
              role="switch"
              aria-checked={!isMusicMuted}
              aria-label="Toggle background music"
              className={`toggle-switch ${!isMusicMuted ? 'active' : ''}`}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          {/* Row 2: Sound Effects (SFX) */}
          <div className="settings-row">
            <span className="settings-label">🔊 SOUND EFFECTS</span>
            <button
              onClick={onToggleMute}
              role="switch"
              aria-checked={!isMuted}
              aria-label="Toggle sound effects"
              className={`toggle-switch ${!isMuted ? 'active' : ''}`}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          {/* Row 3: Control Mode Segmented Row */}
          <div className="settings-row" style={{ height: 'auto', padding: '10px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className="settings-label">🎮 CONTROL MODE</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {controlMode === 'GYRO'
                  ? gyroAvailable
                    ? 'Tilt phone to roll ball'
                    : 'Gyro sensor not detected'
                  : controlMode === 'TOUCH'
                  ? 'Tap left/right screen sides'
                  : 'Hold hands in front camera'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: '#0a0318',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid #3b176d',
              }}
            >
              <button
                onClick={() => onSelectControlMode('GYRO')}
                className={`mode-pill ${controlMode === 'GYRO' ? 'active' : ''}`}
              >
                📱 GYRO
              </button>
              <button
                onClick={() => onSelectControlMode('TOUCH')}
                className={`mode-pill ${controlMode === 'TOUCH' ? 'active' : ''}`}
              >
                👆 TOUCH
              </button>
              <button
                onClick={() => onSelectControlMode('HAND_CAM')}
                className={`mode-pill ${controlMode === 'HAND_CAM' ? 'active' : ''}`}
              >
                📷 CAM
              </button>
            </div>
          </div>

          {/* Row 4: Camera row (Only when in Cam mode) */}
          {controlMode === 'HAND_CAM' && (
            <div className="settings-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-label">📷 CAMERA STATUS</span>
                {cameraError && (
                  <span style={{ fontSize: '11px', color: '#ff007f' }}>Camera blocked</span>
                )}
              </div>
              <button
                onClick={onToggleCamera}
                className="settings-action-btn"
                style={{
                  background: cameraActive
                    ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)'
                    : cameraError
                    ? 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)'
                    : 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                }}
              >
                {cameraActive ? 'CAMERA ON' : cameraError ? 'RETRY ACCESS' : 'ENABLE CAM'}
              </button>
            </div>
          )}

          {/* Row 5: Zero Level (Re-Center Tilt) */}
          <div className="settings-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="settings-label">⚖️ ZERO LEVEL</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {zeroedToast ? '✓ Level calibrated!' : 'Re-center neutral resting angle'}
              </span>
            </div>
            <button onClick={handleZeroClick} className="settings-action-btn">
              {zeroedToast ? 'ZEROED!' : 'CALIBRATE'}
            </button>
          </div>

          {/* Row 6: Fullscreen (Hidden on iOS Safari) */}
          {!isIOS && (
            <div className="settings-row">
              <span className="settings-label">⛶ FULLSCREEN</span>
              <button onClick={toggleFullscreen} className="settings-action-btn">
                TOGGLE
              </button>
            </div>
          )}

          {/* Row 7: How to Play */}
          <div className="settings-row">
            <span className="settings-label">📖 HOW TO PLAY</span>
            <button
              onClick={() => {
                onClose();
                onOpenHowToPlay();
              }}
              className="settings-action-btn"
              style={{ background: 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)' }}
            >
              VIEW MANUAL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
