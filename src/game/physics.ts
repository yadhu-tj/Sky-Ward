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
  gravity: 1350,
  damping: 0.0035, // Crisp metallic rolling instead of viscous fluid drag
  maxVelocity: 1400,
  staticFrictionAngleRad: 0.012, // ~0.7 degree threshold
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

  // 2. Realistic rolling friction: constant subtle deceleration opposing motion
  const rollingFriction = 36; // px/s^2 constant deceleration
  if (Math.abs(ball.velocity) > 0) {
    const frictionDecel = Math.min(Math.abs(ball.velocity), rollingFriction * dt);
    ball.velocity -= Math.sign(ball.velocity) * frictionDecel;
  }

  // 3. Subtle air drag
  const dampingFactor = Math.pow(Math.max(0, 1 - config.damping), dt * 60);
  ball.velocity *= dampingFactor;

  // 4. Static friction at near-flat incline
  if (Math.abs(bar.angleRad) < config.staticFrictionAngleRad && Math.abs(ball.velocity) < 12) {
    ball.velocity = 0;
  }

  // 5. Max velocity clamp
  if (Math.abs(ball.velocity) > config.maxVelocity) {
    ball.velocity = Math.sign(ball.velocity) * config.maxVelocity;
  }

  // 6. Position update & surface roll rotation
  const displacement = ball.velocity * dt;
  ball.x += displacement;
  ball.rotationRad += displacement / ball.radius;

  // 7. Edge clamping with crisp mechanical bounce
  let collisionResult: CollisionResult = { type: 'NONE' };

  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.velocity = -ball.velocity * 0.32; // crisp mechanical bounce
    if (Math.abs(ball.velocity) < 8) ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'LEFT' };
  } else if (ball.x + ball.radius > bar.width) {
    ball.x = bar.width - ball.radius;
    ball.velocity = -ball.velocity * 0.32;
    if (Math.abs(ball.velocity) < 8) ball.velocity = 0;
    collisionResult = { type: 'EDGE', edge: 'RIGHT' };
  }

  return collisionResult;
}
