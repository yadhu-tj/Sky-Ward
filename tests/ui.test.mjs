import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(path, replacements = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(output, { exports, require: (name) => replacements[name] ?? require(name) });
  return exports;
}
const { Webcam } = load('../src/components/Webcam.tsx');
const { LandscapeCockpit } = load('../src/components/LandscapeCockpit.tsx', { './Webcam': { Webcam } });
const trackerStartup = load('../src/components/TrackerStartup.tsx');
const viewport = load('../src/game/viewport.ts');
const touchSteering = load('../src/input/touchSteering.ts');
const { GameCanvas } = load('../src/game/GameCanvas.tsx', { './soundEffects': { soundEffects: {} }, './viewport': viewport, '../components/TrackerStartup': trackerStartup, '../input/touchSteering': touchSteering });
const engine = { state: 'CALIBRATING', stats: {}, ball: { x: 350 }, bar: { angleRad: 0 }, floorGap: 380 };
const props = { engine, tiltAngleRad: 0, isCalibrated: false, onStartGame() {}, onSkipCalibrationAndStart() {}, onRestart() {}, onTogglePause() {} };

test('desktop start retains the arcade tutorial and offers keyboard and camera', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, { ...props, controlMode: 'KEYBOARD' }));
  assert.match(html, /SKYWARD ROLL/);
  assert.match(html, /CATCH WARPS/);
  assert.match(html, /Keyboard/);
  assert.match(html, /Camera/);
  assert.doesNotMatch(html, /Phone tilt|QUICK PLAY|MANUAL/);
  assert.equal((html.match(/class="btn-start"/g) ?? []).length, 1);
});

test('phone start offers touch, phone tilt and camera controls', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, { ...props, isMobile: true, controlMode: 'TOUCH' }));
  assert.match(html, /Touch/);
  assert.match(html, /Phone tilt/);
  assert.match(html, /Camera/);
  assert.doesNotMatch(html, />Keyboard</);
});

test('camera preview reports waiting for hands without implying recording', () => {
  const html = renderToStaticMarkup(React.createElement(Webcam, { state: { isHandTrackingActive: false }, cameraActive: true }));
  assert.match(html, /Waiting for hands/);
  assert.doesNotMatch(html, /REC 60FPS|Calibrated/);
});

test('pregame sidebar retains the tilt instrument and hides score and pause', () => {
  const html = renderToStaticMarkup(React.createElement(LandscapeCockpit, {
    engine, state: {}, controlMode: 'HAND_CAM', isKeyboardSteering: false,
  }));
  assert.match(html, /TILT-O-METER/);
  assert.doesNotMatch(html, /Pause game|HI-SCORE|flight-stats/);
});

for (const [width, height] of [[320, 520], [390, 640], [430, 720], [844, 280], [667, 210]]) {
  test(`mobile viewport fills ${width}x${height} with proportional world coordinates`, () => {
    const view = viewport.mobileViewport(width, height);
    assert.ok(Math.abs(view.width / view.height - width / height) < 0.01);
    assert.ok(view.width >= 780);
    assert.ok(view.height >= 420);
    const barY = viewport.barScreenY(view.height, true);
    // At maximum 25 degree tilt, both ends of the 700px bar remain visible.
    const halfVerticalSpan = 350 * Math.sin(25 * Math.PI / 180);
    assert.ok(barY - halfVerticalSpan > 0);
    assert.ok(barY + halfVerticalSpan < view.height - 68);
    assert.equal(view.height - 68 - barY, 163);
  });
}

test('desktop viewport keeps its original camera position', () => {
  assert.equal(viewport.barScreenY(660, false), 429);
});

test('mobile game exposes its telemetry and touch buttons during a run', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, {
    ...props, engine: { ...engine, state: 'PLAYING', stats: { sectorLevel: 1, altitudeMeters: 12, portalsUsed: 2, sectorProgress: 0.4 } },
    isMobile: true, controlMode: 'TOUCH', onTouchTilt() {},
  }));
  assert.match(html, /aria-label="Flight status"/);
  assert.match(html, /aria-label="Pause game"/);
  assert.match(html, /aria-label="Tilt left"/);
  assert.match(html, /aria-label="Tilt right"/);
});

