import { LevelGenerator, getSectorForAltitude } from './levelGenerator';
import type { ChunkRow } from './levelGenerator';
import { updateBallPhysics, DEFAULT_PHYSICS_CONFIG } from './physics';
import type { Ball, Bar, PhysicsConfig } from './physics';

export type GameState = 'CALIBRATING' | 'READY' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type DeathReason = 'HOLE_FALL' | 'RISING_FLOOR' | 'EDGE_FALL' | null;

export interface BallLavaFall {
  worldX: number; // In playfield coordinate space (0 to barWidth)
  worldY: number; // World altitude px
  vx: number;     // px/s horizontal velocity
  vy: number;     // px/s vertical velocity in world altitude (negative = falling downwards toward floorAltitudePx)
  rotationRad: number;
  rotationSpeed: number;
  hasHitLava: boolean;
  lavaSplashPending: boolean; // One-shot flag for canvas to trigger particle burst & screen shake
  lavaSplashTimer: number; // 0 to ~0.85s after touching lava
  scale: number;           // 1 down to ~0.1 as it sinks
  glowIntensity: number;   // 0 to 1 heat glow
}

export interface GameStats {
  altitudeMeters: number;
  bestAltitudeMeters: number;
  deathReason: DeathReason;
  portalsUsed: number;
  timeElapsed: number;
  shieldTimer: number;
  isShieldActive: boolean;
  countdownTimer: number;
  countdownSeconds: number;
  // Sector Level Progression Metrics
  sectorIndex: number;
  sectorLevel: number;
  sectorName: string;
  sectorCode: string;
  sectorProgress: number; // 0.0 to 1.0
  nextGateAltitudeMeters: number;
  metersToNextGate: number;
  highestSectorReached: number;
  promotionBannerTimer: number;
  promotedSectorName: string;
}

export interface GameEngineConfig {
  barWidth: number;
  barHeight: number;
  ballRadius: number;
  initialAscentSpeed: number; // px/s
  floorInitialGap: number; // px below bar at start
  floorBaseSpeed: number; // px/s
  floorAcceleration: number; // speed increase per 100m altitude
  pixelsPerMeter: number; // e.g. 50px = 1 meter
  physicsConfig: PhysicsConfig;
}

export const DEFAULT_ENGINE_CONFIG: GameEngineConfig = {
  barWidth: 700,
  barHeight: 14,
  ballRadius: 10,
  initialAscentSpeed: 70,
  floorInitialGap: 380,
  floorBaseSpeed: 50,
  floorAcceleration: 4,
  pixelsPerMeter: 50,
  physicsConfig: DEFAULT_PHYSICS_CONFIG,
};

export class GameEngine {
  public state: GameState = 'CALIBRATING';
  public deathReason: DeathReason = null;
  public onStateChange?: (state: GameState) => void;

