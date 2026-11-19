# Tracking startup stages and replacement assessment

The loading screen now measures actual asset downloads before asking MediaPipe to initialize. Downloads are requested in parallel and use the browser cache. The original runtime filenames, gzip encoding, and versioned cache paths remain intact.

Stages are: download tracker files, prepare runtime/model, enable camera (if necessary), check first frame, ready. File progress counts completed files, not bytes; no synthetic percentage or estimated completion time is shown. A one-click Touch/Keyboard fallback is available throughout loading. After 15 seconds the screen explicitly suggests that fallback. The existing 30-second slow-start message remains.

Once the first frame returns, the browser console prints `[Sky-Ward tracker startup]` with `downloadMs`, `prepareMs`, `cameraWaitMs`, `firstFrameMs`, and `totalMs`. Camera wait is separated from first-frame inference so time spent answering permission prompts is not mistaken for processing time. Total includes that user wait. Measurements stay in the browser; nothing is uploaded.

## Newer runtime assessment

Google's current web Hand Landmarker guide documents `@mediapipe/tasks-vision`, VIDEO mode, and `detectForVideo`. It also states that web tasks execute synchronously and recommends requestAnimationFrame scheduling to inspect only the latest frame. Source checked 19 November 2026: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

A newer runtime is a reasonable candidate, but changing libraries alone does not remove model downloads, WASM compilation, GPU setup, or synchronous inference. The current two-hand identity assignment, palm pause gesture, one-palm mobile calibration, and countdown logic depend on the existing landmark contract.

Recommendation: benchmark a separate Tasks Vision adapter against the timing values now exposed, preserving the existing game/control interface. Evaluate a Web Worker/OffscreenCanvas or transferable frame path where supported, with a main-thread fallback; moving work off the UI thread can improve responsiveness but is not a guarantee of faster model initialization. Verify worker/GPU behavior on Android Chrome and iPhone Safari before making it the default. The production runtime has not been swapped without that comparison.

A fallback control choice cannot abort a WebAssembly compilation already in progress on the main thread. A worker-based implementation would allow that work to be terminated independently. Device measurements are still needed to establish whether the remaining delay is downloading, compilation/model setup, or first-frame inference.
