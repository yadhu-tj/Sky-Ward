import React from 'react';
import type { TiltDebugState } from '../input/tiltController';

interface TiltDebugViewProps {
  state: TiltDebugState;
  onResetCalibration: () => void;
  onSkipCalibration: () => void;
}

export const TiltDebugView: React.FC<TiltDebugViewProps> = ({
  state,
  onResetCalibration,
  onSkipCalibration,
}: TiltDebugViewProps) => {
  const {
    hasBothHands,
    leftHand,
    rightHand,
    rawAngleDeg,
    calibratedAngleDeg,
    smoothedAngleDeg,
    finalAngleDeg,
    isCalibrating,
    calibrationProgress,
    isCalibrated,
    neutralOffsetDeg,
    isOpenPalm,
    isHandLockActive,
    handLockStatus,
  } = state;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: '12px',
        width: '480px',
        boxSizing: 'border-box',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#38bdf8' }}>Tilt Pipeline & Gestures</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isCalibrated && (
            <button
              onClick={onSkipCalibration}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.8rem',
              }}
            >
              Skip
            </button>
          )}
          <button
            onClick={onResetCalibration}
            style={{
              background: isCalibrating ? '#0284c7' : '#475569',
              color: '#fff',
              border: 'none',
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.8rem',
            }}
          >
            {isCalibrating ? (hasBothHands ? 'Locking...' : 'Waiting Hands') : 'Re-Lock [C]'}
          </button>
        </div>
      </div>

      {/* Hands Detection, Hand Lock & Palm Gesture Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <div>
          <strong>Hands: </strong>
          <span style={{ color: hasBothHands ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
            {hasBothHands ? 'Both Detected' : 'Waiting...'}
          </span>
        </div>
        <div>
          <strong>Hand Lock: </strong>
          <span style={{ color: isHandLockActive ? '#34d399' : '#f59e0b', fontWeight: 'bold' }}>
            {isHandLockActive ? '🔒 LOCKED' : `⏳ ${handLockStatus}`}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#94a3b8' }}>
        <span>Palm Gesture: <strong style={{ color: isOpenPalm ? '#38bdf8' : '#64748b' }}>{isOpenPalm ? '✋ Open' : 'None'}</strong></span>
      </div>

      {hasBothHands && leftHand && rightHand && (
        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
          L_y: {leftHand.y.toFixed(2)} | R_y: {rightHand.y.toFixed(2)} (ΔY: {(rightHand.y - leftHand.y).toFixed(2)})
        </div>
      )}

      {/* Calibration Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.8rem' }}>
          <span style={{ color: isCalibrating && !hasBothHands ? '#f59e0b' : '#f8fafc' }}>
            {isCalibrating
              ? hasBothHands
                ? 'Hold hands neutral (~1s)...'
                : 'Raise both hands in view to calibrate...'
              : isCalibrated
              ? `Calibrated (Offset: ${neutralOffsetDeg.toFixed(1)}°)`
              : 'Calibration needed'}
          </span>
          <span>{Math.round(calibrationProgress * 100)}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${calibrationProgress * 100}%`,
              height: '100%',
              background: isCalibrated ? '#10b981' : '#f59e0b',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      </div>

      {/* Numeric Readouts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          background: '#0f172a',
          padding: '10px',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>1. RAW</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#e2e8f0' }}>
            {rawAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>2. CALIB</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#38bdf8' }}>
            {calibratedAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>3. SMOOTH</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#a855f7' }}>
            {smoothedAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>4. DEADZONE</div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 'bold',
              color: Math.abs(finalAngleDeg) > 0 ? '#4ade80' : '#64748b',
            }}
          >
            {finalAngleDeg.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* Tilt Bar Visualizer */}
      <div
        style={{
          position: 'relative',
          height: '50px',
          background: '#0f172a',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: '#334155' }} />
        <div
          style={{
            width: '80%',
            height: '8px',
            background: 'linear-gradient(90deg, #38bdf8, #10b981)',
            borderRadius: '4px',
            transform: `rotate(${finalAngleDeg}deg)`,
            transition: 'transform 0.05s linear',
            position: 'relative',
            boxShadow: '0 0 8px rgba(56, 189, 248, 0.4)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-11px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#f59e0b',
              boxShadow: '0 0 6px #f59e0b',
            }}
          />
        </div>
      </div>
    </div>
  );
};