  public changeState(newState: GameState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  public bar: Bar;
  public ball: Ball;
  public rows: ChunkRow[] = [];
  public altitudePx: number = 0;
  public floorAltitudePx: number = 0;
  public bestAltitudePx: number = 0;

  public portalsUsed: number = 0;
  public timeElapsed: number = 0;
  public portalWarpAnimation: number = 0;
  public shieldTimer: number = 0; // Invulnerability countdown
  public countdownTimer: number = 0; // 3-second countdown on start/restart
  public currentSectorIndex: number = 0;
  public highestSectorReached: number = 1;
  public promotionBannerTimer: number = 0;
  public promotedSectorName: string = '';
  public graceHoles: Set<string> = new Set(); // Holes entered under active shield protection
  public lavaFall: BallLavaFall | null = null;

  private generator: LevelGenerator;
  private config: GameEngineConfig;

  constructor(config: Partial<GameEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.generator = new LevelGenerator({ barWidth: this.config.barWidth, slotCount: 10 });

    this.ball = {
      x: this.config.barWidth / 2,
      radius: this.config.ballRadius,
      velocity: 0,
      rotationRad: 0,
      isFalling: false,
      fallProgress: 0,
    };

    this.bar = {
      width: this.config.barWidth,
      height: this.config.barHeight,
      worldY: 0,
      angleRad: 0,
      targetAngleRad: 0,
      holes: [],
    };

    this.reset();
  }

  public reset(): void {
    this.ball = {
      x: this.config.barWidth / 2,
      radius: this.config.ballRadius,
      velocity: 0,
      rotationRad: 0,
      isFalling: false,
      fallProgress: 0,
    };

    this.bar = {
      width: this.config.barWidth,
      height: this.config.barHeight,
      worldY: 0,
      angleRad: 0,
      targetAngleRad: 0,
      holes: [],
    };

    this.altitudePx = 0;
    this.floorAltitudePx = -this.config.floorInitialGap;
    this.deathReason = null;
    this.lavaFall = null;
    this.portalsUsed = 0;
    this.timeElapsed = 0;
    this.portalWarpAnimation = 0;
    this.shieldTimer = 0;
    this.currentSectorIndex = 0;
    this.promotionBannerTimer = 0;
    this.promotedSectorName = '';
    this.graceHoles.clear();

    // Reset level generator and generate initial obstacle buffer
    this.generator.reset(140);
    this.rows = this.generator.generateUpTo(1600, []);
  }

  public startGame(): void {
    this.reset();
    this.changeState('COUNTDOWN');
    this.countdownTimer = 3.2; // 3 seconds plus brief "GO!"
  }

  public pause(): void {
    if (this.state === 'PLAYING') {
      this.changeState('PAUSED');
    }
  }

  public resume(): void {
    if (this.state === 'PAUSED') {
      this.changeState('PLAYING');
    }
  }

  public togglePause(): void {
    if (this.state === 'PLAYING') {
      this.changeState('PAUSED');
    } else if (this.state === 'PAUSED') {
      this.changeState('PLAYING');
    }
  }

  public setTiltAngle(targetAngleRad: number): void {
    this.bar.targetAngleRad = targetAngleRad;
  }

  public update(dt: number): void {
    // Smooth mechanical angular interpolation runs continuously so bar reflects hand tilt
    const angleDiff = this.bar.targetAngleRad - this.bar.angleRad;
    const tiltLerpSpeed = 15; // Smooth mechanical responsiveness
    this.bar.angleRad += angleDiff * Math.min(1, tiltLerpSpeed * dt);

    // Handle 3-second countdown before climb starts
    if (this.state === 'COUNTDOWN') {
      this.countdownTimer = Math.max(0, this.countdownTimer - dt);
      // Keep ball centered at rest during countdown
      this.ball.x = this.config.barWidth / 2;
      this.ball.velocity = 0;

      if (this.countdownTimer <= 0) {
        this.countdownTimer = 0;
        this.changeState('PLAYING');
      }
      return;
    }

    if (this.state !== 'PLAYING') {
      return;
    }

    this.timeElapsed += dt;

    if (this.portalWarpAnimation > 0) {
      this.portalWarpAnimation = Math.max(0, this.portalWarpAnimation - dt);
    }

    if (this.shieldTimer > 0) {
      this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    }

    // A. If ball is in lava plunge sequence, update falling and sinking physics
    if (this.lavaFall) {
      const fall = this.lavaFall;
      const gravity = 1900; // px/s^2 downwards towards lower altitude (lava)

      if (!fall.hasHitLava) {
        // Falling through the air towards the molten lava
        fall.vy -= gravity * dt;
        fall.worldY += fall.vy * dt;
        fall.worldX += fall.vx * dt;
        fall.rotationRad += fall.rotationSpeed * dt;
        fall.vx *= Math.pow(0.985, dt * 60);

        // Pre-impact thermal incandescent glow as it nears the hot magma
        const distToLava = fall.worldY - this.floorAltitudePx;
        if (distToLava < 180) {
          fall.glowIntensity = Math.min(0.85, Math.max(0, (180 - distToLava) / 180));
        }

        // Did it reach or cross the lava surface?
        if (fall.worldY <= this.floorAltitudePx) {
          fall.hasHitLava = true;
          fall.lavaSplashPending = true;
          fall.worldY = this.floorAltitudePx;
          fall.vy = -30; // Viscous resistance in thick lava
          fall.vx *= 0.15;
          fall.glowIntensity = 1.0;
        }
      } else {
        // Sinking into the boiling molten magma
        fall.lavaSplashTimer += dt;
        fall.worldY -= 35 * dt; // Slow viscous sink
        fall.scale = Math.max(0.08, 1 - (fall.lavaSplashTimer / 0.85) * 0.75);
        fall.glowIntensity = 1.0;

        // Lava floor continues slight bubbling/rising
        this.floorAltitudePx += this.config.floorBaseSpeed * 0.25 * dt;

        if (fall.lavaSplashTimer >= 0.85) {
          this.triggerDeath(this.deathReason ?? 'RISING_FLOOR');
          return;
        }
      }
      return;
    }

    // 1. Ascent progression (unless falling into a hole)
    if (!this.ball.isFalling) {
      const currentMeters = this.altitudePx / this.config.pixelsPerMeter;
      const speedMultiplier = 1 + (currentMeters / 100) * 0.12;
      const currentAscentSpeed = this.config.initialAscentSpeed * speedMultiplier;
      this.altitudePx += currentAscentSpeed * dt;
      this.bar.worldY = this.altitudePx;

      if (this.altitudePx > this.bestAltitudePx) {
        this.bestAltitudePx = this.altitudePx;
      }

      // 2. Rising floor progression
      const floorSpeed =
        (this.config.floorBaseSpeed + (currentMeters / 100) * this.config.floorAcceleration) *
        speedMultiplier;
      this.floorAltitudePx += floorSpeed * dt;

      // Rising floor death condition: floor catches up to bar -> consume into lava!
      if (this.floorAltitudePx >= this.altitudePx) {
        this.startLavaFall('RISING_FLOOR');
        return;
      }

      // Track Sector Level progression
      const activeSector = getSectorForAltitude(currentMeters);
      if (activeSector.index > this.currentSectorIndex) {
        this.currentSectorIndex = activeSector.index;
        if (activeSector.levelNumber > this.highestSectorReached) {
          this.highestSectorReached = activeSector.levelNumber;
          this.promotionBannerTimer = 3.5;
          this.promotedSectorName = activeSector.name;
          this.shieldTimer = Math.max(this.shieldTimer, 2.5); // Bonus shield protection on stage promotion
        }
      }
    }

    if (this.promotionBannerTimer > 0) {
      this.promotionBannerTimer = Math.max(0, this.promotionBannerTimer - dt);
    }

    // 3. Populate obstacle rows ahead
    this.rows = this.generator.generateUpTo(this.altitudePx + 1200, this.rows);

    // In-place zero-allocation row pruning from front of sorted row array
    const cutoffY = this.floorAltitudePx - 200;
    while (this.rows.length > 0 && this.rows[0].worldY <= cutoffY) {
      this.rows.shift();
    }

    // 4. Update ball rolling physics
    const collision = updateBallPhysics(this.ball, this.bar, this.config.physicsConfig, dt);

    if (collision.type === 'EDGE_FALL') {
      const isLeft = collision.edge === 'LEFT';
      const cosTheta = Math.cos(this.bar.angleRad);
      const sinTheta = Math.sin(this.bar.angleRad);
      const edgeX = isLeft ? 0 : this.config.barWidth;
      const s = edgeX - this.config.barWidth / 2;
      const ballOffsetNormal = -(this.config.barHeight / 2 + this.ball.radius);
      const edgeWorldX = this.config.barWidth / 2 + s * cosTheta - ballOffsetNormal * sinTheta;
      const edgeWorldY = this.altitudePx - s * sinTheta - ballOffsetNormal * cosTheta;

      this.startLavaFall('EDGE_FALL', edgeWorldX, edgeWorldY, isLeft ? -110 : 110, -60);
      return;
    }

    // 5. Accurate 2D Hole Collision Detection based on real ball world coordinates
    if (!this.ball.isFalling) {
      this.check2DObstacleCollisions();
    }
  }

  /**
   * Initiates realistic free-fall of the ball into the bubbling molten lava below.
   */
  public startLavaFall(
    reason: DeathReason,
    startWorldX?: number,
    startWorldY?: number,
    initialVx: number = 0,
    initialVy: number = -60
  ): void {
    if (this.lavaFall) return;

    const s = this.ball.x - this.config.barWidth / 2;
    const cosTheta = Math.cos(this.bar.angleRad);
    const sinTheta = Math.sin(this.bar.angleRad);
    const ballOffsetNormal = -(this.config.barHeight / 2 + this.ball.radius);

    const defaultWorldX = this.config.barWidth / 2 + s * cosTheta - ballOffsetNormal * sinTheta;
    const defaultWorldY = this.altitudePx - s * sinTheta - ballOffsetNormal * cosTheta;

    const wx = startWorldX ?? defaultWorldX;
    const wy = startWorldY ?? defaultWorldY;

    this.deathReason = reason;
    this.ball.isFalling = true;

    const isAlreadyAtLava = wy <= this.floorAltitudePx + 8;

    this.lavaFall = {
      worldX: wx,
      worldY: wy,
      vx: initialVx || this.ball.velocity * cosTheta * 0.35,
      vy: isAlreadyAtLava ? -25 : initialVy,
      rotationRad: this.ball.rotationRad,
      rotationSpeed: this.ball.velocity / (this.ball.radius || 10),
      hasHitLava: isAlreadyAtLava,
      lavaSplashPending: isAlreadyAtLava,
      lavaSplashTimer: 0,
      scale: 1,
      glowIntensity: isAlreadyAtLava ? 0.7 : 0,
    };
  }

  /**
   * Performs true 2D ellipse distance check between ball center and obstacle holes.
   * Matches exact rendered canvas coordinates so the entire visible red hole is deadly.
   */
  private check2DObstacleCollisions(): void {
    const s = this.ball.x - this.config.barWidth / 2;
    const cosTheta = Math.cos(this.bar.angleRad);
    const sinTheta = Math.sin(this.bar.angleRad);

    // Exact ball center offset in world space (including bar half-height + ball radius)
    const ballOffsetNormal = -(this.config.barHeight / 2 + this.ball.radius); // -17px
    const ballWorldX = this.config.barWidth / 2 + s * cosTheta - ballOffsetNormal * sinTheta;
    const ballWorldY = this.altitudePx - s * sinTheta - ballOffsetNormal * cosTheta;

    let isCurrentlyOverHole = false;

    // Check only adjacent obstacle rows within reach (fast early-out on sorted array)
    for (const row of this.rows) {
      if (row.worldY < ballWorldY - 34) continue; // Below reach
      if (row.worldY > ballWorldY + 34) break; // Sorted array: all subsequent rows are higher, stop early!

      const deltaY = ballWorldY - row.worldY;
      if (Math.abs(deltaY) > 32) continue; // Not vertically near this row

      for (const slot of row.slots) {
        const holeCenterX = (slot.startX + slot.endX) / 2;
        const deltaX = ballWorldX - holeCenterX;

        const rx = (slot.endX - slot.startX) / 2;
        const ry = 15; // Matches hole radius on canvas

        // Any area of the colored hole/portal is active:
        // Expanded by ball radius so touching ANY part of the red rim or hole triggers death/warp!
        const touchRx = rx + this.ball.radius * 0.85;
        const touchRy = ry + this.ball.radius * 0.85;

        const distSq = (deltaX / touchRx) ** 2 + (deltaY / touchRy) ** 2;

        // If ball touches ANY part of the colored area:
        if (distSq <= 1.0) {
          isCurrentlyOverHole = true;
          const holeKey = `${row.id}-${slot.slotIndex}`;

          if (slot.isPortal) {
            this.triggerPortalWarp();
            return;
          } else {
            // Deadly hole: check if invulnerability shield is active
            if (this.shieldTimer > 0) {
              // Add to grace holes so ball safely completes crossing even if timer expires mid-hole
              this.graceHoles.add(holeKey);
              return;
            }

            // Was this hole entered under active shield protection? (Grace clearance)
            if (this.graceHoles.has(holeKey)) {
              return;
            }

            // Ball drops through the hazard pit and plummets into the molten lava below!
            this.startLavaFall('HOLE_FALL', holeCenterX, row.worldY, this.ball.velocity * 0.35, -140);
            return;
          }
        }
      }
    }

    // Ball is clear of all holes; reset grace tracking
    if (!isCurrentlyOverHole && this.graceHoles.size > 0) {
      this.graceHoles.clear();
    }
  }

  private triggerDeath(reason: DeathReason): void {
    this.deathReason = reason;
    this.changeState('GAME_OVER');
  }

  private triggerPortalWarp(): void {
    const warpDistance = 350; // +7m
    const targetAltitude = this.altitudePx + warpDistance;

    // Guarantee a generous safe landing zone without holes
    this.generator.addSafeZone(targetAltitude, 180);

    this.altitudePx = targetAltitude;
    this.bar.worldY = this.altitudePx;
    this.portalsUsed++;
    this.portalWarpAnimation = 0.7; // Visual flash burst
    this.shieldTimer = 3.5; // Generous 3.5s shield after warp!

    // Reset ball velocity for stable re-entry
    this.ball.velocity = 0;
  }

  public get stats(): GameStats {
    const altitudeMeters = Math.floor(this.altitudePx / this.config.pixelsPerMeter);
    const sector = getSectorForAltitude(altitudeMeters);
    const sectorSpan = sector.maxAltitudeMeters - sector.minAltitudeMeters;
    const sectorProgress =
      Number.isFinite(sectorSpan) && sectorSpan > 0
        ? Math.min(1, Math.max(0, (altitudeMeters - sector.minAltitudeMeters) / sectorSpan))
        : 1;
    const nextGateAltitudeMeters = Number.isFinite(sector.maxAltitudeMeters)
      ? sector.maxAltitudeMeters
      : altitudeMeters;
    const metersToNextGate = Math.max(0, nextGateAltitudeMeters - altitudeMeters);

    return {
      altitudeMeters,
      bestAltitudeMeters: Math.floor(this.bestAltitudePx / this.config.pixelsPerMeter),
      deathReason: this.deathReason,
      portalsUsed: this.portalsUsed,
      timeElapsed: Math.floor(this.timeElapsed),
      shieldTimer: this.shieldTimer,
      isShieldActive: this.shieldTimer > 0,
      countdownTimer: this.countdownTimer,
      countdownSeconds: Math.ceil(this.countdownTimer),
      sectorIndex: sector.index,
      sectorLevel: sector.levelNumber,
      sectorName: sector.name,
      sectorCode: sector.sectorCode,
      sectorProgress,
      nextGateAltitudeMeters,
      metersToNextGate,
      highestSectorReached: this.highestSectorReached,
      promotionBannerTimer: this.promotionBannerTimer,
      promotedSectorName: this.promotedSectorName,
    };
  }

  public get floorGap(): number {
    return Math.max(0, this.altitudePx - this.floorAltitudePx);
  }
}
