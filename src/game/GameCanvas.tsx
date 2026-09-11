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

export const GameCanvas = React.memo<GameCanvasProps>(
  function GameCanvas({
    engine,
    tiltAngleRad,
    isCalibrated,
    onStartGame,
    onSkipCalibrationAndStart,
    onRestart,
    onTogglePause,
  }) {
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
      let lastHudTime = 0;
      let lastState = engine.state;

      const render = (time: number) => {
        const dt = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        // Update engine physics & logic
        engine.update(dt);

        // Throttled HUD update (120ms or immediately on state change)
        if (time - lastHudTime > 120 || engine.state !== lastState) {
          lastHudTime = time;
          lastState = engine.state;
          setGameState(engine.state);
          setStats({ ...engine.stats });
          setFloorGapMeters(Math.floor(engine.floorGap / 50));
        }

        const width = canvas.width;
        const height = canvas.height;

        // 1. Premium Dark Cabinet Playfield Background
        ctx.fillStyle = '#0a0d15';
        ctx.fillRect(0, 0, width, height);

        // Subtle laser-etched metric graduation grid
        const scrollOffset = engine.altitudePx % 50;
        ctx.lineWidth = 1;

        for (let y = scrollOffset; y < height; y += 50) {
          // Absolute world Y for this line
          const worldY = engine.altitudePx + (height * 0.65 - y);
          const meterMark = Math.round(worldY / 50);

          if (meterMark % 5 === 0 && meterMark > 0) {
            // Major 5m graduation
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(width - 40, y);
            ctx.stroke();

            // Etched subtle altitude label near rails
            ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
            ctx.font = '500 9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${meterMark}m`, 36, y + 3);
            ctx.textAlign = 'left';
            ctx.fillText(`${meterMark}m`, width - 36, y + 3);
          } else {
            // Minor 1m hairline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(width - 40, y);
            ctx.stroke();
          }
        }

        // Ambient top and bottom depth vignettes
        const topVignette = ctx.createLinearGradient(0, 0, 0, 70);
        topVignette.addColorStop(0, 'rgba(6, 8, 14, 0.9)');
        topVignette.addColorStop(1, 'transparent');
        ctx.fillStyle = topVignette;
        ctx.fillRect(0, 0, width, 70);

        const bottomVignette = ctx.createLinearGradient(0, height - 70, 0, height);
        bottomVignette.addColorStop(0, 'transparent');
        bottomVignette.addColorStop(1, 'rgba(6, 8, 14, 0.85)');
        ctx.fillStyle = bottomVignette;
        ctx.fillRect(0, height - 70, width, 70);

        // Playfield constants
        const barCenterX = width / 2;
        const barCenterY = height * 0.65;
        const barWidth = engine.bar.width;
        const barHalfWidth = barWidth / 2;
        const barHeight = engine.bar.height;
        const playfieldLeft = barCenterX - barHalfWidth;

        // 2. Precision Brushed Titanium Guide Rails
        const drawRail = (x: number) => {
          const railGrad = ctx.createLinearGradient(x, 0, x + 12, 0);
          railGrad.addColorStop(0, '#151c28');
          railGrad.addColorStop(0.3, '#334155');
          railGrad.addColorStop(0.5, '#64748b'); // Specular ridge
          railGrad.addColorStop(0.8, '#334155');
          railGrad.addColorStop(1, '#1e293b');

          ctx.fillStyle = railGrad;
          ctx.fillRect(x, 0, 12, height);

          // Inner polished bevel highlight line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x === playfieldLeft - 12 ? x + 11.5 : x + 0.5, 0);
          ctx.lineTo(x === playfieldLeft - 12 ? x + 11.5 : x + 0.5, height);
          ctx.stroke();

          // Mechanical socket rivets spaced every 110px
          const rivetScroll = (engine.altitudePx * 0.5) % 110;
          for (let ry = rivetScroll; ry < height; ry += 110) {
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(x + 6, ry, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.stroke();
          }
        };

        drawRail(playfieldLeft - 12);
        drawRail(playfieldLeft + barWidth);

        // 3. Obstacle Rows (Counter-bored Apertures & Gravitational Warps)
        for (const row of engine.rows) {
          const rowScreenY = barCenterY - (row.worldY - engine.altitudePx);

          if (rowScreenY >= -60 && rowScreenY <= height + 60) {
            if (row.isSafeZone) {
              // Minimalist safe-corridor datum line
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(playfieldLeft, rowScreenY);
              ctx.lineTo(playfieldLeft + barWidth, rowScreenY);
              ctx.stroke();
              continue;
            }

            // Hazard datum guide line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 6]);
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

              if (slot.isPortal) {
                // Celestial Cobalt Warp Singularity
                const portalGrad = ctx.createRadialGradient(
                  holeScreenX,
                  rowScreenY,
                  2,
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX
                );
                portalGrad.addColorStop(0, '#38bdf8');
                portalGrad.addColorStop(0.4, '#0284c7');
                portalGrad.addColorStop(0.85, '#0369a1');
                portalGrad.addColorStop(1, '#082f49');

                ctx.fillStyle = portalGrad;
                ctx.beginPath();
                ctx.ellipse(holeScreenX, rowScreenY, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);
                ctx.fill();

                // Concentric kinetic energy rings
                const pulse = (time * 0.003) % 1;
                ctx.strokeStyle = `rgba(186, 230, 253, ${0.4 + 0.4 * (1 - pulse)})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX * (0.5 + pulse * 0.5),
                  holeRadiusY * (0.5 + pulse * 0.5),
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.stroke();

                // Outer aperture bezel
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Luxury typography label
                ctx.fillStyle = '#0c4a6e';
                ctx.beginPath();
                ctx.roundRect(holeScreenX - 30, rowScreenY - 24, 60, 16, 4);
                ctx.fill();
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.stroke();

                ctx.fillStyle = '#e0f2fe';
                ctx.font = '600 8.5px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('WARP +7m', holeScreenX, rowScreenY - 13);
              } else {
                // Counter-bored Mechanical Pit (Deep Crimson Lacquer Rim)
                // Drop shadow around hole
                ctx.beginPath();
                ctx.ellipse(
                  holeScreenX,
                  rowScreenY + 2,
                  holeRadiusX + 1,
                  holeRadiusY + 1,
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fill();

                // Outer chamfer bevel
                ctx.beginPath();
                ctx.ellipse(holeScreenX, rowScreenY, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#4c0519';
                ctx.fill();

                // Aperture abyss depth
                const depthGrad = ctx.createRadialGradient(
                  holeScreenX,
                  rowScreenY - 3,
                  2,
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX - 2
                );
                depthGrad.addColorStop(0, '#030712');
                depthGrad.addColorStop(0.7, '#111827');
                depthGrad.addColorStop(1, '#881337');

                ctx.beginPath();
                ctx.ellipse(
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX - 2,
                  holeRadiusY - 2,
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.fillStyle = depthGrad;
                ctx.fill();

                // Inner rim hazard line
                ctx.strokeStyle = '#e11d48';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Inner lip specular highlight
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.ellipse(
                  holeScreenX,
                  rowScreenY - 1,
                  holeRadiusX - 3,
                  holeRadiusY - 3,
                  0,
                  Math.PI * 0.8,
                  Math.PI * 1.8
                );
                ctx.stroke();
              }
            }
          }
        }

        // 4. Atmospheric Geothermal Hazard Abyss (Rising Floor)
        const floorScreenY = barCenterY + (engine.altitudePx - engine.floorAltitudePx);
        if (floorScreenY < height + 200) {
          const hazardGrad = ctx.createLinearGradient(0, floorScreenY, 0, height);
          hazardGrad.addColorStop(0, 'rgba(153, 27, 27, 0.95)');
          hazardGrad.addColorStop(0.3, 'rgba(76, 5, 25, 0.98)');
          hazardGrad.addColorStop(1, '#050811');

          ctx.fillStyle = hazardGrad;
          ctx.fillRect(
            playfieldLeft - 12,
            floorScreenY,
            barWidth + 24,
            height - floorScreenY + 200
          );

          // Top hazard boundary: precision danger stripe
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(playfieldLeft - 12, floorScreenY);
          ctx.lineTo(playfieldLeft + barWidth + 12, floorScreenY);
          ctx.stroke();

          // Delicate warning chevron teeth along hazard crest
          ctx.strokeStyle = 'rgba(254, 205, 211, 0.4)';
          ctx.lineWidth = 1;
          for (let cx = playfieldLeft - 6; cx < playfieldLeft + barWidth + 10; cx += 14) {
            ctx.beginPath();
            ctx.moveTo(cx, floorScreenY);
            ctx.lineTo(cx + 6, floorScreenY + 6);
            ctx.stroke();
          }
        }

        // 5. Precision CNC-Machined Tilting Bar
        ctx.save();
        ctx.translate(barCenterX, barCenterY);
        ctx.rotate(engine.bar.angleRad);

        // Bar drop shadow onto playfield
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(-barHalfWidth, -barHeight / 2 + 5, barWidth, barHeight);

        // Machined Aerospace Alloy Bar Body
        const barGrad = ctx.createLinearGradient(0, -barHeight / 2, 0, barHeight / 2);
        barGrad.addColorStop(0, '#94a3b8'); // Top bevel highlight
        barGrad.addColorStop(0.15, '#64748b');
        barGrad.addColorStop(0.45, '#334155'); // Center body
        barGrad.addColorStop(0.7, '#1e293b');
        barGrad.addColorStop(1, '#0f172a'); // Underside shadow

        ctx.fillStyle = barGrad;
        ctx.fillRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);

        // Ball guide groove along center of bar
        ctx.fillStyle = '#0b0f17';
        ctx.fillRect(-barHalfWidth, -1, barWidth, 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-barHalfWidth, 1.5);
        ctx.lineTo(barHalfWidth, 1.5);
        ctx.stroke();

        // Top chamfer specular reflection edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-barHalfWidth, -barHeight / 2 + 0.5);
        ctx.lineTo(barHalfWidth, -barHeight / 2 + 0.5);
        ctx.stroke();

        // Outer precision outline
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.strokeRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);

        // End-caps with mechanical fasteners
        const drawEndCap = (x: number) => {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, -barHeight / 2, 6, barHeight);
          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          ctx.arc(x + 3, 0, 1.5, 0, Math.PI * 2);
          ctx.fill();
        };
        drawEndCap(-barHalfWidth);
        drawEndCap(barHalfWidth - 6);

        // 6. Precision-Ground Tungsten Steel Ball Bearing
        let ballDrawX: number;
        let ballDrawY: number;
        let ballRadius = engine.ball.radius;

        if (engine.ball.isFalling) {
          const progress = engine.ball.fallProgress;
          ballRadius = Math.max(2, engine.ball.radius * (1 - progress * 0.55));
          ballDrawX = engine.ball.x - barHalfWidth;
          ballDrawY = -barHeight / 2 - engine.ball.radius + progress * 24;
        } else {
          ballDrawX = engine.ball.x - barHalfWidth;
          ballDrawY = -barHeight / 2 - engine.ball.radius;
        }

        // Ambient contact shadow on bar beneath ball
        if (!engine.ball.isFalling) {
          ctx.beginPath();
          ctx.ellipse(ballDrawX, -barHeight / 2 + 1, ballRadius * 0.9, 2.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fill();
        }

        // Draw Ball Sphere
        ctx.save();
        ctx.translate(ballDrawX, ballDrawY);
        ctx.rotate(engine.ball.rotationRad);

        // Polished Chrome Specular Radial Gradient
        const ballGrad = ctx.createRadialGradient(
          -ballRadius * 0.35,
          -ballRadius * 0.35,
          ballRadius * 0.1,
          0,
          0,
          ballRadius
        );

        if (engine.ball.isFalling) {
          ballGrad.addColorStop(0, '#fca5a5');
          ballGrad.addColorStop(0.4, '#e11d48');
          ballGrad.addColorStop(0.9, '#881337');
          ballGrad.addColorStop(1, '#4c0519');
        } else {
          ballGrad.addColorStop(0, '#ffffff'); // Direct specular glare
          ballGrad.addColorStop(0.25, '#f8fafc'); // Polished mirror face
          ballGrad.addColorStop(0.55, '#cbd5e1'); // Titanium midtone
          ballGrad.addColorStop(0.85, '#475569'); // Core metallic shadow
          ballGrad.addColorStop(1, '#0f172a'); // Ambient occlusion rim
        }

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
        ctx.fill();

        // Finely etched rotation gauge line so roll is physically tangible
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-ballRadius + 2, 0);
        ctx.lineTo(ballRadius - 2, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, ballRadius * 0.45, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        // Fine secondary specular arc
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius - 1.5, Math.PI * 1.1, Math.PI * 1.6);
        ctx.stroke();

        ctx.restore(); // Restore ball rotation

        // 7. Harmonic Warp Forcefield Barrier
        if (engine.shieldTimer > 0) {
          const isBlinking = engine.shieldTimer < 0.6 && Math.floor(time / 100) % 2 === 0;
          if (!isBlinking) {
            ctx.beginPath();
            ctx.arc(ballDrawX, ballDrawY, engine.ball.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
            ctx.fill();
          }
        }

        ctx.restore(); // Restore bar coordinate space

        // 8. Central Stainless Steel Pivot Hub
        ctx.beginPath();
        ctx.arc(barCenterX, barCenterY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Recessed hex socket bolt
        ctx.beginPath();
        ctx.arc(barCenterX, barCenterY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0d15';
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 9. Warp Flash Event
        if (engine.portalWarpAnimation > 0) {
          ctx.fillStyle = `rgba(14, 165, 233, ${engine.portalWarpAnimation * 0.35})`;
          ctx.fillRect(0, 0, width, height);
        }

        // 10. Chronograph 3-Second Countdown
        if (engine.state === 'COUNTDOWN') {
          const remaining = engine.countdownTimer;
          const count = Math.ceil(remaining);
          const progress = Math.min(1, remaining / 3.0);

          ctx.fillStyle = 'rgba(10, 13, 21, 0.65)';
          ctx.fillRect(0, 0, width, height);

          ctx.save();
          ctx.translate(width / 2, height / 2 - 25);

          // Outer precision tick ring
          ctx.beginPath();
          ctx.arc(0, 0, 54, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Active chronograph progress arc
          ctx.beginPath();
          ctx.arc(0, 0, 54, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.strokeStyle = count <= 1 ? '#10b981' : count === 2 ? '#38bdf8' : '#f59e0b';
          ctx.lineWidth = 4;
          ctx.stroke();

          // Count text
          ctx.fillStyle = '#f8fafc';
          ctx.font = count > 0 ? '600 52px monospace' : '700 38px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(count > 0 ? `${count}` : 'ROLL', 0, 0);

          ctx.restore();

          // Calibration guidance subtitle
          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 12.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const guidance =
            count === 3
              ? 'LEVEL YOUR HANDS AT CHEST HEIGHT'
              : count === 2
              ? 'ZEROING NEUTRAL POSTURE · 100%'
              : 'PREPARE FOR ASCENT';
          ctx.fillText(guidance, width / 2, height / 2 + 50);
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
          width: '780px',
          height: '660px',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          border: '1px solid #1e293b',
          background: '#070b14',
          flexShrink: 0,
        }}
      >
        <canvas ref={canvasRef} width={780} height={660} style={{ display: 'block' }} />

        {/* Premium Recessed HUD Clusters */}
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
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '6px 14px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '0.65rem', letterSpacing: '1px', color: '#64748b' }}>
              ALTITUDE
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc' }}>
              {stats.altitudeMeters}
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '2px' }}>m</span>
            </div>
          </div>

          {/* Shield Status Badge */}
          {stats.isShieldActive && (
            <div
              style={{
                background: '#0c4a6e',
                border: '1px solid #0284c7',
                padding: '5px 14px',
                borderRadius: '16px',
                color: '#e0f2fe',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.5px',
              }}
            >
              🛡️ SHIELD {stats.shieldTimer.toFixed(1)}s
            </div>
          )}

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '6px 14px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '0.65rem', letterSpacing: '1px', color: '#64748b' }}>
              HAZARD GAP
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: floorGapMeters < 3 ? '#ef4444' : floorGapMeters < 5 ? '#f59e0b' : '#10b981',
              }}
            >
              {floorGapMeters}
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '2px' }}>m</span>
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '6px 14px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '0.65rem', letterSpacing: '1px', color: '#64748b' }}>
              BEST RECORD
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#d97706' }}>
              {stats.bestAltitudeMeters}
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '2px' }}>m</span>
            </div>
          </div>
        </div>

        {/* Start / Briefing Modal Plate */}
        {gameState !== 'PLAYING' &&
          gameState !== 'COUNTDOWN' &&
          gameState !== 'PAUSED' &&
          gameState !== 'GAME_OVER' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(8, 12, 20, 0.94)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '18px',
                padding: '30px',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '0.72rem',
                    letterSpacing: '2.5px',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Precision Motion Arcade
                </div>
                <h2
                  style={{
                    fontSize: '2.4rem',
                    fontWeight: 900,
                    letterSpacing: '3px',
                    color: '#f8fafc',
                    margin: 0,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  SKYWARD ROLL
                </h2>
              </div>

              <p
                style={{
                  color: '#94a3b8',
                  maxWidth: '460px',
                  lineHeight: 1.6,
                  margin: 0,
                  fontSize: '0.88rem',
                }}
              >
                Steer the tungsten sphere along the ascending mechanical beam using hand elevation.
                Evade counter-bored hazard pits, intercept celestial warps, and outclimb the rising thermal abyss.
              </p>

              {/* 3 Step Mission Guide */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  maxWidth: '480px',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '10px 8px',
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>🖐️</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#e2e8f0' }}>
                    1. Align Hands
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                    Hold hands at chest height
                  </div>
                </div>

                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '10px 8px',
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>⚖️</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#e2e8f0' }}>
                    2. Tilt & Roll
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                    Raise left or right to steer
                  </div>
                </div>

                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '10px 8px',
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>🌀</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#e2e8f0' }}>
                    3. Warp Ahead
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                    Enter cobalt portals for +7m
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                {isCalibrated ? (
                  <button
                    onClick={onStartGame}
                    style={{
                      background: '#059669',
                      color: '#ffffff',
                      border: '1px solid #10b981',
                      padding: '11px 32px',
                      fontSize: '0.95rem',
                      fontWeight: 'bold',
                      letterSpacing: '1px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(5, 150, 105, 0.3)',
                    }}
                  >
                    INITIATE ASCENT
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onStartGame}
                      disabled={!isCalibrated}
                      style={{
                        background: '#1e293b',
                        color: '#64748b',
                        border: '1px solid #334155',
                        padding: '11px 22px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                        borderRadius: '8px',
                        cursor: 'not-allowed',
                      }}
                    >
                      Hold Hands to Calibrate...
                    </button>
                    <button
                      onClick={onSkipCalibrationAndStart}
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        border: '1px solid #38bdf8',
                        padding: '11px 22px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      Quick Start (Skip)
                    </button>
                  </>
                )}
              </div>

              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Tip: Show open single palm ✋ to camera or press <kbd>Space</kbd> anytime to suspend.
              </div>
            </div>
          )}

        {/* Suspended Modal Plate */}
        {gameState === 'PAUSED' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8, 12, 20, 0.92)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>✋</div>
            <h2
              style={{
                fontSize: '1.8rem',
                letterSpacing: '3px',
                color: '#f8fafc',
                margin: 0,
                fontFamily: 'monospace',
              }}
            >
              ASCENT SUSPENDED
            </h2>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem' }}>
              Hold single palm ✋ to camera or press <kbd>Space</kbd> to resume
            </p>
            <button
              onClick={onTogglePause}
              style={{
                marginTop: '10px',
                background: '#059669',
                color: '#ffffff',
                border: '1px solid #10b981',
                padding: '9px 28px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                letterSpacing: '1px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              RESUME CLIMB
            </button>
          </div>
        )}

        {/* Mission Concluded Debrief Plate */}
        {gameState === 'GAME_OVER' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8, 12, 20, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '24px',
              textAlign: 'center',
              fontFamily: 'monospace',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                letterSpacing: '2px',
                color: '#f43f5e',
                textTransform: 'uppercase',
              }}
            >
              Mission Concluded
            </div>
            <h2
              style={{
                fontSize: '2rem',
                letterSpacing: '3px',
                color: '#f8fafc',
                margin: 0,
              }}
            >
              FLIGHT TERMINATED
            </h2>
            <div
              style={{
                fontSize: '0.82rem',
                color: '#fda4af',
                background: '#4c0519',
                padding: '5px 16px',
                borderRadius: '6px',
                border: '1px solid #9f1239',
              }}
            >
              {stats.deathReason === 'HOLE_FALL'
                ? 'Aperture Breach: Dropped into hazard pit'
                : 'Abyss Inundation: Caught by rising floor'}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginTop: '10px',
                width: '75%',
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  padding: '10px',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>ALTITUDE</div>
                <div style={{ fontSize: '1.25rem', color: '#f8fafc', fontWeight: 'bold' }}>
                  {stats.altitudeMeters}m
                </div>
              </div>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  padding: '10px',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>RECORD</div>
                <div style={{ fontSize: '1.25rem', color: '#d97706', fontWeight: 'bold' }}>
                  {stats.bestAltitudeMeters}m
                </div>
              </div>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  padding: '10px',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>WARPS</div>
                <div style={{ fontSize: '1.25rem', color: '#38bdf8', fontWeight: 'bold' }}>
                  {stats.portalsUsed}
                </div>
              </div>
            </div>

            <button
              onClick={onRestart}
              style={{
                marginTop: '12px',
                background: '#0284c7',
                color: '#ffffff',
                border: '1px solid #38bdf8',
                padding: '11px 32px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                letterSpacing: '1px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    // Sync tilt angle to engine imperatively so GameCanvas avoids DOM re-render on angle change!
    if (prev.tiltAngleRad !== next.tiltAngleRad) {
      next.engine.setTiltAngle(next.tiltAngleRad);
    }
    return (
      prev.isCalibrated === next.isCalibrated &&
      prev.engine === next.engine &&
      prev.onStartGame === next.onStartGame &&
      prev.onSkipCalibrationAndStart === next.onSkipCalibrationAndStart &&
      prev.onRestart === next.onRestart &&
      prev.onTogglePause === next.onTogglePause
    );
  }
);
