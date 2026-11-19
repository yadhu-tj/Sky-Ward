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
  - Automatic neutral posture calibration followed by a full 3–2–1 start countdown.
  - Single-hand open palm pause gesture recognition with grace lockout.
  - Anti-spike protection and angular slew-rate guards to prevent sudden bar snaps.
- **Realistic Mechanical Rolling Physics**:
  - Inclined plane rolling inertia with solid sphere mechanics (\(\frac{5}{7} g \sin\theta\)).
  - Edge interaction: gentle bumper bounce on shallow tilts, steep-tilt (>12°) edge slip and fall-off.
  - Sinking ball animations and molten lava splashes on hazard impact.
- **Procedural Level Generation & Atmospheric Sectors**:
  - Chunk-based obstacle spawning with a minimum number of safe slots per row.
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

| Mode | Steering | Start / pause |
|---|---|---|
| Desktop camera | Raise/lower two hands to tilt the bar | Hold both hands level to calibrate; automatically counts 3–2–1. One open palm or Space pauses/resumes. |
| Mobile camera | Show one upright palm and lean it left/right; hand height does not steer | Hold still to calibrate, then automatic 3–2–1. Use the on-screen Pause button. Prolonged tracking loss pauses the game. |
| Phone tilt | Tilt the device left/right; Zero Level resets neutral | Choose Phone Tilt and tap Start. iOS requests motion permission. Missing readings switch the selection to Touch. |
| Touch | Hold a screen side or the left/right thumb buttons | Tap Start; use on-screen Pause/Resume. |
| Keyboard | Left/Right arrows or A/D | Space or P pauses/resumes; R restarts; C recalibrates camera controls. |

If tracking is lost during an automatic countdown, the game waits and starts again from 3 after tracking returns. Open dialogs and background tabs block automatic starts. Help and Settings pause an active run.

---

## 🛠️ Tech Stack & Architecture

- **Frontend Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite 7](https://vitejs.dev/) + [Oxlint](https://oxc.rs/)
- **Computer Vision**: [@mediapipe/hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) + Camera Utils
- **Graphics & Rendering**: HTML5 2D Canvas with animation-frame rendering and physics substeps for slow frames
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

- [Node.js](https://nodejs.org/) (20.19+ or 22.12+; Node 24 is also supported)
- A working webcam for motion controls (or use keyboard fallback)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yadhu-tj/Sky-Ward.git
   cd Sky-Ward
   ```

2. Install dependencies:
   ```bash
   npm ci
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

## Verification and sharing

```bash
npm test
npm run lint
npm run build
npm audit
```

`npm run preview` serves the production build locally. Deploy the **entire `dist/` directory**, including its model and WebAssembly assets, to a static host with **HTTPS**. No API key or backend is required. Camera frames are processed locally in the browser; gameplay does not upload them.

MediaPipe runtime files are bundled from the installed package rather than fetched from a third-party CDN. First startup still downloads and compiles the selected runtime/model; phones use the lighter model. The UI shows loading until tracking processes its first frame.

Camera and motion APIs require a secure context on supported browsers. A plain HTTP LAN address is not equivalent to `localhost` for phone permissions. Configure the host to serve `.wasm` as `application/wasm`; serve `.tflite`, `.data`, and `.binarypb` as binary assets. Cache hashed assets, with gzip/Brotli compression where supported. Do not use the development server as public production hosting.

High scores and best altitude currently last for the open game session. Audio preferences are saved in browser storage. The procedural generator guarantees safe slots per row; it does not prove a physically reachable path through every possible sequence.

See [the final audit](docs/FINAL_AUDIT.md) for validation scope and remaining real-device checks.

---

## 📄 License

MIT License. Designed and developed by [Yadhu](https://github.com/yadhu-tj).
