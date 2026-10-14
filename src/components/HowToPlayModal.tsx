import React from 'react';
import type { TiltDebugState } from '../input/tiltController';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: () => void;
  onQuickPlay: () => void;
  debugState: TiltDebugState;
  isKeyboardSteering: boolean;
  isPointerSteering: boolean;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = React.memo(function HowToPlayModal({
  isOpen,
  onClose,
  onStartGame,
  onQuickPlay,
  debugState,
  isKeyboardSteering,
  isPointerSteering,
}) {
  if (!isOpen) return null;

  const { isHandTrackingActive, hasBothHands, finalAngleDeg, leftHand, rightHand } = debugState;
  const isNeutral = Math.abs(finalAngleDeg) < 1.0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 1, 14, 0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
    >
      {/* Modal Container with Retro Arcade Cabinet Bezel */}
      <div
        className="crt-overlay"
        style={{
          width: '900px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          background: 'linear-gradient(180deg, #130628 0%, #080214 100%)',
          border: '3px solid #7c3aed',
          borderRadius: '20px',
          boxShadow: '0 0 35px rgba(124, 58, 237, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(10, 3, 22, 0.95)',
            borderBottom: '2px solid #3b176d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.85rem',
                color: '#ffe600',
                letterSpacing: '2px',
                textShadow: '0 0 10px rgba(255, 230, 0, 0.6)',
              }}
            >
              ★ HOW TO PLAY ★
            </span>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.50rem',
                color: '#00f3ff',
                background: '#28114a',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #4c1d95',
              }}
            >
              ARCADE MANUAL '83
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#28114a',
              border: '1px solid #7c3aed',
              color: '#cbd5e1',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.58rem',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ff007f')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#cbd5e1')}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Key Instruction: Calibration Stance Notice */}
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(255, 230, 0, 0.15) 0%, rgba(255, 0, 127, 0.15) 100%)',
              border: '2px solid #ffe600',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              boxShadow: '0 0 16px rgba(255, 230, 0, 0.25)',
            }}
          >
            <div style={{ fontSize: '2.4rem', flexShrink: 0 }}>⚠️</div>
            <div>
              <div
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.68rem',
                  color: '#ffe600',
                  marginBottom: '6px',
                  letterSpacing: '1px',
                  textShadow: '0 0 8px rgba(255, 230, 0, 0.6)',
                }}
              >
                RULE #1: KEEP HANDS STEADY UNTIL METER FILLS!
              </div>
              <div style={{ fontSize: '0.78rem', color: '#f8fafc', lineHeight: 1.5 }}>
                When starting the game or pressing <strong>RE-CENTER</strong>, hold both hands <strong>level and steady</strong> for 1 second while the countdown runs.
                <span style={{ color: '#00f3ff', fontWeight: 'bold' }}> Do not wave or move your hands while the meter calibrates</span>, otherwise your neutral balance will be offset!
              </div>
            </div>
          </div>

          {/* 4 Instruction Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
            }}
          >
            {/* Card 1: Hand Steering */}
            <div
              style={{
                background: 'rgba(17, 7, 36, 0.85)',
                border: '2px solid #3b176d',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>👐</span>
                <span
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.60rem',
                    color: '#00f3ff',
                    letterSpacing: '1px',
                  }}
                >
                  1. TILT HANDS TO ROLL
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                Imagine holding a physical metal bar:
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Raise <strong>Right Hand</strong> ➔ Bar dips left (Rolls Left ◀)</li>
                  <li>Raise <strong>Left Hand</strong> ➔ Bar dips right (Rolls Right ▶)</li>
                  <li><strong>Hand Lock:</strong> Hold hands steady to lock stance. Press <kbd>C</kbd> to quick re-lock anytime!</li>
                </ul>
              </div>
            </div>

            {/* Card 2: Mouse & Keyboard Alternatives */}
            <div
              style={{
                background: 'rgba(17, 7, 36, 0.85)',
                border: '2px solid #3b176d',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🖱️</span>
                <span
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.60rem',
                    color: '#39ff14',
                    letterSpacing: '1px',
                  }}
                >
                  2. MOUSE OR ARROW KEYS
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                Hands tired or camera unavailable?
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li><strong>Mouse:</strong> Move cursor left/right anywhere across the screen.</li>
                  <li><strong>Keyboard:</strong> Tap or hold <kbd>←</kbd> and <kbd>→</kbd> arrow keys.</li>
                  <li>Webcam hands automatically take over whenever you raise them!</li>
                </ul>
              </div>
            </div>

            {/* Card 3: Hazards & Rising Lava */}
            <div
              style={{
                background: 'rgba(17, 7, 36, 0.85)',
                border: '2px solid #3b176d',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>💀</span>
                <span
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.60rem',
                    color: '#ff007f',
                    letterSpacing: '1px',
                  }}
                >
                  3. HAZARDS & LAVA
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                Hazards that plunge the ball into molten lava:
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li><strong>Hazard Pits:</strong> Rolling into black holes drops the ball straight into the molten lava below!</li>
                  <li><strong>Steep Tilts &amp; Bar Edges:</strong> Don't tilt too steeply (&gt;12&deg;) or the ball will slip off the bar into the abyss!</li>
                  <li><strong>Rising Molten Lava:</strong> The lava floor steadily climbs from below. Keep ascending or get engulfed!</li>
                </ul>
              </div>
            </div>

            {/* Card 4: Warps, Stages & Pause */}
            <div
              style={{
                background: 'rgba(17, 7, 36, 0.85)',
                border: '2px solid #3b176d',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>⭐</span>
                <span
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.60rem',
                    color: '#ffe600',
                    letterSpacing: '1px',
                  }}
                >
                  4. WARPS, SHIELDS & PAUSE
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                Master power-ups:
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li><strong>Rainbow Warps:</strong> Jump +7m ahead and get a 3.5s shield!</li>
                  <li><strong>Milestones:</strong> Pass gate archways to promote to higher stages!</li>
                  <li><strong>Pause &amp; Re-Lock:</strong> Show 1 open palm ✋ to pause. Tap <kbd>C</kbd> anytime to quick re-lock anchors!</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Interactive Live Stance Tester */}
          <div
            style={{
              background: '#070210',
              border: '2px solid #3b176d',
              borderRadius: '12px',
              padding: '12px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.55rem',
                  color: '#ffe600',
                }}
              >
                ★ LIVE STANCE TESTER (TRY IT NOW!) ★
              </span>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.48rem',
                  color: isHandTrackingActive
                    ? '#39ff14'
                    : isKeyboardSteering || isPointerSteering
                    ? '#00f3ff'
                    : '#ffaa00',
                }}
              >
                {isHandTrackingActive
                  ? hasBothHands
                    ? '● DUAL HANDS LOCKED'
                    : '● 1 HAND DETECTED'
                  : isKeyboardSteering
                  ? '⌨️ KEYBOARD'
                  : isPointerSteering
                  ? '🖱️ MOUSE'
                  : '👐 HOLD HANDS IN AIR'}
              </span>
            </div>

            {/* Balance Bar Simulator */}
            <div
              style={{
                position: 'relative',
                height: '42px',
                background: '#130628',
                borderRadius: '8px',
                border: '1px solid #4c1d95',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Hand Beacons on Ends */}
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.45rem',
                  color: leftHand ? '#00f3ff' : '#475569',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: leftHand ? '#00f3ff' : '#1e1136',
                    boxShadow: leftHand ? '0 0 8px #00f3ff' : 'none',
                  }}
                />
                L-HAND
              </div>

              {/* Tilting Bar */}
              <div
                style={{
                  width: '60%',
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
                  boxShadow: '0 0 8px rgba(0, 243, 255, 0.4)',
                }}
              >
                {/* Rolling Pinball */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    left: `${50 + Math.max(-42, Math.min(42, (finalAngleDeg / 20) * 42))}%`,
                    transform: 'translateX(-50%)',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #ffe600 50%, #d97706 100%)',
                    boxShadow: '0 0 8px #ffe600',
                  }}
                />
              </div>

              <div
                style={{
                  position: 'absolute',
                  right: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '0.45rem',
                  color: rightHand ? '#ff007f' : '#475569',
                }}
              >
                R-HAND
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: rightHand ? '#ff007f' : '#1e1136',
                    boxShadow: rightHand ? '0 0 8px #ff007f' : 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(10, 3, 22, 0.95)',
            borderTop: '2px solid #3b176d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            Tip: You can re-open this guide anytime using the <strong>❓ HOW TO PLAY</strong> button in the header.
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                onClose();
                onQuickPlay();
              }}
              style={{
                background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '12px 20px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.62rem',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 3px 0 #1e3a8a',
              }}
            >
              QUICK PLAY
            </button>
            <button
              onClick={() => {
                onClose();
                onStartGame();
              }}
              style={{
                background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '12px 28px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.72rem',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 0 #065f46, 0 0 16px rgba(16, 185, 129, 0.6)',
                letterSpacing: '1px',
              }}
            >
              ★ INSERT COIN & PLAY ★
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
