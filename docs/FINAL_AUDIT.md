# Final project audit — 19 November 2026

## Result

Production build, lint, and 47 automated checks pass. Both the development page and local production preview returned HTTP 200, as did all 12 generated assets (JavaScript, CSS, models, graph data, and WebAssembly). The dependency audit reports zero known advisories after updating Vite from 5.4.21 to 7.3.8 and the affected source-map dependency. A package lock now records the resolved dependency versions. This is a local software audit, not a claim that every browser/device combination has been physically tested.

## Confirmed issues fixed

- Settings now pauses gameplay; keyboard shortcuts cannot activate the game behind dialogs or override normal button/input keyboard actions. Shift changes no longer strand an A/D key in the pressed set.
- Window focus loss clears held inputs and pauses an active run. Background tabs and unfocused windows block automatic starts.
- The game engine is initialized once instead of constructing and generating unused levels on every React render.
- Concurrent camera requests share one permission request. Stopping/unmounting cancels late camera acquisition, and a disconnected stream updates the UI and pauses a camera-controlled run.
- Missing secure-context camera access gives a useful error. MediaPipe initialization errors are retained when enabling the camera.
- Portal safe zones also clear hazards in already-generated landing rows. Warp altitude records update immediately.
- Session high scores retain actual warp bonuses instead of being reconstructed from best altitude alone.
- Sector promotion/shield bonuses reset correctly for each new run.
- Physics substeps prevent a fast ball from crossing a complete hole between slow render frames.
- Settings keeps keyboard focus within the dialog, with a stable close handler that avoids repeatedly resetting focus during tracking updates.

## Automated coverage

- Automatic 3–2–1 starts, countdown cancellation, dialog blocking, and no automatic resume/restart after pause/game over.
- Single-palm calibration, steering direction for either hand, translation independence, dropout grace, and tracking-loss pause conditions.
- Phone sensor calibration/rotation, denied permissions, readiness timeouts, and invalid readings.
- Camera StrictMode startup, cleanup while WASM initializes, duplicate start requests, pending-request cancellation, and unsupported camera environments.
- Portal landing safety, shield grace, repeat-run promotions, high-score retention, fast-ball collisions, sorted level rows, safe slot counts, and milestone gateways.
- Desktop/mobile markup and proportional viewport geometry at several phone aspect ratios; overlapping touch pointers and focus-loss cleanup.

## Validation limits

Browser automation could not reliably identify the current Chrome URL in this environment. Therefore the UI checks are rendered markup and layout calculations, not browser screenshots or simulated live-camera end-to-end tests. Earlier user screenshots and play feedback established the reviewed layouts; the final lifecycle fixes still require the short real-device smoke test below.

No live webcam frames, audio output, physical motion sensor, network throttling, assistive technology, or actual Android/iOS device was exercised automatically. npm audit is a point-in-time advisory check, not a guarantee of security.

## Real-device smoke test before sharing

| Surface | Check | Status |
|---|---|---|
| Desktop Chrome/Edge | Camera permission; both hands; calibration; one full countdown; steering; open-palm pause; keyboard fallback | User verification needed |
| Android Chrome | One palm; portrait/landscape rotation; touch; camera revoke/re-enable; phone tilt; pause/resume | User verification needed |
| iPhone Safari | HTTPS camera/motion permissions; safe-area sizing; rotation; denied-permission fallback; audio after a tap | User verification needed |
| Any device | Leave/return to tab; Settings/Help during play; restart after death; mute preferences after reload | User verification needed |
| Hosted production build | Model assets load from the same origin, WASM MIME type and compression work, first-load state clears | Hosting verification needed |

## Optional follow-up suggestions

1. Persist high score/best altitude to localStorage if records should survive reloads.
2. Offer a low-effects mode for older phones; the current renderer includes particles, glow, and lava effects.
3. Add a short desktop/mobile demonstration video and a LICENSE file matching the MIT statement in the README before distributing the source.

The desktop checkpoint `6fb00a2` was pushed to `origin/main` before committing the final mobile and reliability changes locally. No hosting deployment was performed.
