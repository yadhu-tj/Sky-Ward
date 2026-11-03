# Mobile Support & Responsive Arcade Experience

Complete architectural and UX plan to bring **Skyward Roll** to mobile smartphones and tablets across both portrait and landscape orientations, supporting phone gyroscope tilt, touch steering, and front-camera hand tracking with intelligent space allocation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Summary of Confirmed User Decisions**:
> 1. **Primary Mobile Control Flow**: Support front-camera hand tracking for players with propped-up phones, while seamlessly defaulting to physical phone tilt (Gyroscope / Accelerometer) or touch controls when holding the phone in hand.
> 2. **Orientation Strategy**: Support **both Portrait and Landscape** mobile orientations with fluid responsive layouts.
> 3. **Camera Display on Mobile Screens**: Solve the small-screen space constraint by using an intelligent collapsible/Picture-in-Picture (PiP) camera monitor when camera tracking is active, and collapsing it to 0px when using gyroscope or touch steering to maximize playfield visibility.

---

## 1. Overview & Core Concept

### What It Delivers
Enables players on iPhone, Android, and tablets to play *Skyward Roll* with zero vertical overflow or squishing, offering two distinct physical playstyles:
- **Handheld Playstyle (Gyroscope Tilt & Touch)**: Hold the phone with two hands like a steering wheel. Tilting the device physically left and right tilts the retro bar in real-time with sub-millisecond gyro responsiveness.
- **Tabletop / Stand Playstyle (Front Camera Hand Tracking)**: Prop the phone on a desk or kickstand. The front selfie camera tracks dual hand gestures and palm pause just like on desktop, with a compact PiP viewfinder.

### Key Value
Extends the game from a desktop-only webcam experience into a universal mobile web application that feels like a native handheld retro arcade console (Game Boy / Atari Lynx vibe).

---

## 2. User Experience & Visual Design

### A. Layout Adaptations (Portrait vs. Landscape)

#### 1. Mobile Portrait (375px – 430px width, ~667px – 932px height)
```
┌───────────────────────────────────────┐
│ ★ SKYWARD ROLL ★    [🎵] [🔊] [MENU]   │  <- Compact 44px top header
├───────────────────────────────────────┤
│                                       │
│                                       │
│          RETRO PLAYFIELD              │  <- Auto-scaled 1:1.15 Canvas
│       (Ball, Bar, Lava Lake)          │     Centered, responsive width
│                                       │
│                                       │
├───────────────────────────────────────┤
│ [MODE: GYRO 📱] [TOUCH 👆] [CAM 📷]  │  <- 44px Segmented Control
├───────────────────────────────────────┤
│ [◄ ROLL LEFT]   TILT-O-METER  [RIGHT ►]│  <- Ergonomic Thumb Touch Pads
│ SCORE: 004820   HI: 009240   STAGE 02 │  <- Compact 3-Column Stats
│ [📷 Viewfinder mini-strip if Cam ON]  │  <- Collapsible PiP drawer
└───────────────────────────────────────┘
```
- **Thumb Zone Ergonomics**: Bottom 35% of the screen is dedicated to the mobile control deck and thumb touch targets ($\ge 44\text{px}$ touch targets).
- **Camera Space Allocation**:
  - In **Gyro** or **Touch** mode: Camera viewport is collapsed to 0px height, giving 100% of remaining height to the playfield and scoreboard.
  - In **Camera** mode: A dedicated, compact 95px PiP viewfinder strip opens at the bottom with translucent retro frosted glass, showing hand tracking reticles without obscuring the ball.

#### 2. Mobile Landscape (667px – 932px width, 375px – 430px height)
```
┌─────────────────────────────────────────────────────────────┐
│ ★ SKYWARD ROLL ★                    [🎵] [🔊] [CAM] [⛶]      │
├───────────────────────────────┬─────────────────────────────┤
│                               │ [MODE: GYRO 📱 | CAM 📷]   │
│         PLAYFIELD             │ [TILT-O-METER & BALANCE]    │
│      (Dynamic Height)         │ SCORE: 004820  STAGE 01     │
│                               │ [Compact Cam View (110px)]  │
└───────────────────────────────┴─────────────────────────────┘
```
- Fits side-by-side using dynamic flex row and auto-scale (`clamp(0.5, scale, 1.0)`), guaranteeing zero page scrolling.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Mobile Sensor Priority (Gyro vs. Camera)
- **Chosen Approach**: Auto-detect mobile devices. On mobile, present a clean 3-way mode switch: `📱 GYRO TILT` (Default for handheld), `📷 HAND CAM` (For propped phones), and `👆 TOUCH`.
- **Rationale**: Trying to track hands while physically holding a phone leads to shaky camera tracking and finger obstruction. Gyroscope allows immediate, immersive steering the second a mobile player picks up their device.
- **iOS Permission Gate**: Modern iOS Safari requires a user gesture to grant `DeviceOrientationEvent.requestPermission()`. We trigger this via a styled arcade `"CALIBRATE GYRO & PLAY"` prompt.

