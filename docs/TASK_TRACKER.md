# Skyward Roll — Task Tracker (v1, solo)

> Status values: `[ ]` Not Started · `[~]` In Progress · `[x]` Done · `[!]` Blocked

---

## Pre-Coding Checklist

| # | Task | Status | Notes |
|---|---|---|---|
| P0 | React + Vite project scaffolded | `[x]` | |
| P1 | MediaPipe Hands wired to webcam, landmarks logged to console | `[x]` | Confirm tracking works before building anything on top of it |
| P2 | Git repo initialized | `[x]` | Initialized on main branch |
| P3 | Folder structure created | `[x]` | `src/components`, `src/game`, `src/hooks`, `src/input`, `src/utils` |

---

## Phase 1 — Tilt Input Pipeline
> Dependency: P1 complete

| # | Task | Status | Notes |
|---|---|---|---|
| 1.1 | Raw tilt angle calc from hand landmarks | `[x]` | `calculateRawTilt()` — sign convention: right hand lower → positive |
| 1.2 | Calibration window | `[x]` | `Calibrator` — ~60 frames neutral hold, game locked until done |
| 1.3 | EMA smoothing | `[x]` | `EMASmoother`, start alpha ≈ 0.15 |
| 1.4 | Dead zone | `[x]` | `applyDeadZone()`, ~1.5° |
| 1.5 | End-to-end debug view | `[x]` | On-screen numeric angle readout to verify pipeline before physics is attached |

---

## Phase 2 — Core Physics
> Dependency: Phase 1 complete

| # | Task | Status | Notes |
|---|---|---|---|
| 2.1 | Ball entity — position, velocity | `[x]` | `Ball` entity with position along bar and velocity |
| 2.2 | Bar entity — angle, position | `[x]` | Fed by smoothed tilt angle |
| 2.3 | Gravity projection | `[x]` | `accel = GRAVITY * sin(tiltAngle)` |
| 2.4 | Damping/friction | `[x]` | `velocity *= (1 - DAMPING)`, start ≈ 0.02/frame |
| 2.5 | Edge clamping | `[x]` | Clamp position + zero velocity at bar bounds, no bounce for v1 |
| 2.6 | Hole collision (fall-through) | `[x]` | Ball position overlapping a hole slot → death |

---

## Phase 3 — Level Generation & Hazards
> Dependency: Phase 2 complete

| # | Task | Status | Notes |
|---|---|---|---|
| 3.1 | Chunk-based bar spawner | `[x]` | Fixed-width segments spawned above current top |
| 3.2 | Hole placement + guaranteed-path rule | `[x]` | 20–30% of slots; no chunk fully blocked |
| 3.3 | Portal placement + warp logic | `[x]` | ~10% chance per chunk |
| 3.4 | Rising floor | `[x]` | Independent world-y tracker; death when floor-y ≥ ball-y |
| 3.5 | Camera scroll | `[x]` | Follows ball/bar upward |

---

## Phase 4 — Game Loop & Minimal UI
> Dependency: Phase 3 complete

| # | Task | Status | Notes |
|---|---|---|---|
| 4.1 | Game states | `[x]` | Calibration → Playing → Game Over |
| 4.2 | Death triggers wired | `[x]` | Hole fall-through + rising floor both route to Game Over state |
| 4.3 | Basic HUD | `[x]` | Altitude readout, floor distance, best altitude |
| 4.4 | Restart flow | `[x]` | Back to calibration or straight to Playing |

---

## Phase 5 — Testing & Tuning
> Dependency: Phase 4 complete

| # | Task | Status | Notes |
|---|---|---|---|
| 5.1 | Tilt responsiveness check | `[x]` | Dead zone tuned to 1.2°, EMA alpha 0.18, rotational bar lerp eliminating jitter |
| 5.2 | Physics tuning pass | `[x]` | Solid sphere rolling inertia `(5/7)*g*sin(theta)`, static friction, surface spin |
| 5.3 | Level generation validation | `[x]` | Portal safe landing zones + guaranteed safe path rule enforced |
| 5.4 | Full playthrough & gestures | `[x]` | True 2D hole collision, 2s warp shield, open palm pause gesture + keyboard fallback |

---

## Progress Summary

| Phase | Total Tasks | Done |
|---|---|---|
| Pre-Coding | 4 | 4 |
| Phase 1 | 5 | 5 |
| Phase 2 | 6 | 6 |
| Phase 3 | 5 | 5 |
| Phase 4 | 4 | 4 |
| Phase 5 | 4 | 4 |
| **Total** | **28** | **28** |
