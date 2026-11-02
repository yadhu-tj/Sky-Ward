import React, { useState, useEffect } from 'react';

interface CameraPermissionModalProps {
  isOpen: boolean;
  isReady: boolean;
  cameraActive: boolean;
  cameraError: string | null;
  onRequestCamera: () => Promise<boolean>;
  onClose: () => void;
  onContinueKeyboard: () => void;
}

export const CameraPermissionModal: React.FC<CameraPermissionModalProps> = React.memo(
  function CameraPermissionModal({
    isOpen,
    isReady,
    cameraActive,
    cameraError,
    onRequestCamera,
    onClose,
    onContinueKeyboard,
  }) {
    const [isRequesting, setIsRequesting] = useState(false);
    const [justGranted, setJustGranted] = useState(false);

    // When camera turns active, show quick success confirmation and close
    useEffect(() => {
      if (cameraActive) {
        setJustGranted(true);
        const timer = setTimeout(() => {
          setJustGranted(false);
          onClose();
        }, 900);
        return () => clearTimeout(timer);
      }
    }, [cameraActive, onClose]);

    if (!isOpen) return null;

    const handleGrantClick = async () => {
      setIsRequesting(true);
      try {
        const success = await onRequestCamera();
        if (success) {
          setJustGranted(true);
        }
      } finally {
        setIsRequesting(false);
      }
    };

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 1, 14, 0.90)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 150,
          padding: '16px',
        }}
      >
        <div
          className="crt-overlay"
          style={{
            width: '640px',
            maxWidth: '95vw',
            background: 'linear-gradient(180deg, #130628 0%, #080214 100%)',
            border: `3px solid ${cameraError ? '#ff007f' : cameraActive || justGranted ? '#39ff14' : '#7c3aed'}`,
            borderRadius: '20px',
            boxShadow: cameraError
              ? '0 0 40px rgba(255, 0, 127, 0.5), inset 0 0 20px rgba(0, 0, 0, 0.8)'
              : cameraActive || justGranted
              ? '0 0 45px rgba(57, 255, 20, 0.5), inset 0 0 20px rgba(0, 0, 0, 0.8)'
              : '0 0 35px rgba(124, 58, 237, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: '#ffffff',
            position: 'relative',
            transition: 'border 0.3s ease, box-shadow 0.3s ease',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(10, 3, 22, 0.95)',
              borderBottom: '2px solid #3b176d',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.72rem',
                  color: cameraError ? '#ff007f' : '#ffe600',
                  letterSpacing: '1px',
                  textShadow: cameraError
                    ? '0 0 8px rgba(255, 0, 127, 0.7)'
                    : '0 0 8px rgba(255, 230, 0, 0.6)',
                }}
              >
                ★ CAMERA ACCESS SETUP ★
              </span>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.45rem',
                  color: !isReady ? '#ffe600' : '#00f3ff',
                  background: '#28114a',
                  padding: '3px 6px',
                  borderRadius: '4px',
                  border: '1px solid #4c1d95',
                }}
              >
                {!isReady ? '⌛ MODEL LOADING...' : 'GESTURE CONTROL'}
              </span>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                lineHeight: 1,
              }}
              title="Close and continue"
            >
              ✕
            </button>
          </div>

          {/* Modal Body */}
          <div
            style={{
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '18px',
            }}
          >
            {/* Visual Icon / Scanner animation */}
            <div
              style={{
                position: 'relative',
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #250f4a 0%, #0d041c 100%)',
                border: `2px dashed ${cameraError ? '#ff007f' : cameraActive || justGranted ? '#39ff14' : '#00f3ff'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: cameraError
                  ? '0 0 20px rgba(255, 0, 127, 0.4)'
                  : cameraActive || justGranted
                  ? '0 0 25px rgba(57, 255, 20, 0.5)'
                  : '0 0 20px rgba(0, 243, 255, 0.3)',
              }}
            >
              <span style={{ fontSize: '2.4rem' }}>
                {cameraActive || justGranted ? '✅' : cameraError ? '📷' : '👐'}
              </span>
            </div>

            {/* Title & Status Message */}
            {justGranted || cameraActive ? (
              <div>
                <h3
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.85rem',
                    color: '#39ff14',
                    margin: '0 0 8px 0',
                    textShadow: '0 0 10px rgba(57, 255, 20, 0.8)',
                  }}
                >
                  CAMERA PERMISSION GRANTED!
                </h3>
                <p style={{ fontSize: '0.80rem', color: '#a7f3d0', margin: 0 }}>
                  Sensor calibrated and active. Launching arcade cockpit...
                </p>
              </div>
            ) : cameraError ? (
              <div>
                <h3
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.80rem',
                    color: '#ff007f',
                    margin: '0 0 8px 0',
                    textShadow: '0 0 8px rgba(255, 0, 127, 0.8)',
                  }}
                >
                  CAMERA ACCESS BLOCKED
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#fecdd3', margin: 0, lineHeight: 1.4 }}>
                  Your browser prevented camera access ({cameraError}).
                </p>
              </div>
            ) : isRequesting ? (
              <div>
                <h3
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.80rem',
                    color: '#ffe600',
                    margin: '0 0 8px 0',
                    textShadow: '0 0 8px rgba(255, 230, 0, 0.8)',
                  }}
                >
                  ⬆ CHECK YOUR BROWSER PROMPT ⬆
                </h3>
                <p style={{ fontSize: '0.80rem', color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>
                  Please click <strong>"Allow"</strong> in the browser prompt near the top address bar.
                </p>
              </div>
            ) : (
              <div>
                <h3
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.85rem',
                    color: '#00f3ff',
                    margin: '0 0 8px 0',
                    textShadow: '0 0 10px rgba(0, 243, 255, 0.7)',
                  }}
                >
                  PERMISSION NEEDED TO PLAY WITH GESTURES
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5, maxWidth: '520px' }}>
                  Skyward Roll uses your webcam for dual-hand motion steering and palm gestures.
                  Your video is processed <strong>100% locally in your browser</strong> and is never recorded or saved.
                </p>
              </div>
            )}

            {/* Instruction Details for Blocked State */}
            {cameraError && !justGranted && (
              <div
                style={{
                  background: '#070210',
                  border: '1px solid #ff007f',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  textAlign: 'left',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.52rem',
                    color: '#ffe600',
                    marginBottom: '8px',
                  }}
                >
                  HOW TO UNBLOCK CAMERA:
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: '18px',
                    fontSize: '0.74rem',
                    color: '#cbd5e1',
                    lineHeight: 1.6,
                  }}
                >
                  <li>
                    Look at the <strong>camera 📷 or lock 🔒 icon</strong> on the left or right of your browser's address bar.
                  </li>
                  <li>
                    Click it and switch Camera to <strong>"Allow"</strong>.
                  </li>
                  <li>
                    Click the <strong>"RETRY CAMERA ACCESS"</strong> button below.
                  </li>
                </ol>
              </div>
            )}

            {/* Controls / Hand Gesture preview cue */}
            {!cameraError && !justGranted && !isRequesting && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '16px',
                  background: 'rgba(7, 2, 16, 0.7)',
                  border: '1px solid #3b176d',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🫲 🫱</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.48rem', color: '#ffe600' }}>
                      STEER BALL
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      Tilt hands left/right
                    </div>
                  </div>
                </div>

                <div style={{ width: '1px', background: '#3b176d' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>✋</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.48rem', color: '#ff007f' }}>
                      PAUSE / RESUME
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      Show open palm
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%',
                marginTop: '4px',
              }}
            >
              {!justGranted && (
                <button
                  onClick={handleGrantClick}
                  disabled={isRequesting}
                  style={{
                    background: isRequesting
                      ? 'linear-gradient(180deg, #d97706 0%, #b45309 100%)'
                      : cameraError
                      ? 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)'
                      : 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.68rem',
                    letterSpacing: '1px',
                    cursor: isRequesting ? 'wait' : 'pointer',
                    boxShadow: isRequesting
                      ? '0 3px 0 #78350f'
                      : cameraError
                      ? '0 4px 0 #9d174d, 0 0 16px rgba(236, 72, 153, 0.4)'
                      : '0 4px 0 #065f46, 0 0 16px rgba(16, 185, 129, 0.5)',
                    transition: 'all 0.1s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                  }}
                >
                  <span>
                    {isRequesting
                      ? '⏳ REQUESTING PERMISSION...'
                      : cameraError
                      ? '🔄 RETRY CAMERA ACCESS'
                      : '⚡ GRANT CAMERA PERMISSION & PLAY ⚡'}
                  </span>
                </button>
              )}

              <button
                onClick={onContinueKeyboard}
                style={{
                  background: 'transparent',
                  border: '1px solid #4c1d95',
                  color: '#94a3b8',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.52rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.borderColor = '#a855f7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                  e.currentTarget.style.borderColor = '#4c1d95';
                }}
              >
                ⌨️ PLAY WITH ARROW KEYS / MOUSE INSTEAD
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