### Decision 2: Camera Space Allocation on Mobile
- **Chosen Approach**: Dynamic Viewfinder Mode.
  - When in Hand Cam mode: Display a compact 95px–110px Picture-in-Picture (PiP) camera monitor with gesture lock indicators.
  - When in Gyro or Touch mode: Completely hide the video element to reclaim valuable vertical real estate.

### Decision 3: Canvas Coordinate Normalization
- **Chosen Approach**: Keep internal game logic and physics at native `780x660` coordinate space, and use responsive CSS `aspect-ratio: 780/660` + width constraints with high-DPI canvas scaling (`window.devicePixelRatio`).
- **Rationale**: Physics, collision hitboxes, and obstacle spacing remain 100% consistent across desktop and mobile; players on mobile get identical gameplay physics.

---

## 4. Technical Architecture & Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                          App.tsx                            │
│  - useWindowDimensions / Orientation Detection (Portrait/Land)│
│  - Device Sensor Manager (Gyroscope / Hands / Touch fallback)│
│  - Dynamic Scale Calculation                                │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│        GameCanvas.tsx        │ │   LandscapeCockpit.tsx /    │
│ - Responsive aspect ratio    │ │     MobileCockpit.tsx       │
│ - High-DPI canvas backing    │ │ - Gyroscope permission card │
│ - Dual touch pad overlay     │ │ - Collapsible PiP Webcam    │
│ - 60fps retro physics loop   │ │ - Compact arcade scoreboard │
└──────────────────────────────┘ └─────────────────────────────┘
               ▲
               │ Gyro Angle (rad) / Hand Angle / Touch Angle
┌──────────────┴───────────────┐
│    useDeviceOrientation.ts   │
│ - iOS permission handshake   │
│ - Gamma tilt smoothing & EMA │
│ - Deadzone & clamp [-30°,30°]│
└──────────────────────────────┘
```

---

## 5. Implementation Phases (Planned Execution)

1. **Step 1: Gyroscope & Mobile Sensor Hook (`src/hooks/useDeviceOrientation.ts`)**
   - Create a robust device orientation listener for Android (`deviceorientation` event) and iOS Safari (`DeviceOrientationEvent.requestPermission`).
   - Map phone roll/tilt ($\gamma$ axis) into normalized radians with deadzone filtering, EMA smoothing, and max-tilt limits.

2. **Step 2: Responsive Stage & Viewport Breakpoints (`src/App.css` & `src/App.tsx`)**
   - Replace fixed `1260px` container styling with responsive CSS media queries (`@media (max-width: 900px)`).
   - In portrait, stack Playfield vertically above the mobile arcade deck.
   - In landscape, scale side-by-side using CSS container queries and scale factors.

3. **Step 3: Compact Mobile Cockpit & PiP Camera (`src/components/LandscapeCockpit.tsx` & `src/components/Webcam.tsx`)**
   - Add a mobile mode selector tab (`📱 GYRO`, `📷 HAND CAM`, `👆 TOUCH`).
   - Conditionally collapse webcam when gyro/touch mode is active.
   - Format score counters and stage indicators into compact 3-column rows.

4. **Step 4: On-Screen Touch Steer & Calibrate Buttons**
   - Add responsive left/right touch buttons at the bottom edge for direct thumb steering.
   - Add a one-tap `"CALIBRATE LEVEL"` button to reset neutral phone tilt angle anytime the player changes seating position.

5. **Step 5: Testing & Verification**
   - Test portrait (375x812, 412x915) and landscape viewports (812x375).
   - Verify camera permission, gyroscope permission, and touch responsiveness with zero console errors.
