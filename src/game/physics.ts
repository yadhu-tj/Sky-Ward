export interface Ball {
  x: number; // Position along bar (0 to barWidth)
  radius: number;
  velocity: number; // px/s along the bar
  rotationRad: number; // Visual surface roll rotation in radians
  isFalling: boolean;
  fallProgress: number; // 0 to 1 during fall animation
  fallTargetX?: number; // Visual hole center X
  fallTargetY?: number; // Visual hole center Y
}

export interface Hole {
  id: string;
  startX: number;
  endX: number;
  isPortal?: boolean;
  worldY?: number;
}

export interface Bar {
  width: number;
  height: number;
  worldY: number;
  angleRad: number;
  targetAngleRad: number; // For smooth angular interpolation
  holes: Hole[];
}

export interface PhysicsConfig {
  gravity: number; // px/s^2 (e.g. 900)
  damping: number; // per frame at 60fps
  maxVelocity: number; // px/s
  staticFrictionAngleRad: number; // below this angle, low speeds stop rolling
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 880,
  damping: 0.018,
  maxVelocity: 1100,
  staticFrictionAngleRad: 0.018, // ~1.0 degree threshold for static friction
};

export type CollisionResult =
  | { type: 'NONE' }
  | { type: 'HOLE'; hole: Hole }
  | { type: 'PORTAL'; portal: Hole }
  | { type: 'EDGE'; edge: 'LEFT' | 'RIGHT' };

/**
 * Updates ball physics for a single time step with realistic rolling sphere inertia.
 */
export function updateBallPhysics(
  ball: Ball,
  bar: Bar,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  dt: number = 1 / 60
): CollisionResult {
  // If ball is in falling animation, progress the fall
  if (ball.isFalling) {
    ball.fallProgress = Math.min(1, ball.fallProgress + dt / 0.4); // 400ms fall animation
    ball.velocity = 0;
    return { type: 'NONE' };
  }

  // 1. Realistic rolling sphere acceleration on incline:
  // For a solid sphere rolling without slipping: a = (5/7) * g * sin(theta)
  const rollingFactor = 5 / 7;
  const sinAngle = Math.sin(bar.angleRad);
  const accel = config.gravity * rollingFactor * sinAngle;

  ball.velocity += accel * dt;

  // 2. Rolling resistance & damping
  const dampingFactor = Math.pow(Math.max(0, 1 - config.damping), dt * 60);
  ball.velocity *= dampingFactor;

  // 3. Static friction at near-flat incline:
  // If the bar is nearly level and velocity is low, stop creeping
  if (Math.abs(bar.angleRad) < config.staticFrictionAngleRad && Math.abs(ball.velocity) < 25) {
    ball.velocity *= 0.85;
    if (Math.abs(ball.velocity) < 2) {
      ball.velocity = 0;
    }
  }

  // 4. Max velocity clamp
  if (Math.abs(ball.velocity) > config.maxVelocity) {
    ball.velocity = Math.sign(ball.velocity) * config.maxVelocity;
  }

  // 5. Position update & surface roll rotation
  const displacement = ball.velocity * dt;
  ball.x += displacement;
  ball.rotationRad += displacement / ball.radius;

  // 6. Edge clamping with slight mechanical bounce absorption
  let collisionResult: CollisionResult = { type: 'NONE' };

  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.velocity = -ball.velocity * 0.12; // subtle cushion bounce
    if (Math.abs(ball.velocity) < 5) ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'LEFT' };
  } else if (ball.x + ball.radius > bar.width) {
    ball.x = bar.width - ball.radius;
    ball.velocity = -ball.velocity * 0.12;
    if (Math.abs(ball.velocity) < 5) ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'RIGHT' };
  }

  return collisionResult;
}
