import { LevelGenerator } from './levelGenerator';
import type { ChunkRow } from './levelGenerator';
import { updateBallPhysics, DEFAULT_PHYSICS_CONFIG } from './physics';
import type { Ball, Bar, PhysicsConfig } from './physics';

export type GameState = 'CALIBRATING' | 'READY' | 'PLAYING' | 'GAME_OVER';

export type DeathReason = 'HOLE_FALL' | 'RISING_FLOOR' | null;

export interface GameStats {
  altitudeMeters: number;
  bestAltitudeMeters: number;
  deathReason: DeathReason;
  portalsUsed: number;
  timeElapsed: number;
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
  public portalWarpAnimation: number = 0; // cooldown timer for visual effect

  private generator: LevelGenerator;
  private config: GameEngineConfig;

  constructor(config: Partial<GameEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.generator = new LevelGenerator({ barWidth: this.config.barWidth });

    this.ball = {
      x: this.config.barWidth / 2,
      radius: this.config.ballRadius,
      velocity: 0,
      isFalling: false,
      fallSpeed: 0,
    };

    this.bar = {
      width: this.config.barWidth,
      height: this.config.barHeight,
      worldY: 0,
      angleRad: 0,
      holes: [],
    };

    this.reset();
  }

  public reset(): void {
    this.ball = {
      x: this.config.barWidth / 2,
      radius: this.config.ballRadius,
      velocity: 0,
      isFalling: false,
      fallSpeed: 0,
    };

    this.bar = {
      width: this.config.barWidth,
      height: this.config.barHeight,
      worldY: 0,
      angleRad: 0,
      holes: [],
    };

    this.altitudePx = 0;
    this.floorAltitudePx = -this.config.floorInitialGap;
    this.deathReason = null;
    this.portalsUsed = 0;
    this.timeElapsed = 0;
    this.portalWarpAnimation = 0;

    // Reset level generator and generate initial buffer of obstacle rows
    this.generator.reset(100);
    this.rows = this.generator.generateUpTo(1500, []);
  }

  public startGame(): void {
    this.reset();
    this.state = 'PLAYING';
  }

  public setTiltAngle(angleRad: number): void {
    this.bar.angleRad = angleRad;
  }

  public update(dt: number): void {
    if (this.state !== 'PLAYING') {
      return;
    }

    this.timeElapsed += dt;

    if (this.portalWarpAnimation > 0) {
      this.portalWarpAnimation = Math.max(0, this.portalWarpAnimation - dt);
    }

    // 1. Ascent progression
    // Current altitude meters
    const currentMeters = this.altitudePx / this.config.pixelsPerMeter;
    const speedMultiplier = 1 + (currentMeters / 100) * 0.15; // gradual speedup
    const currentAscentSpeed = this.config.initialAscentSpeed * speedMultiplier;
    this.altitudePx += currentAscentSpeed * dt;
    this.bar.worldY = this.altitudePx;

    if (this.altitudePx > this.bestAltitudePx) {
      this.bestAltitudePx = this.altitudePx;
    }

    // 2. Rising floor progression
    const floorSpeed =
      (this.config.floorBaseSpeed + (currentMeters / 100) * this.config.floorAcceleration) * speedMultiplier;
    this.floorAltitudePx += floorSpeed * dt;

    // Rising floor death condition: floor catches up to bar
    if (this.floorAltitudePx >= this.altitudePx) {
      this.triggerDeath('RISING_FLOOR');
      return;
    }

    // 3. Populate rows ahead
    this.rows = this.generator.generateUpTo(this.altitudePx + 1200, this.rows);

    // Prune rows far below the rising floor
    this.rows = this.rows.filter((r) => r.worldY > this.floorAltitudePx - 200);

    // 4. Identify active holes from rows intersecting the bar's current altitude
    // Bar has a vertical thickness. If any row is within +/- 15px of altitude, check collision
    const barAltitude = this.altitudePx;
    const activeRow = this.rows.find((r) => Math.abs(r.worldY - barAltitude) < 18);

    if (activeRow) {
      this.bar.holes = activeRow.slots.map((s) => ({
        id: `${activeRow.id}-${s.slotIndex}`,
        startX: s.startX,
        endX: s.endX,
        isPortal: s.isPortal,
      }));
    } else {
      this.bar.holes = [];
    }

    // 5. Update ball physics
    const collision = updateBallPhysics(this.ball, this.bar, this.config.physicsConfig, dt);

    if (collision.type === 'HOLE') {
      this.triggerDeath('HOLE_FALL');
    } else if (collision.type === 'PORTAL') {
      this.triggerPortalWarp();
    }
  }

  private triggerDeath(reason: DeathReason): void {
    this.deathReason = reason;
    this.state = 'GAME_OVER';
  }

  private triggerPortalWarp(): void {
    // Warp altitude forward
    const warpDistance = 350;
    this.altitudePx += warpDistance;
    this.bar.worldY = this.altitudePx;
    this.portalsUsed++;
    this.portalWarpAnimation = 0.6; // 600ms visual warp burst

    // Reset ball velocity to avoid flying off
    this.ball.velocity = 0;
  }

  public get stats(): GameStats {
    return {
      altitudeMeters: Math.floor(this.altitudePx / this.config.pixelsPerMeter),
      bestAltitudeMeters: Math.floor(this.bestAltitudePx / this.config.pixelsPerMeter),
      deathReason: this.deathReason,
      portalsUsed: this.portalsUsed,
      timeElapsed: Math.floor(this.timeElapsed),
    };
  }

  public get floorGap(): number {
    return Math.max(0, this.altitudePx - this.floorAltitudePx);
  }
}
