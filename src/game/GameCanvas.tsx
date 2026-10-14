import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import type { GameState } from './GameEngine';

interface GameCanvasProps {
  engine: GameEngine;
  tiltAngleRad: number;
  isCalibrated: boolean;
  isHandLockActive?: boolean;
  onStartGame: () => void;
  onSkipCalibrationAndStart: () => void;
  onRestart: () => void;
  onTogglePause: () => void;
  isHandTrackingActive?: boolean;
  onOpenHowToPlay?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  type?: 'sparkle' | 'spark' | 'ember' | 'star' | 'splash' | 'smoke' | 'bubble' | 'ripple';
}

export const GameCanvas = React.memo<GameCanvasProps>(
  function GameCanvas({
    engine,
    tiltAngleRad,
    isCalibrated,
    isHandLockActive = false,
    onStartGame,
    onSkipCalibrationAndStart,
    onRestart,
    onTogglePause,
    isHandTrackingActive = false,
    onOpenHowToPlay,
  }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<GameState>(engine.state);
    const [stats, setStats] = useState(engine.stats);
    const [floorGapMeters, setFloorGapMeters] = useState(Math.floor(engine.floorGap / 50));

    // Particle emitter system for retro trails and juice
    const particlesRef = useRef<Particle[]>([]);
    const lastBallXRef = useRef<number>(engine.ball.x);
    const shakeRef = useRef<number>(0);

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

        // Screen shake decay
        if (shakeRef.current > 0) {
          shakeRef.current = Math.max(0, shakeRef.current - dt * 18);
        }

        // Trigger screen shake on death, warp, or molten lava splash
        if (engine.portalWarpAnimation > 0.6) {
          shakeRef.current = 6;
        }

        if (engine.lavaFall?.lavaSplashPending) {
          engine.lavaFall.lavaSplashPending = false;
          shakeRef.current = 14; // Dramatic arcade tremor

          const curWidth = canvas.width;
          const curHeight = canvas.height;
          const barCenterX = curWidth / 2;
          const barHalfWidth = engine.bar.width / 2;
          const playfieldLeft = barCenterX - barHalfWidth;
          const splashX = playfieldLeft + engine.lavaFall.worldX;
          const barCenterY = curHeight * 0.65;
          const splashY = barCenterY + (engine.altitudePx - engine.floorAltitudePx);

          // 1. Expanding thermal shockwave ripples on lava surface
          for (let r = 0; r < 3; r++) {
            particlesRef.current.push({
              x: splashX,
              y: splashY,
              vx: 0,
              vy: 0,
              radius: 10 + r * 14,
              alpha: 0.95 - r * 0.2,
              color: r === 0 ? '#ffffff' : r === 1 ? '#ffe600' : '#ff007f',
              type: 'ripple',
            });
          }

          // 2. High-energy molten magma eruption (36 droplets & sparks)
          for (let i = 0; i < 36; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; // Upward fan
            const speed = Math.random() * 260 + 90;
            const color =
              Math.random() < 0.35
                ? '#ffffff' // White-hot core
                : Math.random() < 0.7
                ? '#ffe600' // Fiery yellow
                : Math.random() < 0.88
                ? '#ff5500' // Bright orange
                : '#ff007f'; // Neon magenta magma

            particlesRef.current.push({
              x: splashX + (Math.random() - 0.5) * 16,
              y: splashY + (Math.random() - 0.5) * 8,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: Math.random() * 3.5 + 1.8,
              alpha: 1.0,
              color,
              type: 'splash',
            });
          }

          // 3. Sizzling steam & smoke puffs
          for (let i = 0; i < 8; i++) {
            particlesRef.current.push({
              x: splashX + (Math.random() - 0.5) * 24,
              y: splashY - Math.random() * 12,
              vx: (Math.random() - 0.5) * 35,
              vy: -Math.random() * 50 - 20,
              radius: Math.random() * 6 + 4,
              alpha: 0.7,
              color: Math.random() < 0.5 ? 'rgba(255, 230, 200, 0.6)' : 'rgba(255, 0, 127, 0.4)',
              type: 'smoke',
            });
          }
        }

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

        ctx.save();

        // Apply screen shake
        if (shakeRef.current > 0) {
          const shakeX = (Math.random() - 0.5) * shakeRef.current * 2;
          const shakeY = (Math.random() - 0.5) * shakeRef.current * 2;
          ctx.translate(shakeX, shakeY);
        }

        // 1. Deep Space Retro Arcade Background with Starfield & Grid
        ctx.fillStyle = '#080214';
        ctx.fillRect(0, 0, width, height);

        // Subtle moving neon horizon grid
        const scrollOffset = (engine.altitudePx * 0.8) % 40;
        ctx.lineWidth = 1;

        for (let y = scrollOffset; y < height; y += 40) {
          const worldY = engine.altitudePx + (height * 0.65 - y);
          const meterMark = Math.round(worldY / 50);

          if (meterMark % 5 === 0 && meterMark > 0) {
            // Major 5m retro neon hairline
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.12)';
            ctx.beginPath();
            ctx.moveTo(35, y);
            ctx.lineTo(width - 35, y);
            ctx.stroke();

            // Retro glowing altitude badge
            ctx.fillStyle = 'rgba(0, 243, 255, 0.4)';
            ctx.font = "600 8px 'Press Start 2P', monospace";
            ctx.textAlign = 'right';
            ctx.fillText(`${meterMark}m`, 30, y + 3);
            ctx.textAlign = 'left';
            ctx.fillText(`${meterMark}m`, width - 30, y + 3);
          } else {
            // Minor neon grid line
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.05)';
            ctx.beginPath();
            ctx.moveTo(35, y);
            ctx.lineTo(width - 35, y);
            ctx.stroke();
          }
        }

        // Playfield dimensions
        const barCenterX = width / 2;
        const barCenterY = height * 0.65;
        const barWidth = engine.bar.width;
        const barHalfWidth = barWidth / 2;
        const barHeight = engine.bar.height;
        const playfieldLeft = barCenterX - barHalfWidth;

        // 2. Vibrant Arcade Cabinet Rails with Chasing Lights
        const drawNeonRail = (x: number) => {
          // Rail housing
          ctx.fillStyle = '#140628';
          ctx.fillRect(x, 0, 14, height);

          // Neon inner border
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x === playfieldLeft - 14 ? x + 13.5 : x + 0.5, 0);
          ctx.lineTo(x === playfieldLeft - 14 ? x + 13.5 : x + 0.5, height);
          ctx.stroke();

          // Chasing retro neon marquee lights along rails (optimized with fast layered halos)
          const lightScroll = (time * 0.08 + engine.altitudePx * 0.4) % 36;
          for (let ly = lightScroll; ly < height; ly += 36) {
            const isAlt = Math.floor((ly - lightScroll) / 36) % 2 === 0;
            const glowColor = isAlt ? 'rgba(0, 243, 255, 0.35)' : 'rgba(255, 0, 127, 0.35)';
            const coreColor = isAlt ? '#00f3ff' : '#ff007f';

            // Outer soft glow halo
            ctx.fillStyle = glowColor;
            ctx.beginPath();
            ctx.arc(x + 7, ly, 5.5, 0, Math.PI * 2);
            ctx.fill();

            // Crisp incandescent core
            ctx.fillStyle = coreColor;
            ctx.beginPath();
            ctx.arc(x + 7, ly, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        };

        drawNeonRail(playfieldLeft - 14);
        drawNeonRail(playfieldLeft + barWidth);

        // 3. Obstacle Rows (Neon Hazard Pits & Cosmic Rainbow Warps)
        for (const row of engine.rows) {
          const rowScreenY = barCenterY - (row.worldY - engine.altitudePx);

          if (rowScreenY >= -60 && rowScreenY <= height + 60) {
            if (row.isGateway) {
              // Physical Retro Milestone Gateway Archway
              const archY = rowScreenY;
              const archHeight = 36;
              const gateLevel = row.gatewayLevelNumber ?? 1;
              const gateName = row.gatewayName ?? 'NEW SECTOR';
              const gateAlt = row.gatewayAltitudeMeters ?? Math.floor(row.worldY / 50);

              ctx.save();
              // Archway backdrop beam spanning entire playfield + rails
              ctx.fillStyle = 'rgba(10, 4, 25, 0.92)';
              ctx.fillRect(playfieldLeft - 14, archY - archHeight / 2, barWidth + 28, archHeight);

              // Glowing outer neon gold border
              ctx.strokeStyle = '#ffe600';
              ctx.lineWidth = 2.5;
              ctx.shadowColor = '#ffe600';
              ctx.shadowBlur = 12;
              ctx.strokeRect(playfieldLeft - 14, archY - archHeight / 2, barWidth + 28, archHeight);

              // Inner cyan accent frame
              ctx.strokeStyle = '#00f3ff';
              ctx.lineWidth = 1;
              ctx.shadowBlur = 4;
              ctx.strokeRect(playfieldLeft - 10, archY - archHeight / 2 + 3, barWidth + 20, archHeight - 6);
              ctx.shadowBlur = 0;

              // Corner beacons on side rails
              const beaconColor = Math.sin(time * 0.008) > 0 ? '#ffe600' : '#00f3ff';
              ctx.fillStyle = beaconColor;
              ctx.shadowColor = beaconColor;
              ctx.shadowBlur = 8;
              ctx.beginPath();
              ctx.arc(playfieldLeft - 7, archY, 5, 0, Math.PI * 2);
              ctx.arc(playfieldLeft + barWidth + 7, archY, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;

              // Archway Text
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = "700 10px 'Press Start 2P', monospace";
              ctx.fillStyle = '#ffe600';
              ctx.shadowColor = '#ffe600';
              ctx.shadowBlur = 8;
              ctx.fillText(`★ STAGE ${gateLevel}: ${gateName} ★`, barCenterX, archY - 4);
              ctx.shadowBlur = 0;

              ctx.font = "600 7px 'Press Start 2P', monospace";
              ctx.fillStyle = '#00f3ff';
              ctx.fillText(`[ ${gateAlt}M MILESTONE GATEWAY ]`, barCenterX, archY + 9);

              ctx.restore();
              continue;
            }

            if (row.isSafeZone) {
              // Cheerful green safe zone indicator line
              ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
              ctx.lineWidth = 2;
              ctx.setLineDash([8, 8]);
              ctx.beginPath();
              ctx.moveTo(playfieldLeft, rowScreenY);
              ctx.lineTo(playfieldLeft + barWidth, rowScreenY);
              ctx.stroke();
              ctx.setLineDash([]);
              continue;
            }

            // Dotted hazard guide row
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(playfieldLeft, rowScreenY);
            ctx.lineTo(playfieldLeft + barWidth, rowScreenY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw obstacle holes
            for (const slot of row.slots) {
              const holeScreenX = playfieldLeft + (slot.startX + slot.endX) / 2;
              const holeRadiusX = (slot.endX - slot.startX) / 2;
              const holeRadiusY = 16;

              if (slot.isPortal) {
                // Cosmic Rainbow Warp Vortex
                const portalPulse = (time * 0.004) % 1;

                // Pulsing outer aura
                const portalGrad = ctx.createRadialGradient(
                  holeScreenX,
                  rowScreenY,
                  2,
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX + 6
                );
                portalGrad.addColorStop(0, '#ffffff');
                portalGrad.addColorStop(0.3, '#00f3ff');
                portalGrad.addColorStop(0.7, '#a855f7');
                portalGrad.addColorStop(1, '#ff007f');

                ctx.fillStyle = portalGrad;
                ctx.beginPath();
                ctx.ellipse(holeScreenX, rowScreenY, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);
                ctx.fill();

                // Swirling neon energy rings
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(
                  holeScreenX,
                  rowScreenY,
                  holeRadiusX * (0.4 + portalPulse * 0.5),
                  holeRadiusY * (0.4 + portalPulse * 0.5),
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.stroke();

                // Glowing Neon Warp Badge
                ctx.fillStyle = 'rgba(17, 7, 36, 0.9)';
                ctx.beginPath();
                ctx.roundRect(holeScreenX - 32, rowScreenY - 26, 64, 18, 5);
                ctx.fill();
                ctx.strokeStyle = '#00f3ff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#ffe600';
                ctx.font = "600 7px 'Press Start 2P', monospace";
                ctx.textAlign = 'center';
                ctx.fillText('★ WARP ★', holeScreenX, rowScreenY - 14);
              } else {
                // Retro Neon Hazard Pit
                // Deep dark pit
                ctx.beginPath();
                ctx.ellipse(holeScreenX, rowScreenY, holeRadiusX, holeRadiusY, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#06010d';
                ctx.fill();

                // Glowing neon crimson rim (optimized double-stroke glow)
                ctx.strokeStyle = 'rgba(255, 0, 127, 0.35)';
                ctx.lineWidth = 5;
                ctx.stroke();
                ctx.strokeStyle = '#ff007f';
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Warning hazard teeth inside the pit
                const teethCount = 5;
                const toothSpacing = (holeRadiusX * 1.5) / teethCount;
                ctx.strokeStyle = 'rgba(255, 0, 127, 0.5)';
                ctx.lineWidth = 1.5;
                for (let i = -2; i <= 2; i++) {
                  const tx = holeScreenX + i * toothSpacing;
                  ctx.beginPath();
                  ctx.moveTo(tx - 3, rowScreenY - 8);
                  ctx.lineTo(tx, rowScreenY + 6);
                  ctx.lineTo(tx + 3, rowScreenY - 8);
                  ctx.stroke();
                }
              }
            }
          }
        }

        // 4. Animated Bubbling Retro Arcade Lava Floor
        const floorScreenY = barCenterY + (engine.altitudePx - engine.floorAltitudePx);
        if (floorScreenY < height + 180) {
          // Bubbling molten lava gradient
          const lavaGrad = ctx.createLinearGradient(0, floorScreenY, 0, height);
          lavaGrad.addColorStop(0, '#ffe600'); // Fiery yellow crest
          lavaGrad.addColorStop(0.12, '#ff5500'); // Hot orange
          lavaGrad.addColorStop(0.35, '#ff007f'); // Neon magenta magma
          lavaGrad.addColorStop(1, '#2b001a'); // Deep dark core

          ctx.fillStyle = lavaGrad;

          // Undulating wave crest across playfield
          ctx.beginPath();
          ctx.moveTo(playfieldLeft - 14, height);
          ctx.lineTo(playfieldLeft - 14, floorScreenY);

          for (let wx = playfieldLeft - 14; wx <= playfieldLeft + barWidth + 14; wx += 10) {
            const wave =
              Math.sin(time * 0.005 + wx * 0.04) * 4 +
              Math.sin(time * 0.009 + wx * 0.08) * 2;
            ctx.lineTo(wx, floorScreenY + wave);
          }

          ctx.lineTo(playfieldLeft + barWidth + 14, height);
          ctx.closePath();
          ctx.fill();

          // Glowing neon crest line
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Random rising ember sparks from lava
          if (Math.random() < 0.3) {
            const emberX = playfieldLeft + Math.random() * barWidth;
            particlesRef.current.push({
              x: emberX,
              y: floorScreenY,
              vx: (Math.random() - 0.5) * 25,
              vy: -Math.random() * 60 - 30,
              radius: Math.random() * 2.5 + 1,
              alpha: 1,
              color: Math.random() < 0.5 ? '#ffe600' : '#ff007f',
              type: 'ember',
            });
          }
        }

        // 5. Sleek Retro Arcade Tilting Bar
        ctx.save();
        ctx.translate(barCenterX, barCenterY);
        ctx.rotate(engine.bar.angleRad);

        // Bar drop glow onto playfield
        ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
        ctx.fillRect(-barHalfWidth, -barHeight / 2 - 3, barWidth, barHeight + 6);

        // Vibrant Arcade Bar Body (Cyan / Yellow Racing Stripes)
        const barGrad = ctx.createLinearGradient(0, -barHeight / 2, 0, barHeight / 2);
        barGrad.addColorStop(0, '#00f3ff');
        barGrad.addColorStop(0.3, '#38bdf8');
        barGrad.addColorStop(0.7, '#0284c7');
        barGrad.addColorStop(1, '#075985');

        ctx.fillStyle = barGrad;
        ctx.fillRect(-barHalfWidth, -barHeight / 2, barWidth, barHeight);

        // Central neon guide strip along bar
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = 6;
        ctx.fillRect(-barHalfWidth, -1, barWidth, 2);
        ctx.shadowBlur = 0;

        // Glowing end-caps
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 8;
        ctx.fillRect(-barHalfWidth, -barHeight / 2, 8, barHeight);
        ctx.fillRect(barHalfWidth - 8, -barHeight / 2, 8, barHeight);
        ctx.shadowBlur = 0;

        // 6. Shiny Retro Chrome Pinball with Sparkle Trail (Drawn on bar when not in free-fall)
        if (!engine.lavaFall) {
          let ballDrawX: number;
          let ballDrawY: number;
          let ballRadius = engine.ball.radius;

          if (engine.ball.isFalling) {
            const progress = engine.ball.fallProgress;
            ballRadius = Math.max(2, engine.ball.radius * (1 - progress * 0.7));
            ballDrawX = engine.ball.x - barHalfWidth;
            ballDrawY = -barHeight / 2 - engine.ball.radius + progress * 28;
          } else {
            ballDrawX = engine.ball.x - barHalfWidth;
            ballDrawY = -barHeight / 2 - engine.ball.radius;
          }

          // Spawn Sparkle Trail Particles as Ball Rolls
          const ballSpeed = Math.abs(engine.ball.velocity);
          if (!engine.ball.isFalling && ballSpeed > 20 && Math.random() < 0.45) {
            // Transform local bar coordinates to screen coordinates
            const cosB = Math.cos(engine.bar.angleRad);
            const sinB = Math.sin(engine.bar.angleRad);
            const screenBallX = barCenterX + ballDrawX * cosB - ballDrawY * sinB;
            const screenBallY = barCenterY + ballDrawX * sinB + ballDrawY * cosB;

            particlesRef.current.push({
              x: screenBallX,
              y: screenBallY,
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 0.5) * 15,
              radius: Math.random() * 3 + 1.5,
              alpha: 0.9,
              color: Math.random() < 0.5 ? '#ffe600' : '#00f3ff',
              type: 'sparkle',
            });
          }

          // Wall impact spark burst check
          if (!engine.ball.isFalling) {
            const atLeftEdge = engine.ball.x <= engine.ball.radius + 1.5;
            const atRightEdge = engine.ball.x >= engine.bar.width - engine.ball.radius - 1.5;
            if ((atLeftEdge || atRightEdge) && ballSpeed > 100) {
              const cosB = Math.cos(engine.bar.angleRad);
              const sinB = Math.sin(engine.bar.angleRad);
              const screenBallX = barCenterX + ballDrawX * cosB - ballDrawY * sinB;
              const screenBallY = barCenterY + ballDrawX * sinB + ballDrawY * cosB;

              for (let i = 0; i < 4; i++) {
                particlesRef.current.push({
                  x: screenBallX,
                  y: screenBallY,
                  vx: (atLeftEdge ? 1 : -1) * (Math.random() * 60 + 20),
                  vy: (Math.random() - 0.5) * 50,
                  radius: Math.random() * 2.5 + 1.5,
                  alpha: 1,
                  color: '#ffe600',
                  type: 'spark',
                });
              }
            }
          }

          lastBallXRef.current = engine.ball.x;

          // Draw Chrome Pinball
          ctx.save();
          ctx.translate(ballDrawX, ballDrawY);
          ctx.rotate(engine.ball.rotationRad);

          // Shiny Chrome Radial Gradient
          const ballGrad = ctx.createRadialGradient(
            -ballRadius * 0.35,
            -ballRadius * 0.35,
            ballRadius * 0.1,
            0,
            0,
            ballRadius
          );

          if (engine.ball.isFalling) {
            ballGrad.addColorStop(0, '#ffffff');
            ballGrad.addColorStop(0.3, '#ff007f');
            ballGrad.addColorStop(1, '#4a0026');
          } else {
            ballGrad.addColorStop(0, '#ffffff'); // Direct specular gleam
            ballGrad.addColorStop(0.3, '#f0fdf4');
            ballGrad.addColorStop(0.65, '#00f3ff'); // Neon arcade tint
            ballGrad.addColorStop(0.9, '#0284c7');
            ballGrad.addColorStop(1, '#082f49');
          }

          ctx.fillStyle = ballGrad;
          ctx.beginPath();
          ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
          ctx.fill();

          // Neon outer glow ring around ball
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Animated retro rolling crosshairs / pinball star reflection
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-ballRadius + 2, 0);
          ctx.lineTo(ballRadius - 2, 0);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, ballRadius * 0.45, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();

          ctx.restore(); // Restore ball rotation

          // 7. Shield Forcefield Aura (Pulsating Retro Shield - Never vanishes during warning phase!)
          if (engine.shieldTimer > 0) {
            const isExpiring = engine.shieldTimer < 1.2;
            const pulsePhase = Math.sin(time * 0.025);
            const shieldColor = isExpiring
              ? (pulsePhase > 0 ? '#ffe600' : '#ff007f')
              : '#00f3ff';
            const shieldRadius = engine.ball.radius + 9 + (isExpiring ? Math.sin(time * 0.03) * 2.5 : 0);

            ctx.beginPath();
            ctx.arc(ballDrawX, ballDrawY, shieldRadius, 0, Math.PI * 2);
            ctx.strokeStyle = shieldColor;
            ctx.lineWidth = isExpiring ? 2.5 : 2;
            ctx.shadowColor = shieldColor;
            ctx.shadowBlur = isExpiring ? 14 : 8;
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = isExpiring
              ? (pulsePhase > 0 ? 'rgba(255, 230, 0, 0.22)' : 'rgba(255, 0, 127, 0.22)')
              : 'rgba(0, 243, 255, 0.18)';
            ctx.fill();

            // Concentric pulsing energy ripple
            const rippleRadius = shieldRadius + 4 + ((time * 0.02) % 6);
            ctx.beginPath();
            ctx.arc(ballDrawX, ballDrawY, rippleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = shieldColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.45;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }
        }

        ctx.restore(); // Restore bar coordinate space

        // 8. Central Retro Arcade Pivot Hub
        ctx.beginPath();
        ctx.arc(barCenterX, barCenterY, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(barCenterX, barCenterY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // 8b. Dual Rail Hand Grips (Visually connects physical hands directly across the screen)
        const sinAngle = Math.sin(engine.bar.angleRad);
        const gripLeftY = barCenterY - barHalfWidth * sinAngle;
        const gripRightY = barCenterY + barHalfWidth * sinAngle;

        ctx.save();
        // Left Hand Rail Grip (Cyan Aura)
        ctx.fillStyle = '#00f3ff';
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = isHandTrackingActive ? 14 : 6;
        ctx.beginPath();
        ctx.arc(playfieldLeft - 7, gripLeftY, isHandTrackingActive ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(playfieldLeft - 7, gripLeftY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Right Hand Rail Grip (Pink Aura)
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = isHandTrackingActive ? 14 : 6;
        ctx.beginPath();
        ctx.arc(playfieldLeft + barWidth + 7, gripRightY, isHandTrackingActive ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(playfieldLeft + barWidth + 7, gripRightY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 8a. Free-Falling / Molten Lava Sinking Pinball
        if (engine.lavaFall) {
          const fall = engine.lavaFall;
          const fallScreenX = playfieldLeft + fall.worldX;
          const fallScreenY = barCenterY - (fall.worldY - engine.altitudePx);
          const fallRadius = engine.ball.radius * fall.scale;

          ctx.save();
          ctx.translate(fallScreenX, fallScreenY);
          ctx.rotate(fall.rotationRad);

          // Incandescent Thermal Glow Aura
          if (fall.glowIntensity > 0) {
            const auraRadius = fallRadius + 15 * fall.glowIntensity;
            const auraGrad = ctx.createRadialGradient(0, 0, fallRadius * 0.4, 0, 0, auraRadius);
            auraGrad.addColorStop(0, `rgba(255, 230, 0, ${0.85 * fall.glowIntensity})`);
            auraGrad.addColorStop(0.5, `rgba(255, 85, 0, ${0.5 * fall.glowIntensity})`);
            auraGrad.addColorStop(1, 'rgba(255, 0, 127, 0)');
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Molten Ball Body Gradient
          const ballGrad = ctx.createRadialGradient(
            -fallRadius * 0.35,
            -fallRadius * 0.35,
            fallRadius * 0.1,
            0,
            0,
            fallRadius
          );

          if (fall.hasHitLava) {
            ballGrad.addColorStop(0, '#ffffff'); // Incandescent white-hot core
            ballGrad.addColorStop(0.25, '#ffe600');
            ballGrad.addColorStop(0.65, '#ff5500');
            ballGrad.addColorStop(1, '#ff007f');
          } else if (fall.glowIntensity > 0) {
            ballGrad.addColorStop(0, '#ffffff');
            ballGrad.addColorStop(0.3, '#ffccaa');
            ballGrad.addColorStop(0.7, '#ff5500');
            ballGrad.addColorStop(1, '#3b001a');
          } else {
            ballGrad.addColorStop(0, '#ffffff');
            ballGrad.addColorStop(0.3, '#f0fdf4');
            ballGrad.addColorStop(0.7, '#00f3ff');
            ballGrad.addColorStop(1, '#082f49');
          }

          ctx.fillStyle = ballGrad;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(1, fallRadius), 0, Math.PI * 2);
          ctx.fill();

          // Outer incandescent rim
          ctx.strokeStyle = fall.hasHitLava ? '#ffe600' : fall.glowIntensity > 0 ? '#ff5500' : '#00f3ff';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = fall.hasHitLava ? 12 : 6;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Rolling star crosshair
          ctx.strokeStyle = fall.hasHitLava ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-fallRadius + 2, 0);
          ctx.lineTo(fallRadius - 2, 0);
          ctx.stroke();

          ctx.restore();
        }

        // 9. Update & Draw Particles (Sparkles, Sparks, Embers, Splashes, Smoke, Ripples)
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          if (p.type === 'splash') {
            p.vy += 520 * dt; // Gravity pulls splash droplets down
            p.alpha -= dt * 1.2;
            p.radius = Math.max(0.5, p.radius * 0.97);
          } else if (p.type === 'smoke') {
            p.vy -= 25 * dt; // Steam floats upwards
            p.alpha -= dt * 0.9;
            p.radius += dt * 10; // Expands outward
          } else if (p.type === 'ripple') {
            p.radius += dt * 70; // Expands outward across lava
            p.alpha -= dt * 1.5;
          } else {
            p.alpha -= dt * 1.8;
            p.radius = Math.max(0.5, p.radius * 0.96);
          }

          if (p.alpha <= 0) {
            // O(1) swap with last element and pop (avoids array shifting overhead)
            const lastIdx = particlesRef.current.length - 1;
            if (i < lastIdx) {
              particlesRef.current[i] = particlesRef.current[lastIdx];
            }
            particlesRef.current.pop();
            continue;
          }

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);

          if (p.type === 'ripple') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.radius * 1.8, p.radius * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.type === 'smoke') {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Fast particle fill
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 10. Warp Flash Burst
        if (engine.portalWarpAnimation > 0) {
          ctx.fillStyle = `rgba(0, 243, 255, ${engine.portalWarpAnimation * 0.4})`;
          ctx.fillRect(0, 0, width, height);
        }

        // 11. Bouncy 3-Second Retro Arcade Countdown
        if (engine.state === 'COUNTDOWN') {
          const remaining = engine.countdownTimer;
          const count = Math.ceil(remaining);

          ctx.fillStyle = 'rgba(7, 3, 18, 0.72)';
          ctx.fillRect(0, 0, width, height);

          ctx.save();
          ctx.translate(width / 2, height / 2 - 25);

          // Scaling bounce effect based on fractional remaining
          const frac = remaining - Math.floor(remaining);
          const bounceScale = 1.0 + Math.sin(frac * Math.PI) * 0.22;
          ctx.scale(bounceScale, bounceScale);

          // Big Glowing Count Text
          ctx.font = count > 0 ? "700 56px 'Press Start 2P', monospace" : "700 42px 'Press Start 2P', monospace";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const textColor = count === 3 ? '#ffe600' : count === 2 ? '#00f3ff' : '#39ff14';
          ctx.fillStyle = textColor;
          ctx.shadowColor = textColor;
          ctx.shadowBlur = 24;
          ctx.fillText(count > 0 ? `${count}` : 'ROLL!', 0, 0);
          ctx.shadowBlur = 0;

          ctx.restore();

          // Friendly guidance subtitle
          ctx.fillStyle = '#ffffff';
          ctx.font = "600 11px 'Press Start 2P', monospace";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const guidance =
            count === 3
              ? 'HOLD HANDS LEVEL!'
              : count === 2
              ? 'CENTERING STANCE...'
              : 'GET READY TO CLIMB!';
          ctx.fillText(guidance, width / 2, height / 2 + 50);
        }

        // 12. Animated Celebratory Stage Promotion Fanfare
        if (engine.promotionBannerTimer > 0) {
          const pTimer = engine.promotionBannerTimer;
          const bannerAlpha = pTimer > 3.0 ? (3.5 - pTimer) * 2 : Math.min(1, pTimer / 0.5);
          const bannerY = height * 0.35 + Math.sin(time * 0.006) * 4;

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, bannerAlpha));

          // Starburst particles
          if (Math.random() < 0.3) {
            particlesRef.current.push({
              x: width / 2 + (Math.random() - 0.5) * 360,
              y: bannerY + (Math.random() - 0.5) * 50,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              radius: Math.random() * 3 + 2,
              alpha: 1,
              color: Math.random() < 0.5 ? '#ffe600' : '#00f3ff',
              type: 'star',
            });
          }

          // Translucent Banner Box
          const bannerW = 540;
          const bannerH = 74;
          ctx.fillStyle = 'rgba(8, 2, 22, 0.94)';
          ctx.beginPath();
          ctx.roundRect(width / 2 - bannerW / 2, bannerY - bannerH / 2, bannerW, bannerH, 10);
          ctx.fill();

          ctx.strokeStyle = '#ffe600';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 18;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Header Text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = "700 13px 'Press Start 2P', monospace";
          ctx.fillStyle = '#ffe600';
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 10;
          ctx.fillText('★ STAGE CLEAR! PROMOTION! ★', width / 2, bannerY - 14);
          ctx.shadowBlur = 0;

          // Promoted Sector Subtitle
          ctx.font = "700 10px 'Press Start 2P', monospace";
          ctx.fillStyle = '#00f3ff';
          ctx.shadowColor = '#00f3ff';
          ctx.shadowBlur = 8;
          ctx.fillText(`ENTERING: ${engine.promotedSectorName}`, width / 2, bannerY + 8);
          ctx.shadowBlur = 0;

          // Bonus shield note
          ctx.font = "600 7px 'Press Start 2P', monospace";
          ctx.fillStyle = '#39ff14';
          ctx.fillText('BONUS SHIELD ACTIVATED!', width / 2, bannerY + 23);

          ctx.restore();
        }

        ctx.restore(); // Restore shake transform
        animationFrameId = requestAnimationFrame(render);
      };

      animationFrameId = requestAnimationFrame(render);
      return () => cancelAnimationFrame(animationFrameId);
    }, [engine]);

    return (
      <div
        className="crt-overlay"
        style={{
          position: 'relative',
          width: '780px',
          height: '660px',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 0 25px rgba(168, 85, 247, 0.35)',
          border: '2px solid #5b21b6',
          background: '#070210',
          flexShrink: 0,
        }}
      >
        <canvas ref={canvasRef} width={780} height={660} style={{ display: 'block' }} />

        {/* Retro Arcade Playfield HUD */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '18px',
            right: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
            fontFamily: "'Press Start 2P', monospace",
            zIndex: 12,
          }}
        >
          {/* Stage & Altitude Badge */}
          <div
            style={{
              background: 'rgba(17, 7, 36, 0.9)',
              border: '2px solid #3b176d',
              padding: '6px 14px',
              borderRadius: '8px',
              boxShadow: '0 0 10px rgba(0, 243, 255, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            <div style={{ fontSize: '0.45rem', color: '#ffe600', letterSpacing: '1px' }}>
              STAGE 0{stats.sectorLevel}: {stats.sectorName}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#ffffff' }}>
                {stats.altitudeMeters}m
              </span>
              {stats.metersToNextGate > 0 && (
                <span style={{ fontSize: '0.45rem', color: '#00f3ff' }}>
                  GATE {stats.metersToNextGate}m
                </span>
              )}
            </div>
          </div>

          {/* Center HUD: Hand Lock Status & Shield Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isHandTrackingActive && (
              <div
                style={{
                  background: isHandLockActive ? 'rgba(5, 78, 59, 0.92)' : 'rgba(120, 53, 15, 0.92)',
                  border: `2px solid ${isHandLockActive ? '#10b981' : '#f59e0b'}`,
                  padding: '5px 12px',
                  borderRadius: '20px',
                  color: '#ffffff',
                  fontSize: '0.48rem',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isHandLockActive ? '0 0 10px rgba(16, 185, 129, 0.45)' : 'none',
                }}
              >
                <span>{isHandLockActive ? '🔒 HAND LOCK: ON' : '⚠️ CALIBRATING'}</span>
                <span style={{ fontSize: '0.40rem', color: '#a7f3d0' }}>[C] RE-LOCK</span>
              </div>
            )}

            {stats.isShieldActive && (
              <div
                style={{
                  background: stats.shieldTimer < 1.2
                    ? (Math.floor(Date.now() / 150) % 2 === 0 ? 'rgba(255, 0, 127, 0.95)' : 'rgba(255, 230, 0, 0.95)')
                    : 'rgba(2, 132, 199, 0.9)',
                  border: `2px solid ${stats.shieldTimer < 1.2 ? '#ffffff' : '#00f3ff'}`,
                  padding: '6px 16px',
                  borderRadius: '20px',
                  color: stats.shieldTimer < 1.2 ? '#000000' : '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '0.62rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: stats.shieldTimer < 1.2 ? '0 0 16px #ff007f' : '0 0 14px #00f3ff',
                  letterSpacing: '0.5px',
                }}
              >
                🛡️ {stats.shieldTimer < 1.2 ? 'EXPIRING!' : 'SHIELD'} {stats.shieldTimer.toFixed(1)}s
              </div>
            )}
          </div>

          {/* Lava Distance Badge */}
          <div
            style={{
              background: 'rgba(17, 7, 36, 0.9)',
              border: `2px solid ${
                floorGapMeters < 3 ? '#ff007f' : floorGapMeters < 6 ? '#ffaa00' : '#3b176d'
              }`,
              padding: '6px 14px',
              borderRadius: '8px',
              boxShadow: floorGapMeters < 3 ? '0 0 12px rgba(255, 0, 127, 0.6)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              textAlign: 'right',
            }}
          >
            <div
              style={{
                fontSize: '0.45rem',
                color: floorGapMeters < 3 ? '#ff007f' : '#ffaa00',
              }}
            >
              LAVA GAP
            </div>
            <div
              style={{
                fontSize: '0.92rem',
                fontWeight: 'bold',
                color: floorGapMeters < 3 ? '#ff007f' : floorGapMeters < 6 ? '#ffaa00' : '#39ff14',
              }}
            >
              {floorGapMeters}m
            </div>
          </div>
        </div>

        {/* Start / Attract Mode Screen */}
        {gameState !== 'PLAYING' &&
          gameState !== 'COUNTDOWN' &&
          gameState !== 'PAUSED' &&
          gameState !== 'GAME_OVER' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(8, 2, 18, 0.94)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '20px',
                padding: '30px',
                textAlign: 'center',
                zIndex: 20,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.62rem',
                    letterSpacing: '2px',
                    color: '#ffe600',
                    textShadow: '0 0 8px rgba(255, 230, 0, 0.6)',
                  }}
                >
                  ★ 1983 ARCADE REVIVAL ★
                </div>
                <h1
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '1.9rem',
                    letterSpacing: '3px',
                    color: '#ffffff',
                    margin: 0,
                    textShadow: '0 0 10px #00f3ff, 0 0 20px #ff007f',
                  }}
                >
                  SKYWARD ROLL
                </h1>
              </div>

              {/* 3 Step Arcade Tutorial Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '14px',
                  maxWidth: '520px',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    background: 'rgba(23, 10, 48, 0.9)',
                    border: '2px solid #5b21b6',
                    borderRadius: '10px',
                    padding: '12px 10px',
                    boxShadow: '0 0 10px rgba(139, 92, 246, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>👐</div>
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '0.58rem',
                      color: '#00f3ff',
                    }}
                  >
                    1. HANDS UP
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '6px' }}>
                    Hold both hands in camera view
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(23, 10, 48, 0.9)',
                    border: '2px solid #5b21b6',
                    borderRadius: '10px',
                    padding: '12px 10px',
                    boxShadow: '0 0 10px rgba(139, 92, 246, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>⚖️</div>
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '0.58rem',
                      color: '#39ff14',
                    }}
                  >
                    2. TILT TO ROLL
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '6px' }}>
                    Raise left or right to balance & dodge pits
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(23, 10, 48, 0.9)',
                    border: '2px solid #5b21b6',
                    borderRadius: '10px',
                    padding: '12px 10px',
                    boxShadow: '0 0 10px rgba(139, 92, 246, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>⭐</div>
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '0.58rem',
                      color: '#ffe600',
                    }}
                  >
                    3. HIT WARPS
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '6px' }}>
                    Jump ahead +7m and escape rising lava!
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
                <button
                  onClick={onStartGame}
                  style={{
                    background: isCalibrated
                      ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)'
                      : 'linear-gradient(180deg, #059669 0%, #065f46 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px 34px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.8rem',
                    letterSpacing: '1px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 0 #065f46, 0 0 20px rgba(16, 185, 129, 0.6)',
                    transition: 'all 0.08s ease',
                  }}
                >
                  {isCalibrated ? '★ START GAME ★' : '★ CALIBRATE & START ★'}
                </button>
                <button
                  onClick={onSkipCalibrationAndStart}
                  style={{
                    background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px 24px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.68rem',
                    letterSpacing: '0.5px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 0 #1e3a8a',
                  }}
                >
                  QUICK PLAY
                </button>
                {onOpenHowToPlay && (
                  <button
                    onClick={onOpenHowToPlay}
                    style={{
                      background: 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '14px 20px',
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '0.68rem',
                      letterSpacing: '0.5px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 0 #5b21b6',
                    }}
                  >
                    📖 MANUAL
                  </button>
                )}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Tip: Show open palm ✋ to camera or press <kbd>Space</kbd> anytime to pause.
              </div>
            </div>
          )}

        {/* Paused Overlay */}
        {gameState === 'PAUSED' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8, 2, 18, 0.92)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '24px',
              textAlign: 'center',
              zIndex: 20,
            }}
          >
            <div style={{ fontSize: '3rem' }}>✋</div>
            <h2
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '1.5rem',
                letterSpacing: '2px',
                color: '#ffe600',
                margin: 0,
                textShadow: '0 0 14px rgba(255, 230, 0, 0.6)',
              }}
            >
              GAME PAUSED
            </h2>
            <p style={{ color: '#cbd5e1', margin: 0, fontSize: '0.85rem' }}>
              Hold single palm ✋ to camera or press <kbd>Space</kbd> to resume
            </p>
            <button
              onClick={onTogglePause}
              style={{
                marginTop: '12px',
                background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '12px 32px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.72rem',
                letterSpacing: '1px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 3px 0 #065f46',
              }}
            >
              RESUME PLAY
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'GAME_OVER' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8, 2, 18, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '24px',
              textAlign: 'center',
              zIndex: 20,
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.62rem',
                letterSpacing: '2px',
                color: '#ff007f',
                textTransform: 'uppercase',
              }}
            >
              RUN FINISHED
            </div>
            <h2
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '2rem',
                letterSpacing: '3px',
                color: '#ffffff',
                margin: 0,
                textShadow: '0 0 12px #ff007f, 0 0 24px #ff007f',
              }}
            >
              GAME OVER
            </h2>

            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.65rem',
                color: '#ffe600',
                background: 'rgba(43, 0, 26, 0.9)',
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid #ff007f',
              }}
            >
              {stats.deathReason === 'HOLE_FALL'
                ? '💀 OOPS! FELL INTO A HAZARD PIT!'
                : stats.deathReason === 'EDGE_FALL'
                ? '⚡ SLIPPED OFF THE TILT BAR!'
                : '🔥 CAUGHT BY RISING LAVA! 🔥'}
            </div>

            {/* Stage Level Badge */}
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.60rem',
                color: '#00f3ff',
                background: 'rgba(10, 3, 22, 0.85)',
                border: '1px solid #7c3aed',
                padding: '6px 14px',
                borderRadius: '6px',
                boxShadow: '0 0 10px rgba(0, 243, 255, 0.3)',
              }}
            >
              ★ REACHED: STAGE 0{stats.sectorLevel} ({stats.sectorName}) ★
            </div>

            {/* Scorecard */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginTop: '8px',
                width: '78%',
              }}
            >
              <div
                style={{
                  background: '#130728',
                  border: '2px solid #5b21b6',
                  padding: '12px',
                  borderRadius: '10px',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.52rem',
                    color: '#00f3ff',
                    marginBottom: '6px',
                  }}
                >
                  HEIGHT
                </div>
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '1rem',
                    color: '#ffffff',
                  }}
                >
                  {stats.altitudeMeters}m
                </div>
              </div>

              <div
                style={{
                  background: '#130728',
                  border: '2px solid #5b21b6',
                  padding: '12px',
                  borderRadius: '10px',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.52rem',
                    color: '#ffe600',
                    marginBottom: '6px',
                  }}
                >
                  RECORD
                </div>
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '1rem',
                    color: '#ffe600',
                  }}
                >
                  {stats.bestAltitudeMeters}m
                </div>
              </div>

              <div
                style={{
                  background: '#130728',
                  border: '2px solid #5b21b6',
                  padding: '12px',
                  borderRadius: '10px',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.52rem',
                    color: '#ff007f',
                    marginBottom: '6px',
                  }}
                >
                  WARPS
                </div>
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '1rem',
                    color: '#ff007f',
                  }}
                >
                  ⭐ {stats.portalsUsed}
                </div>
              </div>
            </div>

            <button
              onClick={onRestart}
              style={{
                marginTop: '12px',
                background: 'linear-gradient(180deg, #ec4899 0%, #be185d 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '14px 38px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.8rem',
                letterSpacing: '1px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 0 #9d174d, 0 0 16px rgba(236, 72, 153, 0.6)',
              }}
            >
              ★ PLAY AGAIN ★
            </button>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.tiltAngleRad !== next.tiltAngleRad) {
      next.engine.setTiltAngle(next.tiltAngleRad);
    }
    return (
      prev.isCalibrated === next.isCalibrated &&
      prev.engine === next.engine &&
      prev.onStartGame === next.onStartGame &&
      prev.onSkipCalibrationAndStart === next.onSkipCalibrationAndStart &&
      prev.onRestart === next.onRestart &&
      prev.onTogglePause === next.onTogglePause &&
      prev.isHandTrackingActive === next.isHandTrackingActive &&
      prev.onOpenHowToPlay === next.onOpenHowToPlay
    );
  }
);
