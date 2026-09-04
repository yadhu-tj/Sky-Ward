import React from 'react';
import type { TiltDebugState } from '../input/tiltController';

interface TiltDebugViewProps {
  state: TiltDebugState;
  onResetCalibration: () => void;
}

export const TiltDebugView: React.FC<TiltDebugStateProps> = ({ state, onResetCalibration }: TiltDebugViewProps) => {
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
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#38bdf8' }}>Phase 1: Tilt Pipeline Debugger</h3>
        <button
          onClick={onResetCalibration}
          style={{
            background: '#475569',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Recalibrate
        </button>
      </div>

      {/* Hands Detection Status */}
      <div style={{ display: 'flex', gap: '20px', fontSize: '0.9rem' }}>
        <div>
          <strong>Detection: </strong>
          <span style={{ color: hasBothHands ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
            {hasBothHands ? 'Both Hands Detected' : 'Waiting for Both Hands...'}
          </span>
        </div>
        {hasBothHands && leftHand && rightHand && (
          <div style={{ color: '#94a3b8' }}>
            L_y: {leftHand.y.toFixed(3)} | R_y: {rightHand.y.toFixed(3)} (ΔY: {(rightHand.y - leftHand.y).toFixed(3)})
          </div>
        )}
      </div>

      {/* Calibration Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
          <span>
            {isCalibrating
              ? 'Hold hands neutral to calibrate (~60 frames)...'
              : isCalibrated
              ? `Calibrated (Neutral offset: ${neutralOffsetDeg.toFixed(2)}°)`
              : 'Calibration needed'}
          </span>
          <span>{Math.round(calibrationProgress * 100)}%</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
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
          gap: '8px',
          background: '#0f172a',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>1. RAW</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#e2e8f0' }}>
            {rawAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>2. CALIBRATED</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#38bdf8' }}>
            {calibratedAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>3. SMOOTHED (EMA)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#a855f7' }}>
            {smoothedAngleDeg.toFixed(1)}°
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>4. DEADZONE (FINAL)</div>
          <div
            style={{
              fontSize: '1.1rem',
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
          height: '70px',
          background: '#0f172a',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Center line guide */}
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: '#334155' }} />
        {/* Virtual Bar */}
        <div
          style={{
            width: '80%',
            height: '10px',
            background: 'linear-gradient(90deg, #3b82f6, #10b981)',
            borderRadius: '5px',
            transform: `rotate(${finalAngleDeg}deg)`,
            transition: 'transform 0.05s linear',
            position: 'relative',
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
          }}
        >
          {/* Simulated ball resting on bar */}
          <div
            style={{
              position: 'absolute',
              top: '-14px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 8px #ef4444',
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
        Tip: Lower right hand → bar tips right (+angle). Lower left hand → bar tips left (-angle).
      </div>
    </div>
  );
};
type TiltDebugStateProps = TiltDebugViewProps;
