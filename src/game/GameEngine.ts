import { LevelGenerator } from './levelGenerator';
import type { ChunkRow } from './levelGenerator';
import { updateBallPhysics, DEFAULT_PHYSICS_CONFIG } from './physics';
import type { Ball, Bar, PhysicsConfig } from './physics';

export type GameState = 'CALIBRATING' | 'READY' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type DeathReason = 'HOLE_FALL' | 'RISING_FLOOR' | null;

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
  barWidth: 540,
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

  private generator: LevelGenerator;
  private config: GameEngineConfig;

  constructor(config: Partial<GameEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.generator = new LevelGenerator({ barWidth: this.config.barWidth });

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
    this.portalsUsed = 0;
    this.timeElapsed = 0;
    this.portalWarpAnimation = 0;
    this.shieldTimer = 0;

    // Reset level generator and generate initial obstacle buffer
    this.generator.reset(140);
    this.rows = this.generator.generateUpTo(1600, []);
  }

  public startGame(): void {
    this.reset();
    this.state = 'COUNTDOWN';
    this.countdownTimer = 3.2; // 3 seconds plus brief "GO!"
  }

  public pause(): void {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
    }
  }

  public resume(): void {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
    }
  }

  public togglePause(): void {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
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
        this.state = 'PLAYING';
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

      // Rising floor death condition: floor catches up to bar
      if (this.floorAltitudePx >= this.altitudePx) {
        this.triggerDeath('RISING_FLOOR');
        return;
      }
    }

    // 3. Populate obstacle rows ahead
    this.rows = this.generator.generateUpTo(this.altitudePx + 1200, this.rows);

    // Prune rows far below rising floor
    this.rows = this.rows.filter((r) => r.worldY > this.floorAltitudePx - 200);

    // 4. Update ball rolling physics
    updateBallPhysics(this.ball, this.bar, this.config.physicsConfig, dt);

    // Check if falling animation finished
    if (this.ball.isFalling && this.ball.fallProgress >= 1) {
      this.triggerDeath('HOLE_FALL');
      return;
    }

    // 5. Accurate 2D Hole Collision Detection based on real ball world coordinates
    if (!this.ball.isFalling) {
      this.check2DObstacleCollisions();
    }
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

    // Check all obstacle rows within reach
    for (const row of this.rows) {
      const deltaY = ballWorldY - row.worldY;
      if (Math.abs(deltaY) > 32) continue; // Not vertically near this row

      for (const slot of row.slots) {
        const holeCenterX = (slot.startX + slot.endX) / 2;
        const deltaX = ballWorldX - holeCenterX;

        const rx = (slot.endX - slot.startX) / 2;
        const ry = 15; // Matches hole radius on canvas

        // Normalized distance squared inside the visible hole ellipse
        const distSq = (deltaX / rx) ** 2 + (deltaY / ry) ** 2;

        // The entire visible red hole (distSq <= 1.0) is deadly!
        if (distSq <= 1.0) {
          if (slot.isPortal) {
            this.triggerPortalWarp();
            return;
          } else {
            // Deadly hole: check if invulnerability shield is active
            if (this.shieldTimer > 0) {
              // Protected by warp shield!
              return;
            }

            // Ball drops into hole with suck-in animation
            this.ball.isFalling = true;
            this.ball.fallProgress = 0;
            this.ball.fallTargetX = holeCenterX;
            this.ball.fallTargetY = row.worldY;
            return;
          }
        }
      }
    }
  }

  private triggerDeath(reason: DeathReason): void {
    this.deathReason = reason;
    this.state = 'GAME_OVER';
  }

  private triggerPortalWarp(): void {
    const warpDistance = 350; // +7m
    const targetAltitude = this.altitudePx + warpDistance;

    // Guarantee a safe landing zone without holes
    this.generator.addSafeZone(targetAltitude, 100);

    this.altitudePx = targetAltitude;
    this.bar.worldY = this.altitudePx;
    this.portalsUsed++;
    this.portalWarpAnimation = 0.7; // Visual flash burst
    this.shieldTimer = 2.0; // 2 seconds of invulnerability shield after warp!

    // Reset ball velocity for stable re-entry
    this.ball.velocity = 0;
  }

  public get stats(): GameStats {
    return {
      altitudeMeters: Math.floor(this.altitudePx / this.config.pixelsPerMeter),
      bestAltitudeMeters: Math.floor(this.bestAltitudePx / this.config.pixelsPerMeter),
      deathReason: this.deathReason,
      portalsUsed: this.portalsUsed,
      timeElapsed: Math.floor(this.timeElapsed),
      shieldTimer: this.shieldTimer,
      isShieldActive: this.shieldTimer > 0,
      countdownTimer: this.countdownTimer,
      countdownSeconds: Math.ceil(this.countdownTimer),
    };
  }

  public get floorGap(): number {
    return Math.max(0, this.altitudePx - this.floorAltitudePx);
  }
}
