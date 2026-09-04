export interface Ball {
  x: number; // Position along bar (0 to barWidth)
  radius: number;
  velocity: number; // px/s along the bar
  isFalling: boolean;
  fallSpeed: number;
}

export interface Hole {
  id: string;
  startX: number;
  endX: number;
  isPortal?: boolean;
}

export interface Bar {
  width: number;
  height: number;
  worldY: number;
  angleRad: number;
  holes: Hole[];
}

export interface PhysicsConfig {
  gravity: number; // px/s^2 (e.g. 900)
  damping: number; // per frame at 60fps (e.g. 0.02)
  maxVelocity: number; // px/s
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 900,
  damping: 0.02,
  maxVelocity: 1200,
};

export type CollisionResult =
  | { type: 'NONE' }
  | { type: 'HOLE'; hole: Hole }
  | { type: 'PORTAL'; portal: Hole }
  | { type: 'EDGE'; edge: 'LEFT' | 'RIGHT' };

/**
 * Updates ball physics for a single time step on a tilted bar.
 */
export function updateBallPhysics(
  ball: Ball,
  bar: Bar,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  dt: number = 1 / 60
): CollisionResult {
  if (ball.isFalling) {
    ball.fallSpeed += config.gravity * dt;
    return { type: 'NONE' };
  }

  // 1. Tangential acceleration from gravity projection:
  // a = GRAVITY * sin(tiltAngle)
  // Positive tilt -> right side dips down -> sin(angle) > 0 -> acceleration > 0 (rightwards)
  const accel = config.gravity * Math.sin(bar.angleRad);
  ball.velocity += accel * dt;

  // 2. Damping / Friction
  // Normalized for dt (assuming 60fps base)
  const dampingFactor = Math.pow(Math.max(0, 1 - config.damping), dt * 60);
  ball.velocity *= dampingFactor;

  // 3. Max velocity clamp
  if (Math.abs(ball.velocity) > config.maxVelocity) {
    ball.velocity = Math.sign(ball.velocity) * config.maxVelocity;
  }

  // 4. Position update
  ball.x += ball.velocity * dt;

  // 5. Edge clamping (no bounce for v1)
  let collisionResult: CollisionResult = { type: 'NONE' };

  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'LEFT' };
  } else if (ball.x + ball.radius > bar.width) {
    ball.x = bar.width - ball.radius;
    ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'RIGHT' };
  }

  // 6. Hole collision check (ball center inside hole bounds)
  for (const hole of bar.holes) {
    // Check if ball center falls inside hole
    if (ball.x >= hole.startX && ball.x <= hole.endX) {
      if (hole.isPortal) {
        return { type: 'PORTAL', portal: hole };
      } else {
        ball.isFalling = true;
        ball.velocity = 0;
        return { type: 'HOLE', hole };
      }
    }
  }

  return collisionResult;
}
