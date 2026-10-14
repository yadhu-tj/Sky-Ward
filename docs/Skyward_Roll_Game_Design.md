# Skyward Roll: Motion-Controlled Endless Arcade

## Project Overview
**Skyward Roll** is a fast-paced, motion-controlled survival reimagining of the classic 1983 Taito arcade game *Ice Cold Beer*. Instead of physical dual joysticks, the player uses real-time hand gestures captured via webcam to steer a horizontal bar, keeping a rolling ball safe from hazards while escaping a rising floor.

---

## Core Gameplay Mechanics

### 1. Motion & Tilt Control System
- **Automatic Ascent:** The bar automatically moves upward at a constant or accelerating speed.
- **Pure Tilt Dynamics:** Player control is limited exclusively to the **angle/tilt** of the bar — a single input axis, chosen deliberately to keep gesture control precise and low-fatigue.
- **Hand Differential Tracking:** MediaPipe tracks the relative vertical height ($Y$) of both hands:

  $$\text{Tilt Angle} = \arctan\left(\frac{Y_{\text{right}} - Y_{\text{left}}}{\text{Hand Distance}}\right)$$

- **Ergonomic Neutral Belt:** Players keep their hands at a comfortable chest/waist level, avoiding shoulder fatigue during longer play sessions.

### 2. Coordinate Conventions
- **Screen/world y-axis:** y increases **downward**, matching both canvas rendering and MediaPipe's normalized landmark output ($y=0$ top of frame, $y=1$ bottom).
- **Sign of tilt:** With $Y_{\text{right}} - Y_{\text{left}}$, if the right hand is lower on screen than the left, $Y_{\text{right}} > Y_{\text{left}}$, giving a **positive** tilt angle.
- **Positive tilt → bar's right side dips down → ball accelerates in +x (rightward).** This matches the intuitive real-world case: lower your right hand, the tray tips right, the ball rolls right.
- **Negative tilt** (left hand lower) → ball accelerates in −x (leftward).

### 3. Physics Model
The bar is a rigid line the ball rolls along; gravity is **world-relative** (a constant downward vector, not affected by tilt), and the bar's angle determines how much of that gravity projects into horizontal acceleration — standard inclined-plane physics, capped naturally by the trig function:

```
tangential_acceleration = GRAVITY * sin(tiltAngleRadians)
velocity += tangential_acceleration * deltaTime
velocity *= (1 - DAMPING)          // friction/damping, applied every frame
position += velocity * deltaTime
```

- **Gravity:** world-relative, constant magnitude (`GRAVITY`, tunable — start around 900 px/s²). Tilt never changes gravity itself, only how much of it converts to sideways motion.
- **Friction / damping:** velocity is multiplied by `(1 - DAMPING)` each frame (start `DAMPING ≈ 0.02` at 60fps, i.e. ~2%/frame decay). This keeps the ball from feeling frictionless/icy and lets tilt read as "steering" rather than a pure physics sim. An optional `MAX_VELOCITY` clamp prevents overshoot near edges and holes.
- **Bar edges:** ball position is clamped to the bar's horizontal bounds; velocity is zeroed on contact (no bounce) for v1. A restitution-based bounce (e.g. `velocity *= -0.3`) is a possible v2 polish item, but clamp-and-stop is simpler to reason about for instant-death tuning.

### 4. Rising Floor Behavior
- The floor is a solid hazard boundary tracked by its own **world-y position**, rising at a constant or per-level-accelerating rate — independent of the ball's position.
- The camera scrolls to keep the ball/bar in frame, but the floor's world-y also climbs underneath, closing the gap if the player doesn't ascend fast enough.
- **Death trigger:** floor's world-y ≥ ball's world-y → instant game over.
- Rate scaling: floor rise speed increases per level (e.g. +10% per level) to ramp difficulty alongside hole density.

