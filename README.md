# Sky-Ward (Skyward Roll)

> **Motion-Controlled Endless Arcade Survival**  
> A fast-paced reimagining of the classic 1983 Taito arcade game *Ice Cold Beer*, powered by real-time webcam computer vision and modern mechanical physics.

---

## 🎮 Overview

In **Sky-Ward**, the player uses natural webcam hand gestures to balance and steer a horizontal mechanical bar carrying a rolling tungsten ball. As the bar ascends through dangerous obstacle chunks, the player must navigate past deadly counter-bored apertures, escape a rising molten lava hazard floor, and ride teleporting warp portals into higher atmospheric sectors.

---

## ✨ Features

- **Computer Vision Gesture Steering**:
  - Real-time hand landmark tracking via **MediaPipe Hands**.
  - Differential vertical height tracking (\(Y_{\text{right}} - Y_{\text{left}}\)) providing precise, low-fatigue tilt control.
  - Automatic neutral posture calibration with 3-second countdown lock.
  - Single-hand open palm pause gesture recognition with grace lockout.
  - Anti-spike protection and angular slew-rate guards to prevent sudden bar snaps.
- **Realistic Mechanical Rolling Physics**:
  - Inclined plane rolling inertia with solid sphere mechanics (\(\frac{5}{7} g \sin\theta\)).
  - Edge interaction: gentle bumper bounce on shallow tilts, steep-tilt (>12°) edge slip and fall-off.
  - Sinking ball animations and molten lava splashes on hazard impact.
- **Procedural Level Generation & Atmospheric Sectors**:
  - Chunk-based obstacle spawning with guaranteed-path solvability.
  - Progressive sector difficulty (Lower Silo, Intermediate Shaft, Upper Ascent, Stratospheric Gate).
  - Physical milestone gateway arches with safe breathing corridors between sectors.
  - Teleporting warp portals with visual burst animations and temporary invulnerability shield grace periods.
- **Luxury Avionics & Arcade Telemetry Cockpit**:
  - Unified landscape cockpit layout with flight instruments.
  - Real-time altitude gauges, rising floor proximity tracker, velocity vector display, and hand lock status.
  - Built-in interactive *How To Play* modal and debug telemetry toggle.
  - Keyboard fallback controls (`ArrowLeft` / `ArrowRight` / `Space` / `R`) for full accessibility.

---

## 🕹️ Controls

| Control | Motion Gesture | Keyboard Fallback |
|---|---|---|
| **Steer Left** | Lower left hand / Raise right hand | `ArrowLeft` or `A` |
| **Steer Right** | Lower right hand / Raise left hand | `ArrowRight` or `D` |
| **Neutral / Level** | Hold hands level at chest height | Release keys |
| **Pause / Resume** | Show single open palm to camera | `Space` |
| **Recalibrate** | Click *Recalibrate* or hold level stance | `C` |
| **Restart Game** | Click *Restart Flight* button | `R` |

---

## 🛠️ Tech Stack & Architecture

- **Frontend Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite 5](https://vitejs.dev/) + [Oxlint](https://oxc.rs/)
- **Computer Vision**: [@mediapipe/hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) + Camera Utils
- **Graphics & Rendering**: High-performance HTML5 2D Canvas (60 FPS optimized, zero garbage allocation per frame)
- **Styling**: Responsive modular CSS with aerospace avionics aesthetics

```
skyward-roll/
├── docs/                             # Design specs, task trackers, test reports
│   ├── Skyward_Roll_Game_Design.md   # Core design specification
│   ├── TASK_TRACKER.md               # Phased development tracker
│   └── test-progression/             # Test logs and telemetry screenshots
├── public/                           # Static assets
└── src/
    ├── components/
    │   ├── HowToPlayModal.tsx        # Interactive guide & gestures reference
    │   ├── LandscapeCockpit.tsx      # Avionics cockpit HUD & telemetry instruments
    │   ├── TiltDebugView.tsx         # Real-time angle readout & tuning stats
    │   └── Webcam.tsx                # Video feed with landmark tracking overlay
    ├── game/
    │   ├── GameCanvas.tsx            # HTML5 Canvas renderer (bar, ball, hazards, lava)
    │   ├── GameEngine.ts             # State machine, world generation, collision logic
    │   ├── levelGenerator.ts         # Sector definitions, gateway rows, safe zones
    │   └── physics.ts                # Angular acceleration, damping, edge slip physics
    ├── hooks/
    │   └── useMediaPipeHands.ts      # MediaPipe lifecycle, 30fps throttle, anti-swap tracking
    ├── input/
    │   └── tiltController.ts         # Calibrator, EMA smoothing, slew limiter, posture lock
    ├── App.tsx                       # Root application container & mode orchestration
    └── main.tsx                      # Application entrypoint
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ recommended)
- A working webcam for motion controls (or use keyboard fallback)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yadhu-tj/Sky-Ward.git
   cd Sky-Ward
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

5. Run linting:
   ```bash
   npm run lint
   ```

---

## 📄 License

MIT License. Designed and developed by [Yadhu](https://github.com/yadhu-tj).
