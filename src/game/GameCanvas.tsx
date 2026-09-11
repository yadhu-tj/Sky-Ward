import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import type { GameState } from './GameEngine';

interface GameCanvasProps {
  engine: GameEngine;
  tiltAngleRad: number;
  isCalibrated: boolean;
  onStartGame: () => void;
  onSkipCalibrationAndStart: () => void;
  onRestart: () => void;
  onTogglePause: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  tiltAngleRad,
  isCalibrated,
  onStartGame,
  onSkipCalibrationAndStart,
  onRestart,
  onTogglePause,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(engine.state);
  const [stats, setStats] = useState(engine.stats);
  const [floorGapMeters, setFloorGapMeters] = useState(Math.floor(engine.floorGap / 50));

  // Sync tilt angle to engine
  useEffect(() => {
    engine.setTiltAngle(tiltAngleRad);
  }, [engine, tiltAngleRad]);

  // Main 60FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Update engine physics & logic (handles pause internally)
      engine.update(dt);
      setGameState(engine.state);
      setStats({ ...engine.stats });
      setFloorGapMeters(Math.floor(engine.floorGap / 50));

      const width = canvas.width;
      const height = canvas.height;

      // Clear background
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, width, height);

      // Draw background grid lines scrolling with altitude
      const scrollOffset = engine.altitudePx % 40;
      ctx.strokeStyle = '#151d2f';
      ctx.lineWidth = 1;
      for (let y = scrollOffset; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Playfield constants
      const barCenterX = width / 2;
      const barCenterY = height * 0.65;
      const barWidth = engine.bar.width;
      const barHalfWidth = barWidth / 2;
      const barHeight = engine.bar.height;
      const playfieldLeft = barCenterX - barHalfWidth;

      // Side guide rails with metallic gradient
      const railGrad = ctx.createLinearGradient(0, 0, 10, 0);
      railGrad.addColorStop(0, '#1e293b');
      railGrad.addColorStop(0.5, '#475569');
      railGrad.addColorStop(1, '#1e293b');

      ctx.fillStyle = railGrad;
      ctx.fillRect(playfieldLeft - 12, 0, 12, height);
      ctx.fillRect(playfieldLeft + barWidth, 0, 12, height);

      // Draw Obstacle Rows (Holes & Portals) on playfield
      for (const row of engine.rows) {
        // screen Y of this row relative to camera centered on bar
        const rowScreenY = barCenterY - (row.worldY - engine.altitudePx);

        // Only draw if within visible canvas
        if (rowScreenY >= -60 && rowScreenY <= height + 60) {
          if (row.isSafeZone) {
            // Subtle safe-zone green marker line
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playfieldLeft, rowScreenY);
            ctx.lineTo(playfieldLeft + barWidth, rowScreenY);
            ctx.stroke();
            continue;
          }

          // Row hazard guide dashed line
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 8]);
          ctx.beginPath();
          ctx.moveTo(playfieldLeft, rowScreenY);
          ctx.lineTo(playfieldLeft + barWidth, rowScreenY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw holes
          for (const slot of row.slots) {
            const holeScreenX = playfieldLeft + (slot.startX + slot.endX) / 2;
            const holeRadiusX = (slot.endX - slot.startX) / 2;
            const holeRadiusY = 15;

            ctx.beginPath();
            ctx.ellipse(holeScreenX, rowScreenY, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);

            if (slot.isPortal) {
              // Glowing Portal Shortcut
              ctx.fillStyle = '#06b6d4';
              ctx.shadowColor = '#22d3ee';
              ctx.shadowBlur = 16;
              ctx.fill();
              ctx.shadowBlur = 0;

              // Portal animated ring
              ctx.strokeStyle = '#fef08a';
              ctx.lineWidth = 3;
              ctx.stroke();

              // Portal label
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('WARP +7m', holeScreenX, rowScreenY - 18);
            } else {
              // Deep Deadly Hole with depth shadow
              ctx.fillStyle = '#020617';
              ctx.fill();

              // Hole rim hazard color
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2;
              ctx.stroke();

              // Inner deep shadow
              ctx.beginPath();
              ctx.arc(holeScreenX, rowScreenY, 6, 0, Math.PI * 2);
              ctx.fillStyle = '#7f1d1d';
              ctx.fill();
            }
          }
        }
      }

      // Draw Rising Hazard Floor (Lava / hazard wave)
      const floorScreenY = barCenterY + (engine.altitudePx - engine.floorAltitudePx);
      if (floorScreenY < height + 200) {
        const hazardGrad = ctx.createLinearGradient(0, floorScreenY, 0, height);
        hazardGrad.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
        hazardGrad.addColorStop(0.25, 'rgba(185, 28, 28, 0.95)');
        hazardGrad.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = hazardGrad;
        ctx.fillRect(playfieldLeft - 12, floorScreenY, barWidth + 24, height - floorScreenY + 200);

        // Pulsing hazard border
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(playfieldLeft - 12, floorScreenY);
        ctx.lineTo(playfieldLeft + barWidth + 12, floorScreenY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw Tilting Bar
      ctx.save();
      ctx.translate(barCenterX, barCenterY);
      ctx.rotate(engine.bar.angleRad);

      // Metallic Bar Body
      const barGrad = ctx.createLinearGradient(-barHalfWidth, 0, barHalfWidth, 0);
      barGrad.addColorStop(0, '#38bdf8');
      barGrad.addColorStop(0.5, '#f1f5f9');
      barGrad.addColorStop(1, '#38bdf8');

      ctx.fillStyle = barGrad;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fillRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);
      ctx.shadowBlur = 0;

      // Bar Border
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.strokeRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);

      // Draw Ball (in bar local coordinates unless falling)
      let ballDrawX: number;
      let ballDrawY: number;
      let ballRadius = engine.ball.radius;

      if (engine.ball.isFalling) {
        // Falling into hole animation: shrink and sink into hole center
        const progress = engine.ball.fallProgress;
        ballRadius = Math.max(2, engine.ball.radius * (1 - progress * 0.5));
        ballDrawX = engine.ball.x - barHalfWidth;
        ballDrawY = -barHeight / 2 - engine.ball.radius + progress * 24;
      } else {
        ballDrawX = engine.ball.x - barHalfWidth;
        ballDrawY = -barHeight / 2 - engine.ball.radius;
      }

      // Draw Ball Body (metallic sphere with surface rotation)
      ctx.save();
      ctx.translate(ballDrawX, ballDrawY);
      ctx.rotate(engine.ball.rotationRad);

      ctx.beginPath();
      ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = engine.ball.isFalling ? '#ef4444' : '#f59e0b';
      ctx.shadowColor = engine.ball.isFalling ? '#ef4444' : '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Surface rotation marker lines so you can see it physically roll!
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-ballRadius + 2, 0);
      ctx.lineTo(ballRadius - 2, 0);
      ctx.stroke();

      // Ball highlight
      ctx.beginPath();
      ctx.arc(-ballRadius * 0.3, -ballRadius * 0.3, ballRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();

      ctx.restore(); // restore ball rotation

      // Draw Warp Invulnerability Forcefield Shield
      if (engine.shieldTimer > 0) {
        const isBlinking = engine.shieldTimer < 0.6 && Math.floor(time / 100) % 2 === 0;
        if (!isBlinking) {
          ctx.beginPath();
          ctx.arc(ballDrawX, ballDrawY, engine.ball.radius + 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 14;
          ctx.stroke();
          ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore(); // restore bar coordinate space

      // Draw Center Mechanical Pivot
      ctx.beginPath();
      ctx.arc(barCenterX, barCenterY, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Portal Warp Fullscreen Flash Effect
      if (engine.portalWarpAnimation > 0) {
        ctx.fillStyle = `rgba(6, 182, 212, ${engine.portalWarpAnimation * 0.65})`;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PORTAL WARP! +7m', width / 2, height / 2 - 50);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [engine]);

  return (
    <div
      style={{
        position: 'relative',
        width: '600px',
        height: '660px',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        border: '2px solid #334155',
        background: '#070b14',
      }}
    >
      <canvas ref={canvasRef} width={600} height={660} style={{ display: 'block' }} />

      {/* Top HUD */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '16px',
          right: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ALTITUDE</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#38bdf8' }}>
            {stats.altitudeMeters}m
          </div>
        </div>

        {/* Shield Status Badge */}
        {stats.isShieldActive && (
          <div
            style={{
              background: 'rgba(6, 182, 212, 0.25)',
              border: '1px solid #22d3ee',
              padding: '6px 14px',
              borderRadius: '20px',
              color: '#22d3ee',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 0 12px rgba(34, 211, 238, 0.4)',
            }}
          >
            🛡️ SHIELD ({stats.shieldTimer.toFixed(1)}s)
          </div>
        )}

        <div
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>FLOOR DIST</div>
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 'bold',
              color: floorGapMeters < 3 ? '#ef4444' : floorGapMeters < 5 ? '#f59e0b' : '#4ade80',
            }}
          >
            {floorGapMeters}m
          </div>
        </div>

        <div
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>BEST</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#a855f7' }}>
            {stats.bestAltitudeMeters}m
          </div>
        </div>
      </div>

      {/* Start / Ready Overlay */}
      {gameState !== 'PLAYING' && gameState !== 'PAUSED' && gameState !== 'GAME_OVER' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(7, 11, 20, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'sans-serif',
          }}
        >
          <h2 style={{ fontSize: '2.2rem', color: '#38bdf8', margin: 0, letterSpacing: '1px' }}>
            Skyward Roll
          </h2>
          <p style={{ color: '#94a3b8', maxWidth: '420px', lineHeight: 1.5, margin: 0 }}>
            Tilt both hands to steer the ball along the ascending bar. Dodge deadly holes, use portals for shortcuts, and outclimb the rising hazard floor!
          </p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            {isCalibrated ? (
              <button
                onClick={onStartGame}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 30px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                }}
              >
                Start Climb!
              </button>
            ) : (
              <>
                <button
                  onClick={onStartGame}
                  disabled={!isCalibrated}
                  style={{
                    background: '#334155',
                    color: '#64748b',
                    border: 'none',
                    padding: '12px 24px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    borderRadius: '8px',
                    cursor: 'not-allowed',
                  }}
                >
                  Hold hands to calibrate...
                </button>
                <button
                  onClick={onSkipCalibrationAndStart}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px 24px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                  }}
                >
                  Quick Start (Skip)
                </button>
              </>
            )}
          </div>

          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
            Tip: Hold open palm ✋ to camera or press Space / P anytime to pause.
          </div>
        </div>
      )}

      {/* Paused Overlay */}
      {gameState === 'PAUSED' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: '3.5rem' }}>✋</div>
          <h2 style={{ fontSize: '2.4rem', color: '#38bdf8', margin: 0, letterSpacing: '2px' }}>
            PAUSED
          </h2>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '1rem' }}>
            Show open palm to camera or press <kbd style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', color: '#f8fafc' }}>Space</kbd> to resume
          </p>
          <button
            onClick={onTogglePause}
            style={{
              marginTop: '12px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              padding: '10px 28px',
              fontSize: '1rem',
              fontWeight: 'bold',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
            }}
          >
            Resume Game
          </button>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === 'GAME_OVER' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'monospace',
          }}
        >
          <h2 style={{ fontSize: '2.4rem', color: '#ef4444', margin: 0, letterSpacing: '2px' }}>
            GAME OVER
          </h2>
          <div
            style={{
              fontSize: '1.1rem',
              color: '#fca5a5',
              background: 'rgba(239, 68, 68, 0.15)',
              padding: '8px 18px',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            {stats.deathReason === 'HOLE_FALL'
              ? 'Slipped into a hole!'
              : 'Swallowed by the rising hazard!'}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginTop: '12px',
              width: '80%',
            }}
          >
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ALTITUDE</div>
              <div style={{ fontSize: '1.3rem', color: '#38bdf8', fontWeight: 'bold' }}>
                {stats.altitudeMeters}m
              </div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>BEST</div>
              <div style={{ fontSize: '1.3rem', color: '#a855f7', fontWeight: 'bold' }}>
                {stats.bestAltitudeMeters}m
              </div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>WARPS</div>
              <div style={{ fontSize: '1.3rem', color: '#06b6d4', fontWeight: 'bold' }}>
                {stats.portalsUsed}
              </div>
            </div>
          </div>

          <button
            onClick={onRestart}
            style={{
              marginTop: '16px',
              background: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              padding: '12px 32px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)',
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};