### 5. Failure Conditions (Instant Death)
- **Normal Holes:** falling through a gap in the bar is instant **Game Over** (nothing catches the ball below — it's claimed by the rising floor).
- **Rising Hazard Floor:** floor world-y catching up to the ball's world-y is instant **Game Over**.

### 6. Teleporting Portals (Shortcuts)
- **Warp Mechanics:** rolling into a portal instantly moves the ball and bar a set distance further **upward**.
- **Risk vs. Reward:** portals require precise maneuvering near hazards to reach, in exchange for a quick altitude gain.
- *(Deferred to post-v1: whether portals add a downside beyond difficulty of reach.)*

### 7. Level Generation Rules
- The bar is generated in **chunks** as the ball climbs — each chunk is a fixed world-width segment spawned above the current top of the level.
- Each chunk is divided into a fixed number of slots (e.g. 5–8); a random subset become holes (start around 20–30% of slots).
- **Guaranteed path rule:** validate at generation time that no chunk is fully blocked — holes may not span more than `MAX_HOLE_WIDTH` consecutive slots, so a safe route always exists.
- **Portals:** rare, e.g. ~10% chance per chunk that one hole slot is a portal instead of a plain hole.
- **Difficulty scaling:** hole density and floor rise speed both increase per level (e.g. +5% hole density, +10% floor speed per level) to keep pace with the altitude goal.

### 8. Progression & Levels
- **Altitude Goal:** levels are cleared by climbing a target vertical distance (e.g., 50 meters).
- **Level Progression:** completing a level briefly pauses the scroll, giving the player a rest break before the next, faster stage begins.

---

## Input Reliability (Calibration + Smoothing)
Raw MediaPipe landmarks jitter frame-to-frame, and instant-death mechanics make that jitter feel unfair if left unhandled. Two layers fix this:

- **Pre-Game Calibration Window:** before the game starts, the player holds a neutral hand position for ~1 second (60 frames) while the camera records baseline hand angle. This offset is subtracted from all future readings, so the game adapts to the player's natural resting posture instead of assuming perfectly level hands. The game does not start until calibration completes.
- **EMA Smoothing:** each frame's tilt angle is blended with the previous smoothed value (exponential moving average) rather than used raw, removing frame-to-frame noise while staying responsive.
- **Dead Zone:** angles within a small threshold (~1.5°) of neutral are treated as flat, preventing micro-jitter from registering as unintended tilt.

*(Reference implementation: `tiltController.js` — `Calibrator`, `EMASmoother`, `applyDeadZone`.)*

---

## Technical Architecture

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework & UI** | React + Vite | Web app structure, state management, HUD, and menu overlays. |
| **Vision Tracking** | MediaPipe Hands | High-efficiency 2D landmark detection directly from an HTML5 `<video>` webcam stream. |
| **Game Engine** | HTML5 Canvas / PixiJS | Hardware-accelerated rendering for smooth 60 FPS scrolling and physics calculations. |
| **Physics** | Custom lightweight 2D loop | Ball-on-tilting-bar physics, gravity, and hole collision (see Physics Model above) — simple enough that a small custom loop is easier to tune for instant-death precision than a general-purpose engine like Matter.js. |

---

## System Requirements & Considerations
- **Webcam:** Standard 720p or 1080p camera operating at 30+ FPS.
- **Session Length:** Level structures capped at 45–60 seconds per stage to manage hand fatigue.

---

## V1 Scope
**In scope for v1:**
- Core tilt control loop: calibration → smoothing → dead zone → gameplay
- Custom lightweight physics (ball, gravity, tilt response, edge clamping, hole collision)
- Chunk-based level generation with guaranteed-path rule
- Rising floor with world-y death trigger
- Minimal functional UI (no polish pass yet)

**Deferred to post-v1:**
- UI/UX polish (visual design, HUD, menus, transitions)
- Scoring, best-altitude tracking, run-summary screen
- Portal risk/reward tuning beyond basic warp
- Edge-bounce physics (restitution) instead of clamp-and-stop
