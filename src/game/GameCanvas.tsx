import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import type { GameState } from './GameEngine';

interface GameCanvasProps {
  engine: GameEngine;
  tiltAngleRad: number;
  isCalibrated: boolean;
  onStartGame: () => void;
  onRestart: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  tiltAngleRad,
  isCalibrated,
  onStartGame,
  onRestart,
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
      const dt = Math.min((time - lastTime) / 1000, 0.1); // clamp dt to avoid huge step
      lastTime = time;

      // Update engine physics & logic
      engine.update(dt);
      setGameState(engine.state);
      setStats({ ...engine.stats });
      setFloorGapMeters(Math.floor(engine.floorGap / 50));

      const width = canvas.width;
      const height = canvas.height;

      // Clear background
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, width, height);

      // Draw background grid lines scrolling with altitude
      const scrollOffset = engine.altitudePx % 40;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let y = scrollOffset; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Playfield constants
      const barCenterX = width / 2;
      const barCenterY = height * 0.65; // bar sits in lower-middle third
      const barWidth = engine.bar.width;
      const barHalfWidth = barWidth / 2;
      const barHeight = engine.bar.height;
      const playfieldLeft = barCenterX - barHalfWidth;

      // Side guide rails
      ctx.fillStyle = '#334155';
      ctx.fillRect(playfieldLeft - 10, 0, 10, height);
      ctx.fillRect(playfieldLeft + barWidth, 0, 10, height);

      // Draw Obstacle Rows (Holes & Portals) on playfield
      for (const row of engine.rows) {
        // screen Y of this row relative to camera centered on bar
        const rowScreenY = barCenterY - (row.worldY - engine.altitudePx);

        // Only draw if within visible canvas
        if (rowScreenY >= -50 && rowScreenY <= height + 50) {
          // Row hazard guide line
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
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
            const holeRadius = (slot.endX - slot.startX) / 2;

            ctx.beginPath();
            ctx.ellipse(holeScreenX, rowScreenY, holeRadius, 14, 0, 0, Math.PI * 2);

            if (slot.isPortal) {
              // Glowing Portal
              ctx.fillStyle = '#06b6d4';
              ctx.shadowColor = '#06b6d4';
              ctx.shadowBlur = 15;
              ctx.fill();
              ctx.shadowBlur = 0;

              // Portal ring
              ctx.strokeStyle = '#fef08a';
              ctx.lineWidth = 3;
              ctx.stroke();

              // Portal label
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('WARP', holeScreenX, rowScreenY - 18);
            } else {
              // Deep hole
              ctx.fillStyle = '#020617';
              ctx.fill();
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2;
              ctx.stroke();

              // Inner shadow dot
              ctx.beginPath();
              ctx.arc(holeScreenX, rowScreenY, 6, 0, Math.PI * 2);
              ctx.fillStyle = '#7f1d1d';
              ctx.fill();
            }
          }
        }
      }

      // Draw Rising Hazard Floor (Lava / laser boundary)
      const floorScreenY = barCenterY + (engine.altitudePx - engine.floorAltitudePx);
      if (floorScreenY < height + 200) {
        // Glowing hazard gradient
        const hazardGrad = ctx.createLinearGradient(0, floorScreenY, 0, height);
        hazardGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
        hazardGrad.addColorStop(0.3, 'rgba(185, 28, 28, 0.95)');
        hazardGrad.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = hazardGrad;
        ctx.fillRect(playfieldLeft - 10, floorScreenY, barWidth + 20, height - floorScreenY + 200);

        // Hazard border line
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(playfieldLeft - 10, floorScreenY);
        ctx.lineTo(playfieldLeft + barWidth + 10, floorScreenY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw Tilting Bar
      ctx.save();
      ctx.translate(barCenterX, barCenterY);
      ctx.rotate(engine.bar.angleRad);

      // Bar Body
      const barGrad = ctx.createLinearGradient(-barHalfWidth, 0, barHalfWidth, 0);
      barGrad.addColorStop(0, '#38bdf8');
      barGrad.addColorStop(0.5, '#e2e8f0');
      barGrad.addColorStop(1, '#38bdf8');

      ctx.fillStyle = barGrad;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
      ctx.shadowBlur = 8;
      ctx.fillRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);
      ctx.shadowBlur = 0;

      // Bar Border
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.strokeRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);

      // Draw active holes highlighted along the bar if any row intersects
      for (const hole of engine.bar.holes) {
        const holeX = hole.startX - barHalfWidth;
        const holeW = hole.endX - hole.startX;
        ctx.fillStyle = hole.isPortal ? '#22d3ee' : '#1e1b4b';
        ctx.fillRect(holeX, -barHeight / 2 - 1, holeW, barHeight + 2);
      }

      // Draw Ball (in bar local coordinates)
      const ballS = engine.ball.x - barHalfWidth;
      const ballY = -barHeight / 2 - engine.ball.radius + (engine.ball.isFalling ? engine.ball.fallSpeed : 0);

      ctx.beginPath();
      ctx.arc(ballS, ballY, engine.ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = engine.ball.isFalling ? '#ef4444' : '#f59e0b';
      ctx.shadowColor = engine.ball.isFalling ? '#ef4444' : '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ball highlight
      ctx.beginPath();
      ctx.arc(ballS - 3, ballY - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

      ctx.restore();

      // Draw Center Pivot
      ctx.beginPath();
      ctx.arc(barCenterX, barCenterY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Portal Warp Flash Effect
      if (engine.portalWarpAnimation > 0) {
        ctx.fillStyle = `rgba(6, 182, 212, ${engine.portalWarpAnimation * 0.6})`;
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
        background: '#0b0f19',
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
          pointerEvents: 'none',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ALTITUDE</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#38bdf8' }}>
            {stats.altitudeMeters}m
          </div>
        </div>

        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>FLOOR DIST</div>
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
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>BEST</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#a855f7' }}>
            {stats.bestAltitudeMeters}m
          </div>
        </div>
      </div>

      {/* Start / Ready Overlay */}
      {gameState !== 'PLAYING' && gameState !== 'GAME_OVER' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(11, 15, 25, 0.88)',
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
          <h2 style={{ fontSize: '2rem', color: '#38bdf8', margin: 0 }}>Skyward Roll</h2>
          <p style={{ color: '#94a3b8', maxWidth: '400px', lineHeight: 1.5, margin: 0 }}>
            Tilt your hands to steer the ball. Dodge holes, enter portals for shortcuts, and outrun the rising hazard!
          </p>

          {!isCalibrated ? (
            <div
              style={{
                background: '#334155',
                color: '#fef08a',
                padding: '10px 18px',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 'bold',
              }}
            >
              Please hold hands neutral to complete calibration first...
            </div>
          ) : (
            <button
              onClick={onStartGame}
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '12px 32px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                transition: 'transform 0.1s',
              }}
            >
              Start Climb!
            </button>
          )}
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === 'GAME_OVER' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.92)',
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
              ? 'Fell into a hole!'
              : 'Claimed by the rising hazard!'}
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
              padding: '12px 30px',
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