test('overlapping thumbs preserve the remaining direction when one is released', () => {
  const touch = new touchSteering.TouchSteering();
  assert.equal(touch.press(1, -1), -1);
  assert.equal(touch.press(2, 1), 1);
  assert.equal(touch.release(2), -1);
  assert.equal(touch.release(2), -1);
  assert.equal(touch.release(1), 0);
});

test('focus loss clears all held touch pointers', () => {
  const touch = new touchSteering.TouchSteering();
  touch.press(1, -1);
  touch.clear();
  assert.equal(touch.release(1), 0);
});

test('mobile camera setup teaches one-hand tilt with an inline preview', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, { ...props, isMobile: true, controlMode: 'HAND_CAM' }));
  assert.match(html, /TILT ONE HAND/);
  assert.match(html, /mobile-setup-preview/);
  assert.match(html, /Show your other palm/);
  assert.doesNotMatch(html, /Show one open palm to pause|Raise your hands|CATCH WARPS/);
});

test('tracking-loss pause requests a visible hand before resuming', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, {
    ...props, engine: { ...engine, state: 'PAUSED' }, isMobile: true, controlMode: 'HAND_CAM', trackingLostPause: true,
  }));
  assert.match(html, /HAND TRACKING LOST/);
  assert.match(html, /Show your hand, then tap Resume/);
  assert.doesNotMatch(html, /Hold single palm/);
});

test('mobile help describes one palm and button pause', () => {
  const { HowToPlayModal } = load('../src/components/HowToPlayModal.tsx');
  const html = renderToStaticMarkup(React.createElement(HowToPlayModal, { isOpen: true, isMobile: true, debugState: {}, onClose() {} }));
  assert.match(html, /Lean your hand left or right/);
  assert.match(html, /Tap Pause/);
  assert.doesNotMatch(html, /hold both hands|DUAL HANDS/);
});

test('mobile camera distinguishes tracker loading from waiting for a hand', () => {
  const html = renderToStaticMarkup(React.createElement(GameCanvas, {
    ...props, isMobile: true, controlMode: 'HAND_CAM', cameraActive: true, handTrackingReady: false,
  }));
  assert.match(html, /LOADING TRACKER/);
  assert.match(html, /Loading hand tracking/);
  assert.doesNotMatch(html, /Show one upright palm/);
});


test('high score retains warp bonuses from an earlier run', () => {
  const html = renderToStaticMarkup(React.createElement(LandscapeCockpit, {
    engine: { ...engine, state: 'GAME_OVER', stats: { altitudeMeters: 0, portalsUsed: 0, bestAltitudeMeters: 7, bestScore: 120 } },
    state: {}, controlMode: 'KEYBOARD', isKeyboardSteering: false,
  }));
  assert.match(html, /000120/);
});


test('startup shows real download progress and an immediate keyboard fallback', () => {
  const html = renderToStaticMarkup(React.createElement(trackerStartup.TrackerStartup, {
    progress: { stage: 'downloading', startedAt: 1, completed: 2, total: 6 }, mobile: false, onFallback() {},
  }));
  assert.match(html, /Downloading hand tracking/);
  assert.match(html, /2\/6 files/);
  assert.match(html, /Play with Keyboard/);
});


test('startup animation begins at thirty without promising seconds', () => {
  const html = renderToStaticMarkup(React.createElement(trackerStartup.TrackerStartup, {
    progress: { stage: 'preparing', startedAt: 1, completed: 6, total: 6 }, mobile: false, onFallback() {},
  }));
  assert.match(html, />30</);
  assert.doesNotMatch(html, />30s</);
  assert.match(html, /tracker-fallback/);
});
