import { useState, useRef, useCallback } from 'react';
import { Webcam } from './components/Webcam';
import type { HandLandmarks } from './hooks/useMediaPipeHands';
import { TiltPipeline, DEFAULT_TILT_CONFIG } from './input/tiltController';
import type { TiltDebugState } from './input/tiltController';
import { TiltDebugView } from './components/TiltDebugView';
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
};

function App() {
  const pipelineRef = useRef<TiltPipeline>(new TiltPipeline(DEFAULT_TILT_CONFIG));
  const [debugState, setDebugState] = useState<TiltDebugState>(INITIAL_DEBUG_STATE);

  const handleLandmarks = useCallback((landmarks: HandLandmarks) => {
    const nextState = pipelineRef.current.process(landmarks);
    setDebugState(nextState);
  }, []);

  const handleResetCalibration = useCallback(() => {
    pipelineRef.current.resetCalibration();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1.5rem', minHeight: '100vh', background: '#0b0f19', color: '#f8fafc' }}>
      <header style={{ textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '2rem', letterSpacing: '1px' }}>Skyward Roll</h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>Motion-Controlled Arcade Platformer (Phase 1: Tilt Pipeline)</p>
      </header>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
        <Webcam onLandmarks={handleLandmarks} />
        <TiltDebugView state={debugState} onResetCalibration={handleResetCalibration} />
      </div>
    </div>
  );
}

export default App;